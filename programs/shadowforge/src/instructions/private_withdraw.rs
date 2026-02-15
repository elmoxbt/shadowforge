use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TransferChecked, transfer_checked};

use crate::error::ShadowForgeError;
use crate::state::*;

#[derive(Accounts)]
pub struct PrivateWithdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        constraint = vault_config.is_operational() @ ShadowForgeError::VaultPaused,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        seeds = [USER_POSITION_SEED, vault_config.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == user.key() @ ShadowForgeError::InvalidAuthority,
        constraint = !user_position.has_active_loan @ ShadowForgeError::LoanNotFound,
        constraint = !user_position.has_pending_bridge @ ShadowForgeError::BridgeFailed,
    )]
    pub user_position: Account<'info, UserEncryptedPosition>,

    #[account(
        mut,
        token::mint = shielded_mint,
        token::authority = user,
        token::token_program = token_2022_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [SHIELDED_VAULT_SEED, shielded_mint.key().as_ref()],
        bump,
        token::mint = shielded_mint,
        token::authority = vault_config,
        token::token_program = token_2022_program,
    )]
    pub shielded_vault_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(address = vault_config.shielded_mint)]
    pub shielded_mint: InterfaceAccount<'info, Mint>,

    pub compliance_attestation: Option<Account<'info, ComplianceAttestation>>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum WithdrawType {
    Partial { amount_commitment: [u8; 32] },
    Full,
    YieldOnly,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PrivateWithdrawParams {
    pub withdraw_type: WithdrawType,
    pub withdrawal_proof: [u8; PROOF_DATA_LEN],
    pub ownership_proof: [u8; PROOF_DATA_LEN],
    pub nullifier: [u8; 32],
    pub expected_amount: u64,
}

pub fn handler(ctx: Context<PrivateWithdraw>, params: PrivateWithdrawParams) -> Result<()> {
    let vault_config = &mut ctx.accounts.vault_config;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;

    if vault_config.compliance_required {
        let compliance = ctx.accounts.compliance_attestation.as_ref()
            .ok_or(ShadowForgeError::KycRequired)?;

        require!(
            compliance.user == ctx.accounts.user.key(),
            ShadowForgeError::ComplianceFailed
        );
        require!(
            compliance.is_valid && compliance.expires_at > clock.unix_timestamp,
            ShadowForgeError::ComplianceExpired
        );
    }

    require!(
        !params.withdrawal_proof.iter().all(|&b| b == 0),
        ShadowForgeError::InvalidProof
    );
    require!(
        !params.ownership_proof.iter().all(|&b| b == 0),
        ShadowForgeError::InvalidProof
    );
    require!(
        !params.nullifier.iter().all(|&b| b == 0),
        ShadowForgeError::InvalidProof
    );

    require!(
        params.nullifier != user_position.nullifier,
        ShadowForgeError::InvalidProof
    );

    let withdrawal_amount = params.expected_amount;

    require!(
        withdrawal_amount >= MIN_DEPOSIT_LAMPORTS,
        ShadowForgeError::MinimumWithdrawalNotMet
    );

    let fee_amount = withdrawal_amount
        .checked_mul(vault_config.withdrawal_fee_bps as u64)
        .ok_or(ShadowForgeError::AmountOverflow)?
        .checked_div(MAX_BASIS_POINTS as u64)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    let net_withdrawal = withdrawal_amount
        .checked_sub(fee_amount)
        .ok_or(ShadowForgeError::AmountUnderflow)?;

    require!(
        ctx.accounts.shielded_vault_ata.amount >= withdrawal_amount,
        ShadowForgeError::InsufficientShieldedBalance
    );

    match &params.withdraw_type {
        WithdrawType::Partial { amount_commitment } => {
            user_position.encrypted_principal.commitment = *amount_commitment;
        }
        WithdrawType::Full => {
            user_position.encrypted_principal = EncryptedAmount::default();
            user_position.encrypted_yield = EncryptedAmount::default();
        }
        WithdrawType::YieldOnly => {
            user_position.encrypted_yield = EncryptedAmount::default();
        }
    }

    user_position.nullifier = params.nullifier;
    user_position.last_action_at = clock.unix_timestamp;
    user_position.withdrawal_count = user_position.withdrawal_count
        .checked_add(1)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    let seeds = &[
        VAULT_CONFIG_SEED,
        &[vault_config.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_2022_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.shielded_vault_ata.to_account_info(),
            mint: ctx.accounts.shielded_mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: vault_config.to_account_info(),
        },
        signer_seeds,
    );
    transfer_checked(
        transfer_ctx,
        net_withdrawal,
        ctx.accounts.shielded_mint.decimals,
    )?;

    vault_config.total_shielded_tvl = vault_config.total_shielded_tvl
        .saturating_sub(withdrawal_amount);

    if user_position.encrypted_principal.is_zero()
        && user_position.encrypted_yield.is_zero()
        && !user_position.has_active_loan
    {
        vault_config.total_positions = vault_config.total_positions.saturating_sub(1);
    }

    emit!(PrivateWithdrawEvent {
        user: ctx.accounts.user.key(),
        nullifier: params.nullifier,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Private withdrawal completed: user={}, nullifier={:?}",
        ctx.accounts.user.key(),
        &params.nullifier[..8]
    );

    Ok(())
}
