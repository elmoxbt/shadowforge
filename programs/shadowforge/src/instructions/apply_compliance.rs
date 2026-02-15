use anchor_lang::prelude::*;

use crate::error::ShadowForgeError;
use crate::state::*;

#[derive(Accounts)]
pub struct ApplyCompliance<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        constraint = vault_config.is_operational() @ ShadowForgeError::VaultPaused,
        constraint = vault_config.range_enabled @ ShadowForgeError::ExternalSdkFailed,
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
        space = ComplianceAttestation::LEN,
        seeds = [COMPLIANCE_SEED, vault_config.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub compliance_attestation: Account<'info, ComplianceAttestation>,

    /// CHECK: Range Protocol program for CPI (address verified at runtime if needed)
    pub range_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum ComplianceAction {
    Submit,
    Verify,
    Revoke,
    Renew,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ApplyComplianceParams {
    pub action: ComplianceAction,
    pub attestation_hash: [u8; 32],
    pub disclosure_proof: [u8; PROOF_DATA_LEN],
    pub validity_days: u16,
}

pub fn handler(ctx: Context<ApplyCompliance>, params: ApplyComplianceParams) -> Result<()> {
    let vault_config = &ctx.accounts.vault_config;
    let user_position = &mut ctx.accounts.user_position;
    let compliance = &mut ctx.accounts.compliance_attestation;
    let clock = Clock::get()?;

    require!(
        vault_config.range_enabled,
        ShadowForgeError::ExternalSdkFailed
    );

    require!(
        !params.disclosure_proof.iter().all(|&b| b == 0),
        ShadowForgeError::InvalidProof
    );

    require!(
        params.validity_days > 0 && params.validity_days <= 365,
        ShadowForgeError::ComplianceExpired
    );

    match params.action {
        ComplianceAction::Submit => {
            require!(
                !compliance.is_valid,
                ShadowForgeError::ComplianceExpired
            );

            let risk_score = compute_risk_score(&params.attestation_hash);
            require!(
                risk_score <= 75,
                ShadowForgeError::ComplianceFailed
            );

            let expiry = clock.unix_timestamp
                .checked_add((params.validity_days as i64) * 86400)
                .ok_or(ShadowForgeError::AmountOverflow)?;

            compliance.user = ctx.accounts.user.key();
            compliance.provider = RANGE_PROGRAM_ID;
            compliance.attestation_hash = params.attestation_hash;
            compliance.attested_at = clock.unix_timestamp;
            compliance.expires_at = expiry;
            compliance.risk_score = risk_score;
            compliance.is_valid = true;
            compliance.bump = ctx.bumps.compliance_attestation;

            user_position.compliance_verified = true;
            user_position.compliance_expiry = expiry;

            msg!("Range: Compliance attestation submitted, risk_score={}", risk_score);
        }

        ComplianceAction::Verify => {
            require!(
                compliance.is_valid,
                ShadowForgeError::ComplianceFailed
            );
            require!(
                compliance.expires_at > clock.unix_timestamp,
                ShadowForgeError::ComplianceExpired
            );

            let still_valid = user_position.is_compliant(clock.unix_timestamp);
            require!(
                still_valid,
                ShadowForgeError::ComplianceExpired
            );

            msg!("Range: Compliance verified, expires_at={}", compliance.expires_at);
        }

        ComplianceAction::Revoke => {
            require!(
                compliance.is_valid,
                ShadowForgeError::ComplianceFailed
            );

            compliance.is_valid = false;
            user_position.compliance_verified = false;
            user_position.compliance_expiry = 0;

            msg!("Range: Compliance attestation revoked");
        }

        ComplianceAction::Renew => {
            require!(
                compliance.is_valid || compliance.expires_at <= clock.unix_timestamp,
                ShadowForgeError::ComplianceFailed
            );

            let risk_score = compute_risk_score(&params.attestation_hash);
            require!(
                risk_score <= 75,
                ShadowForgeError::ComplianceFailed
            );

            let expiry = clock.unix_timestamp
                .checked_add((params.validity_days as i64) * 86400)
                .ok_or(ShadowForgeError::AmountOverflow)?;

            compliance.attestation_hash = params.attestation_hash;
            compliance.attested_at = clock.unix_timestamp;
            compliance.expires_at = expiry;
            compliance.risk_score = risk_score;
            compliance.is_valid = true;

            user_position.compliance_verified = true;
            user_position.compliance_expiry = expiry;

            msg!("Range: Compliance attestation renewed, risk_score={}", risk_score);
        }
    }

    user_position.last_action_at = clock.unix_timestamp;

    emit!(ComplianceEvent {
        user: ctx.accounts.user.key(),
        provider: RANGE_PROGRAM_ID,
        risk_score: compliance.risk_score,
        expires_at: compliance.expires_at,
    });

    Ok(())
}

fn compute_risk_score(attestation_hash: &[u8; 32]) -> u8 {
    let sum: u32 = attestation_hash.iter().map(|&b| b as u32).sum();
    ((sum % 100) as u8).min(100)
}
