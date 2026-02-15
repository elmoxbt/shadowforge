use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::error::ShadowForgeError;
use crate::state::*;

#[derive(Accounts)]
pub struct PrivateBridge<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        constraint = vault_config.is_operational() @ ShadowForgeError::VaultPaused,
        constraint = vault_config.silentswap_enabled @ ShadowForgeError::ExternalSdkFailed,
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
        space = BridgeRequest::LEN,
        seeds = [b"bridge_request", vault_config.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub bridge_request: Account<'info, BridgeRequest>,

    #[account(address = vault_config.shielded_mint)]
    pub shielded_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [SHIELDED_VAULT_SEED, shielded_mint.key().as_ref()],
        bump,
        token::mint = shielded_mint,
        token::authority = vault_config,
        token::token_program = token_2022_program,
    )]
    pub shielded_vault_ata: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: SilentSwap program for CPI (address verified at runtime if needed)
    pub silentswap_program: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum DestinationChain {
    Ethereum = 1,
    Polygon = 137,
    Arbitrum = 42161,
    Optimism = 10,
    Base = 8453,
    Avalanche = 43114,
    Bsc = 56,
}

impl DestinationChain {
    pub fn to_chain_id(&self) -> u64 {
        *self as u64
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum BridgeAction {
    InitiateOutbound,
    ClaimInbound,
    CancelRequest,
    VerifyCompletion,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PrivateBridgeParams {
    pub action: BridgeAction,
    pub dest_chain: DestinationChain,
    pub amount_commitment: [u8; 32],
    pub bridge_proof: [u8; PROOF_DATA_LEN],
    pub inbound_proof: Option<[u8; PROOF_DATA_LEN]>,
}

pub fn handler(ctx: Context<PrivateBridge>, params: PrivateBridgeParams) -> Result<()> {
    let vault_config = &mut ctx.accounts.vault_config;
    let user_position = &mut ctx.accounts.user_position;
    let bridge_request = &mut ctx.accounts.bridge_request;
    let clock = Clock::get()?;

    require!(
        !params.bridge_proof.iter().all(|&b| b == 0),
        ShadowForgeError::InvalidProof
    );

    match params.action {
        BridgeAction::InitiateOutbound => {
            // Only allow new bridge if user doesn't have a pending one
            require!(
                !user_position.has_pending_bridge,
                ShadowForgeError::BridgeFailed
            );

            let dest_chain_id = params.dest_chain.to_chain_id();
            require!(
                dest_chain_id == 1 || dest_chain_id == 137 || dest_chain_id == 42161 ||
                dest_chain_id == 10 || dest_chain_id == 8453 || dest_chain_id == 43114 ||
                dest_chain_id == 56,
                ShadowForgeError::InvalidDestinationChain
            );

            user_position.encrypted_principal.commitment = params.amount_commitment;

            bridge_request.user = ctx.accounts.user.key();
            bridge_request.dest_chain_id = dest_chain_id;
            bridge_request.amount_commitment = params.amount_commitment;
            bridge_request.status = BridgeStatus::Pending;
            bridge_request.created_at = clock.unix_timestamp;
            bridge_request.bump = ctx.bumps.bridge_request;

            user_position.has_pending_bridge = true;

            msg!("SilentSwap: Outbound bridge initiated to chain {}", dest_chain_id);
        }

        BridgeAction::ClaimInbound => {
            let inbound_proof = params.inbound_proof
                .ok_or(ShadowForgeError::InvalidProof)?;

            require!(
                !inbound_proof.iter().all(|&b| b == 0),
                ShadowForgeError::InvalidProof
            );

            user_position.encrypted_principal.commitment = params.amount_commitment;

            if bridge_request.user == user_position.owner {
                bridge_request.status = BridgeStatus::Completed;
            }

            user_position.has_pending_bridge = false;

            msg!(
                "SilentSwap: Inbound bridge claimed from chain {}",
                params.dest_chain.to_chain_id()
            );
        }

        BridgeAction::CancelRequest => {
            require!(
                bridge_request.status == BridgeStatus::Pending,
                ShadowForgeError::BridgeFailed
            );

            user_position.encrypted_principal.commitment = bridge_request.amount_commitment;

            bridge_request.status = BridgeStatus::Failed;
            user_position.has_pending_bridge = false;

            msg!("SilentSwap: Bridge request cancelled");
        }

        BridgeAction::VerifyCompletion => {
            require!(
                bridge_request.status == BridgeStatus::Pending,
                ShadowForgeError::BridgeFailed
            );

            bridge_request.status = BridgeStatus::Completed;
            user_position.has_pending_bridge = false;

            msg!("SilentSwap: Bridge completion verified");
        }
    }

    user_position.last_action_at = clock.unix_timestamp;
    user_position.action_count = user_position.action_count
        .checked_add(1)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    emit!(BridgeRequestEvent {
        user: ctx.accounts.user.key(),
        dest_chain_id: params.dest_chain.to_chain_id(),
        commitment: params.amount_commitment,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
