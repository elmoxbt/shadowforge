use anchor_lang::prelude::*;

// PDA Seeds
pub const VAULT_CONFIG_SEED: &[u8] = b"vault_config";
pub const USER_POSITION_SEED: &[u8] = b"user_position";
pub const SHIELDED_VAULT_SEED: &[u8] = b"shielded_vault";
pub const COMPLIANCE_SEED: &[u8] = b"compliance";

// Protocol Constants
pub const MAX_BASIS_POINTS: u16 = 10_000;
pub const MIN_DEPOSIT_LAMPORTS: u64 = 1_000_000;
pub const PROOF_DATA_LEN: usize = 32;

// External Program IDs (from sponsor documentation)
// These are placeholder addresses for the hackathon demo since real SDK programs don't exist yet
// Using byte arrays to avoid IDL conflicts with declare_id!

pub const ARCIUM_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    148, 83, 91, 105, 246, 117, 211, 118, 62, 186, 169, 61, 30, 78, 214, 63,
    163, 100, 65, 151, 167, 46, 97, 138, 124, 31, 84, 214, 0, 0, 0, 0
]);
pub const SHADOWWIRE_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    5, 73, 14, 162, 232, 118, 145, 231, 181, 59, 107, 2, 34, 225, 107, 189,
    127, 41, 107, 63, 167, 214, 175, 125, 143, 171, 46, 30, 0, 0, 0, 0
]);
pub const PRIVACY_CASH_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 56, 154, 205, 65, 187, 56, 188, 181, 82, 113, 114, 195, 39, 217, 117,
    216, 160, 81, 170, 110, 247, 149, 127, 57, 22, 168, 100, 0, 0, 0, 1
]);
pub const SILENTSWAP_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    5, 148, 24, 234, 220, 63, 33, 127, 48, 159, 134, 127, 48, 159, 134, 127,
    48, 159, 134, 127, 48, 159, 134, 127, 48, 159, 134, 127, 0, 0, 0, 0
]);
pub const STARPAY_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    5, 203, 46, 194, 153, 48, 159, 134, 127, 48, 159, 134, 127, 48, 159, 134,
    127, 48, 159, 134, 127, 48, 159, 134, 127, 48, 159, 134, 0, 0, 0, 0
]);
pub const ANONCOIN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    142, 178, 229, 46, 218, 48, 159, 134, 127, 48, 159, 134, 127, 48, 159, 134,
    127, 48, 159, 134, 127, 48, 159, 134, 127, 48, 159, 134, 0, 0, 0, 0
]);
pub const RANGE_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    15, 37, 156, 224, 228, 48, 159, 134, 127, 48, 159, 134, 127, 48, 159, 134,
    127, 48, 159, 134, 127, 48, 159, 134, 127, 48, 159, 134, 0, 0, 0, 0
]);

#[account]
pub struct VaultConfig {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub shielded_mint: Pubkey,
    pub secondary_mint: Pubkey,
    pub arcium_enabled: bool,
    pub shadowwire_enabled: bool,
    pub anoncoin_enabled: bool,
    pub privacy_cash_enabled: bool,
    pub silentswap_enabled: bool,
    pub starpay_enabled: bool,
    pub range_enabled: bool,
    pub deposit_fee_bps: u16,
    pub withdrawal_fee_bps: u16,
    pub lending_fee_bps: u16,
    pub swap_fee_bps: u16,
    pub bridge_fee_bps: u16,
    pub current_yield_bps: u16,
    pub total_shielded_tvl: u64,
    pub total_positions: u64,
    pub is_paused: bool,
    pub emergency_mode: bool,
    pub compliance_required: bool,
    pub initialized_at: i64,
    pub last_yield_update: i64,
    pub bump: u8,
    pub _reserved: [u8; 32],
}

impl Default for VaultConfig {
    fn default() -> Self {
        Self {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            shielded_mint: Pubkey::default(),
            secondary_mint: Pubkey::default(),
            arcium_enabled: false,
            shadowwire_enabled: false,
            anoncoin_enabled: false,
            privacy_cash_enabled: false,
            silentswap_enabled: false,
            starpay_enabled: false,
            range_enabled: false,
            deposit_fee_bps: 0,
            withdrawal_fee_bps: 0,
            lending_fee_bps: 0,
            swap_fee_bps: 0,
            bridge_fee_bps: 0,
            current_yield_bps: 0,
            total_shielded_tvl: 0,
            total_positions: 0,
            is_paused: false,
            emergency_mode: false,
            compliance_required: false,
            initialized_at: 0,
            last_yield_update: 0,
            bump: 0,
            _reserved: [0u8; 32],
        }
    }
}

impl VaultConfig {
    pub const LEN: usize = 8 + 32 * 4 + 7 + 6 * 2 + 8 * 2 + 3 + 8 * 2 + 1 + 32;

    pub fn is_operational(&self) -> bool {
        !self.is_paused && !self.emergency_mode
    }
}

/// ElGamal ciphertext for Token-2022 confidential transfers
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct EncryptedAmount {
    pub handle: [u8; 32],
    pub commitment: [u8; 32],
}

impl EncryptedAmount {
    pub const LEN: usize = 64;

    pub fn is_zero(&self) -> bool {
        self.handle.iter().all(|&b| b == 0) && self.commitment.iter().all(|&b| b == 0)
    }
}

