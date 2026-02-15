use anchor_lang::prelude::*;

#[error_code]
pub enum ShadowForgeError {
    // Initialization errors (6000-6009)
    #[msg("Vault has already been initialized")]
    AlreadyInitialized,
    #[msg("Invalid authority provided")]
    InvalidAuthority,
    #[msg("Invalid mint configuration")]
    InvalidMintConfig,

    // Proof verification errors (6010-6029)
    #[msg("Invalid zero-knowledge proof")]
    InvalidProof,
    #[msg("Proof verification failed")]
    ProofVerificationFailed,
    #[msg("Range proof validation failed")]
    RangeProofFailed,
    #[msg("Bulletproof verification failed")]
    BulletproofFailed,
    #[msg("Invalid proof commitment")]
    InvalidCommitment,
    #[msg("Proof data malformed or corrupted")]
    MalformedProofData,

    // Encryption errors (6030-6049)
    #[msg("Encryption operation failed")]
    EncryptionFailed,
    #[msg("Decryption operation failed")]
    DecryptionFailed,
    #[msg("Invalid ciphertext format")]
    InvalidCiphertext,
    #[msg("Arcium MXE computation failed")]
    MxeComputationFailed,
    #[msg("Invalid encrypted state")]
    InvalidEncryptedState,

    // Balance/Amount errors (6050-6069)
    #[msg("Insufficient shielded balance")]
    InsufficientShieldedBalance,
    #[msg("Amount overflow detected")]
    AmountOverflow,
    #[msg("Amount underflow detected")]
    AmountUnderflow,
    #[msg("Invalid amount - must be greater than zero")]
    InvalidAmount,
    #[msg("Maximum deposit limit exceeded")]
    DepositLimitExceeded,
    #[msg("Minimum withdrawal not met")]
    MinimumWithdrawalNotMet,

    // Compliance errors (6070-6089)
    #[msg("Compliance check failed - transaction blocked")]
    ComplianceFailed,
    #[msg("Address screening failed")]
    AddressScreeningFailed,
    #[msg("Selective disclosure verification failed")]
    SelectiveDisclosureFailed,
    #[msg("Compliance attestation expired")]
    ComplianceExpired,
    #[msg("KYC verification required")]
    KycRequired,
    #[msg("Transaction exceeds compliance threshold")]
    ComplianceThresholdExceeded,

    // Transfer/Bridge errors (6090-6109)
    #[msg("Private transfer failed")]
    PrivateTransferFailed,
    #[msg("ShadowWire transfer verification failed")]
    ShadowWireTransferFailed,
    #[msg("Cross-chain bridge operation failed")]
    BridgeFailed,
    #[msg("SilentSwap bridge verification failed")]
    SilentSwapFailed,
    #[msg("Invalid destination chain")]
    InvalidDestinationChain,
    #[msg("Bridge liquidity insufficient")]
    BridgeLiquidityInsufficient,

    // Lending errors (6110-6129)
    #[msg("Privacy Cash lending operation failed")]
    LendingFailed,
    #[msg("Collateral insufficient for loan")]
    InsufficientCollateral,
    #[msg("Loan position not found")]
    LoanNotFound,
    #[msg("Loan already liquidated")]
    LoanLiquidated,
    #[msg("Interest rate calculation overflow")]
    InterestOverflow,

    // Swap/Dark pool errors (6130-6149)
    #[msg("Private swap execution failed")]
    SwapFailed,
    #[msg("Starpay swap verification failed")]
    StarpaySwapFailed,
    #[msg("Anoncoin dark pool order failed")]
    DarkPoolFailed,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("No liquidity available for swap")]
    NoLiquidity,
    #[msg("Invalid swap path")]
    InvalidSwapPath,

    // Account/State errors (6150-6169)
    #[msg("User position not found")]
    PositionNotFound,
    #[msg("Position already exists")]
    PositionExists,
    #[msg("Invalid vault state")]
    InvalidVaultState,
    #[msg("Account data corrupted")]
    CorruptedAccountData,
    #[msg("Timestamp manipulation detected")]
    InvalidTimestamp,

    // Admin errors (6170-6189)
    #[msg("Unauthorized - admin only")]
    Unauthorized,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Invalid admin operation")]
    InvalidAdminOperation,
    #[msg("Emergency mode is active")]
    EmergencyMode,

    // SDK integration errors (6190-6209)
    #[msg("Helius RPC query failed")]
    HeliusQueryFailed,
    #[msg("QuickNode RPC query failed")]
    QuicknodeQueryFailed,
    #[msg("External SDK call failed")]
    ExternalSdkFailed,
    #[msg("CPI invocation failed")]
    CpiInvocationFailed,
    #[msg("SDK response validation failed")]
    SdkResponseInvalid,
}
