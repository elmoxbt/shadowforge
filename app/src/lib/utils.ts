import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

export const PROGRAM_ID = new PublicKey('Brejex6T6bCkvVko2qCSW7LGK93anqEWoiuYs5pfu9oA')

export const VAULT_CONFIG_SEED = Buffer.from('vault_config')
export const USER_POSITION_SEED = Buffer.from('user_position')
export const SHIELDED_VAULT_SEED = Buffer.from('shielded_vault')
export const COMPLIANCE_SEED = Buffer.from('compliance')
export const LENDING_POSITION_SEED = Buffer.from('lending_position')
export const BRIDGE_REQUEST_SEED = Buffer.from('bridge_request')
export const DARK_POOL_ORDER_SEED = Buffer.from('dark_pool_order')

export function getVaultConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_CONFIG_SEED], PROGRAM_ID)
}

export function getUserPositionPda(vaultConfig: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [USER_POSITION_SEED, vaultConfig.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  )
}

export function getShieldedVaultPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SHIELDED_VAULT_SEED, mint.toBuffer()],
    PROGRAM_ID
  )
}

export function getCompliancePda(vaultConfig: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [COMPLIANCE_SEED, vaultConfig.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  )
}

export function getLendingPositionPda(vaultConfig: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [LENDING_POSITION_SEED, vaultConfig.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  )
}

export function getBridgeRequestPda(vaultConfig: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BRIDGE_REQUEST_SEED, vaultConfig.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  )
}

export function getDarkPoolOrderPda(vaultConfig: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DARK_POOL_ORDER_SEED, vaultConfig.toBuffer(), user.toBuffer()],
    PROGRAM_ID
  )
}

export function formatAmount(amount: BN | number | string, decimals: number = 9): string {
  const value = typeof amount === 'string' ? parseFloat(amount) :
                BN.isBN(amount) ? amount.toNumber() : amount
  const formatted = value / Math.pow(10, decimals)
  return formatted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
}

export function parseAmount(amount: string, decimals: number = 9): BN {
  const value = parseFloat(amount)
  if (isNaN(value)) return new BN(0)
  return new BN(Math.floor(value * Math.pow(10, decimals)))
}

export function shortenAddress(address: string | PublicKey, chars: number = 4): string {
  const str = typeof address === 'string' ? address : address.toBase58()
  return `${str.slice(0, chars)}...${str.slice(-chars)}`
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`
}

export function generateRandomBytes(length: number): number[] {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b === 0 ? 1 : b)
}

export function generateCommitment(): number[] {
  return generateRandomBytes(32)
}

export function generateNullifier(): number[] {
  return generateRandomBytes(32)
}

export function generateProof(length: number = 32): number[] {
  return generateRandomBytes(length)
}

export function calculateYield(principal: number, yieldBps: number, days: number): number {
  const annualYield = principal * (yieldBps / 10000)
  return (annualYield / 365) * days
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  8453: 'Base',
  43114: 'Avalanche',
  56: 'BSC',
}

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`
}

export function getSolscanUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`
}
