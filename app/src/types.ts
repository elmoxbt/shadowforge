import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

export interface VaultConfig {
  admin: PublicKey
  treasury: PublicKey
  shieldedMint: PublicKey
  secondaryMint: PublicKey
  totalShieldedTvl: BN
  totalPositions: BN
  depositFeeBps: number
  withdrawalFeeBps: number
  lendingFeeBps: number
  swapFeeBps: number
  bridgeFeeBps: number
  currentYieldBps: number
  isPaused: boolean
  emergencyMode: boolean
  complianceRequired: boolean
  arciumEnabled: boolean
  shadowwireEnabled: boolean
  privacyCashEnabled: boolean
  silentswapEnabled: boolean
  starpayEnabled: boolean
  anoncoinEnabled: boolean
  rangeEnabled: boolean
  bump: number
}

export interface UserEncryptedPosition {
  owner: PublicKey
  vaultConfig: PublicKey
  encryptedPrincipal: EncryptedCiphertext
  balanceCommitment: number[]
  depositCount: number
  withdrawalCount: number
  actionCount: number
  hasActiveLoan: boolean
  hasPendingBridge: boolean
  complianceVerified: boolean
  nullifier: number[]
  lastActionAt: BN
  createdAt: BN
  bump: number
}

export interface EncryptedCiphertext {
  handle: number[]
  commitment: number[]
}

export interface LendingPosition {
  borrower: PublicKey
  vaultConfig: PublicKey
  collateralCommitment: number[]
  borrowCommitment: number[]
  interestRateBps: number
  isActive: boolean
  createdAt: BN
  bump: number
}

export interface BridgeRequest {
  user: PublicKey
  destChainId: BN
  amountCommitment: number[]
  status: BridgeStatus
  createdAt: BN
  bump: number
}

export type BridgeStatus =
  | { pending: Record<string, never> }
  | { completed: Record<string, never> }
  | { failed: Record<string, never> }

export interface DarkPoolOrder {
  maker: PublicKey
  side: OrderSide
  encryptedAmount: EncryptedCiphertext
  encryptedPrice: EncryptedCiphertext
  status: OrderStatus
  createdAt: BN
  bump: number
}

export type OrderSide =
  | { buy: Record<string, never> }
  | { sell: Record<string, never> }

export type OrderStatus =
  | { none: Record<string, never> }
  | { open: Record<string, never> }
  | { partiallyFilled: Record<string, never> }
  | { filled: Record<string, never> }
  | { cancelled: Record<string, never> }

export interface ComplianceAttestation {
  user: PublicKey
  vaultConfig: PublicKey
  attestationHash: number[]
  riskScore: number
  isValid: boolean
  expiresAt: BN
  createdAt: BN
  bump: number
}

export interface ShieldedAsset {
  symbol: string
  name: string
  shieldedAmount: string
  accruedYield: string
  percentChange: number
  isShielded: boolean
}

export interface PrivacyAction {
  type: 'deposit' | 'withdraw' | 'lend' | 'repay' | 'swap' | 'bridge'
  amount: string
  timestamp: number
  txHash: string
  status: 'pending' | 'confirmed' | 'failed'
}

export type DestinationChain =
  | { ethereum: Record<string, never> }
  | { polygon: Record<string, never> }
  | { arbitrum: Record<string, never> }
  | { optimism: Record<string, never> }
  | { base: Record<string, never> }
  | { avalanche: Record<string, never> }
  | { bsc: Record<string, never> }

export type SwapRoute =
  | { starpay: Record<string, never> }
  | { anocoinDarkPool: Record<string, never> }
  | { split: { starpayWeightBps: number } }

export type SwapAction =
  | { execute: Record<string, never> }
  | { placeLimitOrder: Record<string, never> }
  | { cancelOrder: Record<string, never> }
  | { matchDarkPool: Record<string, never> }

export type LendAction =
  | { borrow: { collateralCommitment: number[]; borrowCommitment: number[] } }
  | { repay: { repaymentCommitment: number[] } }
  | { liquidate: { liquidationProof: number[] } }

export type ComplianceAction =
  | { submit: Record<string, never> }
  | { verify: Record<string, never> }
  | { revoke: Record<string, never> }

export type WithdrawType =
  | { partial: Record<string, never> }
  | { full: Record<string, never> }
  | { yieldOnly: Record<string, never> }

export type BridgeAction =
  | { initiateOutbound: Record<string, never> }
  | { claimInbound: Record<string, never> }
  | { cancelRequest: Record<string, never> }
  | { verifyCompletion: Record<string, never> }
