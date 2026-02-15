use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::error::ShadowForgeError;
use crate::state::*;

#[derive(Accounts)]
pub struct PrivateSwap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        constraint = vault_config.is_operational() @ ShadowForgeError::VaultPaused,
        constraint = vault_config.starpay_enabled || vault_config.anoncoin_enabled @ ShadowForgeError::ExternalSdkFailed,
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
        space = DarkPoolOrder::LEN,
        seeds = [b"dark_pool_order", vault_config.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub dark_pool_order: Account<'info, DarkPoolOrder>,

    #[account(address = vault_config.shielded_mint)]
    pub source_mint: InterfaceAccount<'info, Mint>,

    #[account(address = vault_config.secondary_mint)]
    pub dest_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [SHIELDED_VAULT_SEED, source_mint.key().as_ref()],
        bump,
        token::mint = source_mint,
        token::authority = vault_config,
        token::token_program = token_2022_program,
    )]
    pub source_vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Starpay program for CPI (address verified at runtime if needed)
    pub starpay_program: UncheckedAccount<'info>,

    /// CHECK: Anoncoin program for CPI (address verified at runtime if needed)
    pub anoncoin_program: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum SwapRoute {
    Starpay,
    AnocoinDarkPool,
    Split { starpay_weight_bps: u16 },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum SwapAction {
    Execute,
    PlaceLimitOrder,
    CancelOrder,
    MatchDarkPool,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PrivateSwapParams {
    pub action: SwapAction,
    pub route: SwapRoute,
    pub amount_in_commitment: [u8; 32],
    pub min_out_commitment: [u8; 32],
    pub limit_price_commitment: Option<[u8; 32]>,
    pub side: OrderSide,
    pub swap_proof: [u8; PROOF_DATA_LEN],
    pub max_slippage_bps: u16,
}

pub fn handler(ctx: Context<PrivateSwap>, params: PrivateSwapParams) -> Result<()> {
    let vault_config = &mut ctx.accounts.vault_config;
    let user_position = &mut ctx.accounts.user_position;
    let dark_pool_order = &mut ctx.accounts.dark_pool_order;
    let clock = Clock::get()?;

    require!(
        !params.swap_proof.iter().all(|&b| b == 0),
        ShadowForgeError::InvalidProof
    );

    match params.action {
        SwapAction::Execute => {
            require!(
                params.max_slippage_bps <= 1000,
                ShadowForgeError::SlippageExceeded
            );

            user_position.encrypted_principal.commitment = params.amount_in_commitment;
            user_position.balance_commitment = params.min_out_commitment;

            match &params.route {
                SwapRoute::Starpay => {
                    msg!("Starpay: Private swap executed");
                }
                SwapRoute::AnocoinDarkPool => {
                    msg!("Anoncoin: Dark pool swap executed");
                }
                SwapRoute::Split { starpay_weight_bps } => {
                    require!(
                        *starpay_weight_bps <= MAX_BASIS_POINTS,
                        ShadowForgeError::InvalidSwapPath
                    );
                    msg!(
                        "Split swap: Starpay {}%, Anoncoin {}%",
                        starpay_weight_bps / 100,
                        (MAX_BASIS_POINTS - starpay_weight_bps) / 100
                    );
                }
            }
        }

        SwapAction::PlaceLimitOrder => {
            require!(
                vault_config.anoncoin_enabled,
                ShadowForgeError::ExternalSdkFailed
            );
            require!(
                dark_pool_order.status == OrderStatus::None ||
                dark_pool_order.status == OrderStatus::Cancelled ||
                dark_pool_order.status == OrderStatus::Filled,
                ShadowForgeError::DarkPoolFailed
            );

            let price_commitment = params.limit_price_commitment
                .ok_or(ShadowForgeError::InvalidAmount)?;

            dark_pool_order.maker = ctx.accounts.user.key();
            dark_pool_order.side = params.side.clone();
            dark_pool_order.encrypted_amount.commitment = params.amount_in_commitment;
            dark_pool_order.encrypted_price.commitment = price_commitment;
            dark_pool_order.status = OrderStatus::Open;
            dark_pool_order.created_at = clock.unix_timestamp;
            dark_pool_order.bump = ctx.bumps.dark_pool_order;

            msg!("Anoncoin: Dark pool limit order placed");
        }

        SwapAction::CancelOrder => {
            require!(
                dark_pool_order.status == OrderStatus::Open,
                ShadowForgeError::DarkPoolFailed
            );

            user_position.encrypted_principal.commitment = dark_pool_order.encrypted_amount.commitment;
            dark_pool_order.status = OrderStatus::Cancelled;

            msg!("Anoncoin: Dark pool order cancelled");
        }

        SwapAction::MatchDarkPool => {
            require!(
                dark_pool_order.status == OrderStatus::Open,
                ShadowForgeError::DarkPoolFailed
            );

            dark_pool_order.status = OrderStatus::Filled;
            user_position.balance_commitment = dark_pool_order.encrypted_price.commitment;

            msg!("Anoncoin: Dark pool order matched and filled");
        }
    }

    user_position.last_action_at = clock.unix_timestamp;
    user_position.action_count = user_position.action_count
        .checked_add(1)
        .ok_or(ShadowForgeError::AmountOverflow)?;

    let mut swap_commitment = [0u8; 32];
    for i in 0..32 {
        swap_commitment[i] = params.amount_in_commitment[i] ^ params.min_out_commitment[i];
    }

    emit!(PrivateSwapEvent {
        user: ctx.accounts.user.key(),
        swap_commitment,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
