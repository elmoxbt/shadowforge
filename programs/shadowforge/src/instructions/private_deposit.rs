use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TransferChecked, transfer_checked};

use crate::error::ShadowForgeError;
use crate::state::*;

#[derive(Accounts)]
pub struct PrivateDeposit<'info> {
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
        init_if_needed,
        payer = user,
        space = UserEncryptedPosition::LEN,
        seeds = [USER_POSITION_SEED, vault_config.key().as_ref(), user.key().as_ref()],
        bump
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

    #[account(address = vault_config.shielded_mint @ ShadowForgeError::InvalidMintConfig)]
    pub shielded_mint: InterfaceAccount<'info, Mint>,

    pub compliance_attestation: Option<Account<'info, ComplianceAttestation>>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PrivateDepositParams {
    pub amount: u64,
    pub amount_commitment: [u8; 32],
    pub blinding_factor: [u8; 32],
}

pub fn handler(ctx: Context<PrivateDeposit>, params: PrivateDepositParams) -> Result<()> {
    let vault_config = &mut ctx.accounts.vault_config;
    let user_position = &mut ctx.accounts.user_position;
    let clock = Clock::get()?;

    require!(params.amount >= MIN_DEPOSIT_LAMPORTS, ShadowForgeError::InvalidAmount);

    if vault_config.compliance_required {
        let compliance = ctx.accounts.compliance_attestation.as_ref()
            .ok_or(ShadowForgeError::KycRequired)?;
        require!(compliance.user == ctx.accounts.user.key(), ShadowForgeError::ComplianceFailed);
        require!(
            compliance.is_valid && compliance.expires_at > clock.unix_timestamp,
            ShadowForgeError::ComplianceExpired
        );
    }

    let fee_amount = params.amount
        .checked_mul(vault_config.deposit_fee_bps as u64)
        .ok_or(ShadowForgeError::AmountOverflow)?
        .checked_div(MAX_BASIS_POINTS as u64)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    let net_deposit = params.amount
        .checked_sub(fee_amount)
        .ok_or(ShadowForgeError::AmountUnderflow)?;

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_2022_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.user_token_account.to_account_info(),
            mint: ctx.accounts.shielded_mint.to_account_info(),
            to: ctx.accounts.shielded_vault_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    transfer_checked(transfer_ctx, params.amount, ctx.accounts.shielded_mint.decimals)?;

    let is_new_position = user_position.owner == Pubkey::default();
    if is_new_position {
        user_position.owner = ctx.accounts.user.key();
        user_position.vault = vault_config.key();
        user_position.created_at = clock.unix_timestamp;
        user_position.bump = ctx.bumps.user_position;
        vault_config.total_positions = vault_config.total_positions
            .checked_add(1)
            .ok_or(ShadowForgeError::AmountOverflow)?;
    }

    // Store encrypted position using ElGamal ciphertext format
    // Client generates ciphertext off-chain, we store it
    user_position.encrypted_principal.handle = params.blinding_factor;
    user_position.encrypted_principal.commitment = params.amount_commitment;
    user_position.balance_commitment = params.amount_commitment;
    user_position.last_deposit_at = clock.unix_timestamp;
    user_position.last_action_at = clock.unix_timestamp;
    user_position.deposit_count = user_position.deposit_count
        .checked_add(1)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    vault_config.total_shielded_tvl = vault_config.total_shielded_tvl
        .checked_add(net_deposit)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    emit!(PrivateDepositEvent {
        user: ctx.accounts.user.key(),
        commitment: params.amount_commitment,
        timestamp: clock.unix_timestamp,
    });

    msg!("Private deposit: user={}, amount={}", ctx.accounts.user.key(), params.amount);

    Ok(())
}
