use anchor_lang::prelude::*;

use crate::error::ShadowForgeError;
use crate::state::*;

#[derive(Accounts)]
pub struct AccrueView<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [VAULT_CONFIG_SEED],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        seeds = [USER_POSITION_SEED, vault_config.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == user.key() @ ShadowForgeError::InvalidAuthority,
    )]
    pub user_position: Account<'info, UserEncryptedPosition>,

    /// CHECK: Lending position may not exist
    pub lending_position: Option<Account<'info, LendingPosition>>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AccrueViewResult {
    pub encrypted_total_value: EncryptedAmount,
    pub encrypted_accrued_yield: EncryptedAmount,
    pub encrypted_lending_value: EncryptedAmount,
    pub computation_proof: [u8; PROOF_DATA_LEN],
    pub computed_at: i64,
    pub current_yield_bps: u16,
    pub has_active_loan: bool,
}

pub fn handler(ctx: Context<AccrueView>) -> Result<AccrueViewResult> {
    let vault_config = &ctx.accounts.vault_config;
    let user_position = &ctx.accounts.user_position;
    let clock = Clock::get()?;

    let elapsed_seconds = clock.unix_timestamp
        .checked_sub(vault_config.last_yield_update)
        .ok_or(ShadowForgeError::InvalidTimestamp)?;

    let accrued_yield = calculate_yield_commitment(
        &user_position.encrypted_principal,
        vault_config.current_yield_bps,
        elapsed_seconds,
    );

    let total_value = combine_commitments(
        &user_position.encrypted_principal,
        &accrued_yield,
    );

    let total_with_previous = combine_commitments(
        &total_value,
        &user_position.encrypted_yield,
    );

    let lending_value = if let Some(lending_pos) = &ctx.accounts.lending_position {
        if lending_pos.is_active {
            lending_pos.encrypted_collateral.clone()
        } else {
            EncryptedAmount::default()
        }
    } else {
        EncryptedAmount::default()
    };

    let computation_proof = generate_view_proof(
        &total_with_previous,
        &accrued_yield,
        clock.unix_timestamp,
    );

    msg!(
        "AccrueView: Position computed for user {} at yield rate {} bps",
        ctx.accounts.user.key(),
        vault_config.current_yield_bps
    );

    Ok(AccrueViewResult {
        encrypted_total_value: total_with_previous,
        encrypted_accrued_yield: accrued_yield,
        encrypted_lending_value: lending_value,
        computation_proof,
        computed_at: clock.unix_timestamp,
        current_yield_bps: vault_config.current_yield_bps,
        has_active_loan: user_position.has_active_loan,
    })
}

fn calculate_yield_commitment(
    principal: &EncryptedAmount,
    yield_bps: u16,
    elapsed_seconds: i64,
) -> EncryptedAmount {
    let seconds_per_year: i64 = 31_536_000;
    let elapsed_clamped = elapsed_seconds.min(seconds_per_year) as u64;
    let yield_factor = (yield_bps as u64)
        .saturating_mul(elapsed_clamped)
        .saturating_div(MAX_BASIS_POINTS as u64)
        .saturating_div(seconds_per_year as u64);

    let mut result = EncryptedAmount::default();
    for i in 0..32 {
        result.handle[i] = principal.handle[i].wrapping_add((yield_factor & 0xFF) as u8);
        result.commitment[i] = principal.commitment[i] ^ ((yield_factor >> 8) as u8);
    }
    result
}

fn combine_commitments(a: &EncryptedAmount, b: &EncryptedAmount) -> EncryptedAmount {
    let mut result = EncryptedAmount::default();
    for i in 0..32 {
        result.handle[i] = a.handle[i].wrapping_add(b.handle[i]);
        result.commitment[i] = a.commitment[i] ^ b.commitment[i];
    }
    result
}

fn generate_view_proof(
    total: &EncryptedAmount,
    yield_amount: &EncryptedAmount,
    timestamp: i64,
) -> [u8; PROOF_DATA_LEN] {
    let mut proof = [0u8; PROOF_DATA_LEN];
    let ts_bytes = timestamp.to_le_bytes();
    for i in 0..PROOF_DATA_LEN {
        proof[i] = total.commitment[i % 32]
            ^ yield_amount.commitment[i % 32]
            ^ ts_bytes[i % 8];
    }
    proof
}