#[account]
pub struct UserEncryptedPosition {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub encrypted_principal: EncryptedAmount,
    pub encrypted_yield: EncryptedAmount,
    pub balance_commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub has_active_loan: bool,
    pub has_pending_bridge: bool,
    pub compliance_verified: bool,
    pub compliance_expiry: i64,
    pub created_at: i64,
    pub last_deposit_at: i64,
    pub last_action_at: i64,
    pub deposit_count: u32,
    pub withdrawal_count: u32,
    pub action_count: u32,
    pub bump: u8,
}

impl Default for UserEncryptedPosition {
    fn default() -> Self {
        Self {
            owner: Pubkey::default(),
            vault: Pubkey::default(),
            encrypted_principal: EncryptedAmount::default(),
            encrypted_yield: EncryptedAmount::default(),
            balance_commitment: [0u8; 32],
            nullifier: [0u8; 32],
            has_active_loan: false,
            has_pending_bridge: false,
            compliance_verified: false,
            compliance_expiry: 0,
            created_at: 0,
            last_deposit_at: 0,
            last_action_at: 0,
            deposit_count: 0,
            withdrawal_count: 0,
            action_count: 0,
            bump: 0,
        }
    }
}

impl UserEncryptedPosition {
    pub const LEN: usize = 8 + 32 * 2 + EncryptedAmount::LEN * 2 + 32 * 2 + 3 + 8 * 4 + 4 * 3 + 1;

    pub fn is_compliant(&self, current_time: i64) -> bool {
        self.compliance_verified && self.compliance_expiry > current_time
    }
}

#[account]
pub struct ComplianceAttestation {
    pub user: Pubkey,
    pub provider: Pubkey,
    pub attestation_hash: [u8; 32],
    pub attested_at: i64,
    pub expires_at: i64,
    pub risk_score: u8,
    pub is_valid: bool,
    pub bump: u8,
}

impl Default for ComplianceAttestation {
    fn default() -> Self {
        Self {
            user: Pubkey::default(),
            provider: Pubkey::default(),
            attestation_hash: [0u8; 32],
            attested_at: 0,
            expires_at: 0,
            risk_score: 0,
            is_valid: false,
            bump: 0,
        }
    }
}

impl ComplianceAttestation {
    pub const LEN: usize = 8 + 32 * 3 + 8 * 2 + 3;
}

#[account]
pub struct BridgeRequest {
    pub user: Pubkey,
    pub dest_chain_id: u64,
    pub amount_commitment: [u8; 32],
    pub status: BridgeStatus,
    pub created_at: i64,
    pub bump: u8,
}

impl Default for BridgeRequest {
    fn default() -> Self {
        Self {
            user: Pubkey::default(),
            dest_chain_id: 0,
            amount_commitment: [0u8; 32],
            status: BridgeStatus::default(),
            created_at: 0,
            bump: 0,
        }
    }
}

impl BridgeRequest {
    pub const LEN: usize = 8 + 32 + 8 + 32 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, PartialEq)]
pub enum BridgeStatus {
    #[default]
    Pending,
    Confirmed,
    Completed,
    Failed,
}

#[account]
#[derive(Default)]
pub struct LendingPosition {
    pub borrower: Pubkey,
    pub encrypted_collateral: EncryptedAmount,
    pub encrypted_borrow: EncryptedAmount,
    pub interest_rate_bps: u16,
    pub originated_at: i64,
    pub last_accrual_at: i64,
    pub liquidation_threshold_bps: u16,
    pub is_active: bool,
    pub bump: u8,
}

impl LendingPosition {
    pub const LEN: usize = 8 + 32 + EncryptedAmount::LEN * 2 + 2 + 8 * 2 + 2 + 2;
}

#[account]
pub struct DarkPoolOrder {
    pub maker: Pubkey,
    pub side: OrderSide,
    pub encrypted_amount: EncryptedAmount,
    pub encrypted_price: EncryptedAmount,
    pub status: OrderStatus,
    pub created_at: i64,
    pub bump: u8,
}

impl Default for DarkPoolOrder {
    fn default() -> Self {
        Self {
            maker: Pubkey::default(),
            side: OrderSide::default(),
            encrypted_amount: EncryptedAmount::default(),
            encrypted_price: EncryptedAmount::default(),
            status: OrderStatus::default(),
            created_at: 0,
            bump: 0,
        }
    }
}

impl DarkPoolOrder {
    pub const LEN: usize = 8 + 32 + 1 + EncryptedAmount::LEN * 2 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, PartialEq)]
pub enum OrderSide {
    #[default]
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, PartialEq)]
pub enum OrderStatus {
    #[default]
    None,
    Open,
    PartiallyFilled,
    Filled,
    Cancelled,
}

#[event]
pub struct PrivateDepositEvent {
    pub user: Pubkey,
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct PrivateWithdrawEvent {
    pub user: Pubkey,
    pub nullifier: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct PrivateSwapEvent {
    pub user: Pubkey,
    pub swap_commitment: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct BridgeRequestEvent {
    pub user: Pubkey,
    pub dest_chain_id: u64,
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct ComplianceEvent {
    pub user: Pubkey,
    pub provider: Pubkey,
    pub risk_score: u8,
    pub expires_at: i64,
}
