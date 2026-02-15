use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, TransferChecked, transfer_checked};

use crate::error::ShadowForgeError;
use crate::state::*;

/// Admin instruction to mock yield distribution for demo purposes
/// Deposits rewards into the vault and updates yield tracking
/// Used for hackathon demonstration of yield accrual
#[derive(Accounts)]
pub struct AdminMockYield<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Vault configuration
    #[account(
        mut,
        seeds = [VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        constraint = vault_config.admin == admin.key() @ ShadowForgeError::Unauthorized,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// Admin's token account (source of reward tokens)
    #[account(
        mut,
        token::mint = shielded_mint,
        token::authority = admin,
        token::token_program = token_2022_program,
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Shielded vault token account (receives rewards)
    #[account(
        mut,
        seeds = [SHIELDED_VAULT_SEED, shielded_mint.key().as_ref()],
        bump,
        token::mint = shielded_mint,
        token::authority = vault_config,
        token::token_program = token_2022_program,
    )]
    pub shielded_vault_ata: InterfaceAccount<'info, TokenAccount>,

    /// Shielded mint
    #[account(address = vault_config.shielded_mint)]
    pub shielded_mint: InterfaceAccount<'info, Mint>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AdminAction {
    /// Deposit reward tokens into vault
    DepositRewards { amount: u64 },
    /// Update yield rate
    UpdateYieldRate { new_rate_bps: u16 },
    /// Pause/unpause vault
    SetPaused { paused: bool },
    /// Toggle emergency mode
    SetEmergencyMode { enabled: bool },
    /// Update fee configuration
    UpdateFees {
        deposit_fee_bps: Option<u16>,
        withdrawal_fee_bps: Option<u16>,
        lending_fee_bps: Option<u16>,
        swap_fee_bps: Option<u16>,
        bridge_fee_bps: Option<u16>,
    },
    /// Toggle SDK features
    ToggleSdk {
        arcium: Option<bool>,
        shadowwire: Option<bool>,
        anoncoin: Option<bool>,
        privacy_cash: Option<bool>,
        silentswap: Option<bool>,
        starpay: Option<bool>,
        range: Option<bool>,
    },
    /// Toggle compliance requirement
    SetComplianceRequired { required: bool },
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AdminMockYieldParams {
    /// Admin action to perform
    pub action: AdminAction,
}

pub fn handler(ctx: Context<AdminMockYield>, params: AdminMockYieldParams) -> Result<()> {
    let vault_config = &mut ctx.accounts.vault_config;
    let clock = Clock::get()?;

    match params.action {
        AdminAction::DepositRewards { amount } => {
            deposit_rewards(
                vault_config,
                &ctx.accounts.admin,
                &ctx.accounts.admin_token_account,
                &ctx.accounts.shielded_vault_ata,
                &ctx.accounts.shielded_mint,
                &ctx.accounts.token_2022_program,
                amount,
            )?;
        }

        AdminAction::UpdateYieldRate { new_rate_bps } => {
            update_yield_rate(vault_config, new_rate_bps, clock.unix_timestamp)?;
        }

        AdminAction::SetPaused { paused } => {
            set_paused(vault_config, paused)?;
        }

        AdminAction::SetEmergencyMode { enabled } => {
            set_emergency_mode(vault_config, enabled)?;
        }

        AdminAction::UpdateFees {
            deposit_fee_bps,
            withdrawal_fee_bps,
            lending_fee_bps,
            swap_fee_bps,
            bridge_fee_bps,
        } => {
            update_fees(
                vault_config,
                deposit_fee_bps,
                withdrawal_fee_bps,
                lending_fee_bps,
                swap_fee_bps,
                bridge_fee_bps,
            )?;
        }

        AdminAction::ToggleSdk {
            arcium,
            shadowwire,
            anoncoin,
            privacy_cash,
            silentswap,
            starpay,
            range,
        } => {
            toggle_sdk_features(
                vault_config,
                arcium,
                shadowwire,
                anoncoin,
                privacy_cash,
                silentswap,
                starpay,
                range,
            )?;
        }

        AdminAction::SetComplianceRequired { required } => {
            set_compliance_required(vault_config, required)?;
        }
    }

    Ok(())
}

/// Deposit reward tokens into the vault for yield distribution
fn deposit_rewards<'info>(
    vault_config: &mut Account<'info, VaultConfig>,
    admin: &Signer<'info>,
    admin_token_account: &InterfaceAccount<'info, TokenAccount>,
    shielded_vault_ata: &InterfaceAccount<'info, TokenAccount>,
    shielded_mint: &InterfaceAccount<'info, Mint>,
    token_program: &Program<'info, Token2022>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ShadowForgeError::InvalidAmount);
    require!(
        admin_token_account.amount >= amount,
        ShadowForgeError::InsufficientShieldedBalance
    );

    // Transfer reward tokens to vault
    let transfer_ctx = CpiContext::new(
        token_program.to_account_info(),
        TransferChecked {
            from: admin_token_account.to_account_info(),
            mint: shielded_mint.to_account_info(),
            to: shielded_vault_ata.to_account_info(),
            authority: admin.to_account_info(),
        },
    );
    transfer_checked(transfer_ctx, amount, shielded_mint.decimals)?;

    // Update vault TVL (rewards increase total value)
    vault_config.total_shielded_tvl = vault_config.total_shielded_tvl
        .checked_add(amount)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    msg!(
        "Admin: Deposited {} reward tokens into vault, new TVL: {}",
        amount,
        vault_config.total_shielded_tvl
    );

    Ok(())
}

