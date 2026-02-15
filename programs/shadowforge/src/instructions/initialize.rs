use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::error::ShadowForgeError;
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = VaultConfig::LEN,
        seeds = [VAULT_CONFIG_SEED],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(mint::token_program = token_2022_program)]
    pub shielded_mint: InterfaceAccount<'info, Mint>,

    #[account(mint::token_program = token_2022_program)]
    pub secondary_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Treasury for protocol fees
    pub treasury: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [SHIELDED_VAULT_SEED, shielded_mint.key().as_ref()],
        bump,
        token::mint = shielded_mint,
        token::authority = vault_config,
        token::token_program = token_2022_program,
    )]
    pub shielded_vault_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub deposit_fee_bps: u16,
    pub withdrawal_fee_bps: u16,
    pub lending_fee_bps: u16,
    pub swap_fee_bps: u16,
    pub bridge_fee_bps: u16,
    pub initial_yield_bps: u16,
    pub compliance_required: bool,
    pub enable_arcium: bool,
    pub enable_shadowwire: bool,
    pub enable_anoncoin: bool,
    pub enable_privacy_cash: bool,
    pub enable_silentswap: bool,
    pub enable_starpay: bool,
    pub enable_range: bool,
}

impl Default for InitializeParams {
    fn default() -> Self {
        Self {
            deposit_fee_bps: 10,
            withdrawal_fee_bps: 10,
            lending_fee_bps: 50,
            swap_fee_bps: 30,
            bridge_fee_bps: 25,
            initial_yield_bps: 500,
            compliance_required: false,
            enable_arcium: true,
            enable_shadowwire: true,
            enable_anoncoin: true,
            enable_privacy_cash: true,
            enable_silentswap: true,
            enable_starpay: true,
            enable_range: true,
        }
    }
}

pub fn handler(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(
        params.deposit_fee_bps <= MAX_BASIS_POINTS,
        ShadowForgeError::InvalidMintConfig
    );
    require!(
        params.withdrawal_fee_bps <= MAX_BASIS_POINTS,
        ShadowForgeError::InvalidMintConfig
    );

    let vault_config = &mut ctx.accounts.vault_config;
    let clock = Clock::get()?;

    vault_config.admin = ctx.accounts.admin.key();
    vault_config.treasury = ctx.accounts.treasury.key();
    vault_config.shielded_mint = ctx.accounts.shielded_mint.key();
    vault_config.secondary_mint = ctx.accounts.secondary_mint.key();

    vault_config.arcium_enabled = params.enable_arcium;
    vault_config.shadowwire_enabled = params.enable_shadowwire;
    vault_config.anoncoin_enabled = params.enable_anoncoin;
    vault_config.privacy_cash_enabled = params.enable_privacy_cash;
    vault_config.silentswap_enabled = params.enable_silentswap;
    vault_config.starpay_enabled = params.enable_starpay;
    vault_config.range_enabled = params.enable_range;

    vault_config.deposit_fee_bps = params.deposit_fee_bps;
    vault_config.withdrawal_fee_bps = params.withdrawal_fee_bps;
    vault_config.lending_fee_bps = params.lending_fee_bps;
    vault_config.swap_fee_bps = params.swap_fee_bps;
    vault_config.bridge_fee_bps = params.bridge_fee_bps;

    vault_config.current_yield_bps = params.initial_yield_bps;
    vault_config.total_shielded_tvl = 0;
    vault_config.total_positions = 0;

    vault_config.is_paused = false;
    vault_config.emergency_mode = false;
    vault_config.compliance_required = params.compliance_required;

    vault_config.initialized_at = clock.unix_timestamp;
    vault_config.last_yield_update = clock.unix_timestamp;
    vault_config.bump = ctx.bumps.vault_config;

    msg!("ShadowForge initialized: admin={}", vault_config.admin);

    Ok(())
}
