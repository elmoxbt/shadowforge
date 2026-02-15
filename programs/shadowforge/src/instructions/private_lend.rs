use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::error::ShadowForgeError;
use crate::state::*;

#[derive(Accounts)]
pub struct PrivateLend<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        constraint = vault_config.is_operational() @ ShadowForgeError::VaultPaused,
        constraint = vault_config.privacy_cash_enabled @ ShadowForgeError::ExternalSdkFailed,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        seeds = [USER_POSITION_SEED, vault_config.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == user.key() @ ShadowForgeError::InvalidAuthority,
    )]
    pub user_position: Account<'info, UserEncryptedPosition>,

    #[account(
        init_if_needed,
        payer = user,
        space = LendingPosition::LEN,
        seeds = [b"lending_position", vault_config.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub lending_position: Account<'info, LendingPosition>,

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

    /// CHECK: Privacy Cash program for CPI (address verified at runtime if needed)
    pub privacy_cash_program: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum LendingAction {
    Borrow {
        collateral_commitment: [u8; 32],
        borrow_commitment: [u8; 32],
    },
    Repay {
        repayment_commitment: [u8; 32],
    },
    AddCollateral {
        amount_commitment: [u8; 32],
    },
    WithdrawCollateral {
        amount_commitment: [u8; 32],
    },
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PrivateLendParams {
    pub action: LendingAction,
    pub interest_rate_bps: u16,
}

pub fn handler(ctx: Context<PrivateLend>, params: PrivateLendParams) -> Result<()> {
    let user_position = &mut ctx.accounts.user_position;
    let lending_position = &mut ctx.accounts.lending_position;
    let clock = Clock::get()?;

    match params.action {
        LendingAction::Borrow { collateral_commitment, borrow_commitment } => {
            require!(!lending_position.is_active, ShadowForgeError::LoanNotFound);

            lending_position.borrower = ctx.accounts.user.key();
            lending_position.encrypted_collateral.commitment = collateral_commitment;
            lending_position.encrypted_borrow.commitment = borrow_commitment;
            lending_position.interest_rate_bps = params.interest_rate_bps;
            lending_position.originated_at = clock.unix_timestamp;
            lending_position.last_accrual_at = clock.unix_timestamp;
            lending_position.liquidation_threshold_bps = 8000;
            lending_position.is_active = true;
            lending_position.bump = ctx.bumps.lending_position;

            user_position.has_active_loan = true;
            user_position.encrypted_yield.commitment = borrow_commitment;

            msg!("Private loan originated");
        }

        LendingAction::Repay { repayment_commitment: _ } => {
            require!(lending_position.is_active, ShadowForgeError::LoanNotFound);

            lending_position.is_active = false;
            user_position.has_active_loan = false;
            user_position.encrypted_yield = EncryptedAmount::default();

            msg!("Private loan repaid");
        }

        LendingAction::AddCollateral { amount_commitment } => {
            require!(lending_position.is_active, ShadowForgeError::LoanNotFound);
            lending_position.encrypted_collateral.commitment = amount_commitment;
            msg!("Collateral added");
        }

        LendingAction::WithdrawCollateral { amount_commitment } => {
            require!(lending_position.is_active, ShadowForgeError::LoanNotFound);
            lending_position.encrypted_collateral.commitment = amount_commitment;
            msg!("Collateral withdrawn");
        }
    }

    user_position.last_action_at = clock.unix_timestamp;
    user_position.action_count = user_position.action_count
        .checked_add(1)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    Ok(())
}