/// Update the vault yield rate
fn update_yield_rate(
    vault_config: &mut VaultConfig,
    new_rate_bps: u16,
    current_time: i64,
) -> Result<()> {
    require!(
        new_rate_bps <= 5000, // Max 50% APY
        ShadowForgeError::InvalidAmount
    );

    let old_rate = vault_config.current_yield_bps;
    vault_config.current_yield_bps = new_rate_bps;
    vault_config.last_yield_update = current_time;

    msg!(
        "Admin: Updated yield rate from {} bps to {} bps",
        old_rate,
        new_rate_bps
    );

    Ok(())
}

/// Pause or unpause the vault
fn set_paused(vault_config: &mut VaultConfig, paused: bool) -> Result<()> {
    vault_config.is_paused = paused;

    msg!("Admin: Vault paused = {}", paused);

    Ok(())
}

/// Enable or disable emergency mode
fn set_emergency_mode(vault_config: &mut VaultConfig, enabled: bool) -> Result<()> {
    vault_config.emergency_mode = enabled;

    if enabled {
        // In emergency mode, also pause the vault
        vault_config.is_paused = true;
        msg!("Admin: EMERGENCY MODE ENABLED - vault paused");
    } else {
        msg!("Admin: Emergency mode disabled");
    }

    Ok(())
}

/// Update fee configuration
fn update_fees(
    vault_config: &mut VaultConfig,
    deposit_fee_bps: Option<u16>,
    withdrawal_fee_bps: Option<u16>,
    lending_fee_bps: Option<u16>,
    swap_fee_bps: Option<u16>,
    bridge_fee_bps: Option<u16>,
) -> Result<()> {
    if let Some(fee) = deposit_fee_bps {
        require!(fee <= MAX_BASIS_POINTS, ShadowForgeError::InvalidAmount);
        vault_config.deposit_fee_bps = fee;
        msg!("Admin: Deposit fee updated to {} bps", fee);
    }

    if let Some(fee) = withdrawal_fee_bps {
        require!(fee <= MAX_BASIS_POINTS, ShadowForgeError::InvalidAmount);
        vault_config.withdrawal_fee_bps = fee;
        msg!("Admin: Withdrawal fee updated to {} bps", fee);
    }

    if let Some(fee) = lending_fee_bps {
        require!(fee <= MAX_BASIS_POINTS, ShadowForgeError::InvalidAmount);
        vault_config.lending_fee_bps = fee;
        msg!("Admin: Lending fee updated to {} bps", fee);
    }

    if let Some(fee) = swap_fee_bps {
        require!(fee <= MAX_BASIS_POINTS, ShadowForgeError::InvalidAmount);
        vault_config.swap_fee_bps = fee;
        msg!("Admin: Swap fee updated to {} bps", fee);
    }

    if let Some(fee) = bridge_fee_bps {
        require!(fee <= MAX_BASIS_POINTS, ShadowForgeError::InvalidAmount);
        vault_config.bridge_fee_bps = fee;
        msg!("Admin: Bridge fee updated to {} bps", fee);
    }

    Ok(())
}

/// Toggle SDK feature flags
fn toggle_sdk_features(
    vault_config: &mut VaultConfig,
    arcium: Option<bool>,
    shadowwire: Option<bool>,
    anoncoin: Option<bool>,
    privacy_cash: Option<bool>,
    silentswap: Option<bool>,
    starpay: Option<bool>,
    range: Option<bool>,
) -> Result<()> {
    if let Some(enabled) = arcium {
        vault_config.arcium_enabled = enabled;
        msg!("Admin: Arcium MXE = {}", enabled);
    }

    if let Some(enabled) = shadowwire {
        vault_config.shadowwire_enabled = enabled;
        msg!("Admin: ShadowWire = {}", enabled);
    }

    if let Some(enabled) = anoncoin {
        vault_config.anoncoin_enabled = enabled;
        msg!("Admin: Anoncoin = {}", enabled);
    }

    if let Some(enabled) = privacy_cash {
        vault_config.privacy_cash_enabled = enabled;
        msg!("Admin: Privacy Cash = {}", enabled);
    }

    if let Some(enabled) = silentswap {
        vault_config.silentswap_enabled = enabled;
        msg!("Admin: SilentSwap = {}", enabled);
    }

    if let Some(enabled) = starpay {
        vault_config.starpay_enabled = enabled;
        msg!("Admin: Starpay = {}", enabled);
    }

    if let Some(enabled) = range {
        vault_config.range_enabled = enabled;
        msg!("Admin: Range Compliance = {}", enabled);
    }

    Ok(())
}

/// Set compliance requirement
fn set_compliance_required(vault_config: &mut VaultConfig, required: bool) -> Result<()> {
    vault_config.compliance_required = required;

    msg!("Admin: Compliance required = {}", required);

    Ok(())
}
