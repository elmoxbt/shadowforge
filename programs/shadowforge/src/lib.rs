use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Brejex6T6bCkvVko2qCSW7LGK93anqEWoiuYs5pfu9oA");

/// ShadowForge: Private DeFi Aggregator for Solana
///
/// A comprehensive privacy-preserving DeFi protocol that integrates:
/// - Arcium MXE for encrypted computation and state
/// - ShadowWire (Radr Labs) for Bulletproofs-based ZK transfers
/// - Anoncoin for confidential tokens and dark pool swaps
/// - Privacy Cash for anonymous lending/borrowing
/// - SilentSwap for non-custodial private cross-chain bridging
/// - Starpay for ZK-private swaps and payments
/// - Range for compliance and selective disclosure
/// - Helius/QuickNode for privacy-aware RPC queries
///
/// Built for the Solana Privacy Hackathon 2025
#[program]
pub mod shadowforge {
    use super::*;

    /// Initialize the ShadowForge protocol
    /// Creates vault config, sets up Token-2022 confidential mint integration,
    /// and initializes all privacy SDK connections
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::handler(ctx, params)
    }

    /// Private deposit into the shielded vault
    /// Uses ShadowWire for ZK-private transfer, Anoncoin for confidential mint,
    /// and Arcium MXE for encrypted position recording
    pub fn private_deposit(ctx: Context<PrivateDeposit>, params: PrivateDepositParams) -> Result<()> {
        instructions::private_deposit::handler(ctx, params)
    }

    /// Private lending/borrowing via Privacy Cash SDK
    /// Supports: borrow, repay, add collateral, withdraw collateral
    /// All amounts encrypted via Arcium MXE
    pub fn private_lend(ctx: Context<PrivateLend>, params: PrivateLendParams) -> Result<()> {
        instructions::private_lend::handler(ctx, params)
    }

    /// Private swap execution via Starpay + Anoncoin dark pools
    /// Supports: immediate execution, limit orders, dark pool matching
    /// All amounts and prices encrypted
    pub fn private_swap(ctx: Context<PrivateSwap>, params: PrivateSwapParams) -> Result<()> {
        instructions::private_swap::handler(ctx, params)
    }

    /// Private cross-chain bridging via SilentSwap
    /// Supports: outbound bridge, inbound claim, cancellation
    /// Non-custodial with encrypted destinations
    pub fn private_bridge(ctx: Context<PrivateBridge>, params: PrivateBridgeParams) -> Result<()> {
        instructions::private_bridge::handler(ctx, params)
    }

    /// Apply compliance checks via Range protocol
    /// Supports: screening, selective disclosure, attestation verification
    /// Privacy-preserving KYC without revealing sensitive data
    pub fn apply_compliance(ctx: Context<ApplyCompliance>, params: ApplyComplianceParams) -> Result<()> {
        instructions::apply_compliance::handler(ctx, params)
    }

    /// View function to calculate current shielded position value
    /// Uses Arcium MXE for encrypted yield computation
    /// Returns ZK proof of value without revealing amounts
    pub fn accrue_view(ctx: Context<AccrueView>) -> Result<AccrueViewResult> {
        instructions::accrue_view::handler(ctx)
    }

    /// Private withdrawal from the shielded vault
    /// Supports: partial, full, yield-only withdrawals
    /// Unshields tokens with ZK proof verification
    pub fn private_withdraw(ctx: Context<PrivateWithdraw>, params: PrivateWithdrawParams) -> Result<()> {
        instructions::private_withdraw::handler(ctx, params)
    }

    /// Admin operations for demo/hackathon purposes
    /// Supports: deposit rewards, update yield rate, pause, fees, SDK toggles
    pub fn admin_mock_yield(ctx: Context<AdminMockYield>, params: AdminMockYieldParams) -> Result<()> {
        instructions::admin_mock_yield::handler(ctx, params)
    }

    /// Wrap native SOL into shielded tokens
    /// Mints Token-2022 shielded tokens 1:1 for deposited SOL
    pub fn wrap_sol(ctx: Context<WrapSol>, params: WrapSolParams) -> Result<()> {
        instructions::wrap_sol::handler(ctx, params)
    }
}
