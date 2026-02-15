import { Program, AnchorProvider, Idl, setProvider } from '@coral-xyz/anchor'
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js'
import { AnchorWallet } from '@solana/wallet-adapter-react'
import { PROGRAM_ID } from './utils'
import idl from '../../../target/idl/shadowforge.json'

export const DEVNET_RPC = clusterApiUrl('devnet')
export const HELIUS_RPC = `https://devnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY || ''}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShadowforgeProgram = Program<any>

export function getConnection(): Connection {
  const rpcUrl = import.meta.env.VITE_HELIUS_API_KEY ? HELIUS_RPC : DEVNET_RPC
  return new Connection(rpcUrl, 'confirmed')
}

export function getProvider(wallet: AnchorWallet): AnchorProvider {
  const connection = getConnection()
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
  setProvider(provider)
  return provider
}

export function getProgram(provider: AnchorProvider): ShadowforgeProgram {
  return new Program(idl as Idl, provider)
}

export function getProgramReadOnly(): ShadowforgeProgram {
  const connection = getConnection()
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: () => Promise.reject('Read-only'),
    signAllTransactions: () => Promise.reject('Read-only'),
  }
  const provider = new AnchorProvider(connection, dummyWallet as AnchorWallet, {
    commitment: 'confirmed',
  })
  return new Program(idl as Idl, provider)
}

export { PROGRAM_ID }
