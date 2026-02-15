import { useState } from 'react'
import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { motion } from 'framer-motion'
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { SystemProgram, PublicKey } from '@solana/web3.js'
import toast from 'react-hot-toast'
import { getProvider, getProgram } from '../lib/anchor'
import {
  parseAmount,
  getVaultConfigPda,
  getUserPositionPda,
  getShieldedVaultPda,
  getBridgeRequestPda,
  getChainName,
  getSolscanUrl,
} from '../lib/utils'
import { silentSwap } from '../lib/sdkIntegrations'
import { LoadingSpinner } from './LoadingSpinner'
import { VaultConfig, UserEncryptedPosition } from '../types'

interface PrivateBridgeFormProps {
  vaultConfig: VaultConfig | null
  userPosition: UserEncryptedPosition | null
  onSuccess: () => void
  onClose: () => void
}

const SILENTSWAP_PROGRAM_ID = new PublicKey('SLNTswap11111111111111111111111111111111111')

const CHAINS = [
  { id: 1, name: 'Ethereum' },
  { id: 137, name: 'Polygon' },
  { id: 42161, name: 'Arbitrum' },
  { id: 10, name: 'Optimism' },
  { id: 8453, name: 'Base' },
  { id: 43114, name: 'Avalanche' },
  { id: 56, name: 'BSC' },
]

export function PrivateBridgeForm({
  vaultConfig,
  userPosition,
  onSuccess,
  onClose,
}: PrivateBridgeFormProps) {
  const { publicKey } = useWallet()
  const wallet = useAnchorWallet()
  const [amount, setAmount] = useState('')
  const [destChain, setDestChain] = useState(1)
  const [loading, setLoading] = useState(false)
  const [quote, setQuote] = useState<{
    outputAmount: string
    fee: string
    estimatedTime: number
  } | null>(null)

  const hasPendingBridge = userPosition?.hasPendingBridge ?? false

  const handleCancelBridge = async () => {
    if (!wallet || !publicKey || !vaultConfig) return

    setLoading(true)
    const toastId = toast.loading('Cancelling bridge request...')

    try {
      const provider = getProvider(wallet)
      const program = getProgram(provider)

      const [vaultConfigPda] = getVaultConfigPda()
      const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
      const [bridgeRequestPda] = getBridgeRequestPda(vaultConfigPda, publicKey)
      const [shieldedVaultAta] = getShieldedVaultPda(vaultConfig.shieldedMint)

      const tx = await program.methods
        .privateBridge({
          action: { cancelRequest: {} },
          destChain: { ethereum: {} },
          amountCommitment: Array(32).fill(1),
          bridgeProof: Array(32).fill(1),
          inboundProof: null,
        })
        .accountsStrict({
          user: publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          bridgeRequest: bridgeRequestPda,
          shieldedMint: vaultConfig.shieldedMint,
          shieldedVaultAta,
          silentswapProgram: SILENTSWAP_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      toast.success(
        <div>
          Bridge request cancelled!{' '}
          <a href={getSolscanUrl(tx)} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </div>,
        { id: toastId }
      )
      onSuccess()
    } catch (error) {
      console.error('Cancel failed:', error)
      toast.error(`Cancel failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        id: toastId,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleGetQuote = async () => {
    if (!amount) return

    const bridgeAmount = parseAmount(amount)
    const result = await silentSwap.getQuote({
      inputToken: 'SOL',
      outputToken: 'ETH',
      amount: bridgeAmount.toString(),
      destChainId: destChain,
    })

    setQuote({
      outputAmount: (result.outputAmount.toNumber() / 1e9).toFixed(6),
      fee: (result.fee.toNumber() / 1e9).toFixed(6),
      estimatedTime: result.estimatedTime,
    })
  }

  const handleBridge = async () => {
    if (!wallet || !publicKey || !vaultConfig) {
      toast.error('Please connect your wallet')
      return
    }

    if (hasPendingBridge) {
      toast.error('You have a pending bridge request')
      return
    }

    const bridgeAmount = parseAmount(amount)
    if (bridgeAmount.isZero()) {
      toast.error('Please enter a valid amount')
      return
    }

    setLoading(true)
    const toastId = toast.loading('Initiating private bridge...')

    try {
      const provider = getProvider(wallet)
      const program = getProgram(provider)

      const [vaultConfigPda] = getVaultConfigPda()
      const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
      const [bridgeRequestPda] = getBridgeRequestPda(vaultConfigPda, publicKey)
      const [shieldedVaultAta] = getShieldedVaultPda(vaultConfig.shieldedMint)

      const { bridgeProof, commitment } = await silentSwap.initiateBridge({
        sourceChain: 'solana',
        destChain,
        amount: bridgeAmount,
        recipient: publicKey.toBase58(),
      })

      const destChainParam = {
        ethereum: destChain === 1 ? {} : undefined,
        polygon: destChain === 137 ? {} : undefined,
        arbitrum: destChain === 42161 ? {} : undefined,
        optimism: destChain === 10 ? {} : undefined,
        base: destChain === 8453 ? {} : undefined,
        avalanche: destChain === 43114 ? {} : undefined,
        bsc: destChain === 56 ? {} : undefined,
      }

      const selectedChain = Object.entries(destChainParam).find(([, v]) => v !== undefined)
      if (!selectedChain) throw new Error('Invalid chain')

      toast.loading('Submitting to SilentSwap...', { id: toastId })

      await program.methods
        .privateBridge({
          action: { initiateOutbound: {} },
          destChain: { [selectedChain[0]]: {} },
          amountCommitment: commitment,
          bridgeProof,
          inboundProof: null,
        })
        .accountsStrict({
          user: publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          bridgeRequest: bridgeRequestPda,
          shieldedMint: vaultConfig.shieldedMint,
          shieldedVaultAta,
          silentswapProgram: SILENTSWAP_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      toast.loading('Waiting for bridge confirmation...', { id: toastId })

      await new Promise((resolve) => setTimeout(resolve, 3000))

      const tx = await program.methods
        .privateBridge({
          action: { verifyCompletion: {} },
          destChain: { [selectedChain[0]]: {} },
          amountCommitment: commitment,
          bridgeProof,
          inboundProof: null,
        })
        .accountsStrict({
          user: publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          bridgeRequest: bridgeRequestPda,
          shieldedMint: vaultConfig.shieldedMint,
          shieldedVaultAta,
          silentswapProgram: SILENTSWAP_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      toast.success(
        <div>
          Bridge to {getChainName(destChain)} completed!{' '}
          <a href={getSolscanUrl(tx)} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </div>,
        { id: toastId }
      )
      setAmount('')
      setQuote(null)
      onSuccess()
    } catch (error) {
      console.error('Bridge failed:', error)
      toast.error(`Bridge failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        id: toastId,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-surface-light border border-surface-border rounded-xl overflow-hidden"
    >
      <div className="p-4 border-b border-surface-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
          Private Bridge
        </h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {hasPendingBridge && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-yellow-500 text-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                </svg>
                <span>Pending bridge request</span>
              </div>
              <button
                onClick={handleCancelBridge}
                disabled={loading}
                className="text-xs px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Destination Chain
          </label>
          <select
            value={destChain}
            onChange={(e) => {
              setDestChain(parseInt(e.target.value))
              setQuote(null)
            }}
            className="input-field"
            disabled={loading || hasPendingBridge}
          >
            {CHAINS.map((chain) => (
              <option key={chain.id} value={chain.id}>
                {chain.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Amount (SOL)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setQuote(null)
              }}
              placeholder="0.00"
              className="input-field flex-1"
              disabled={loading || hasPendingBridge}
            />
            <button
              onClick={handleGetQuote}
              disabled={!amount || loading}
              className="btn-secondary"
            >
              Quote
            </button>
          </div>
        </div>

        {quote && (
          <div className="p-3 bg-surface rounded-lg border border-surface-border space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">You receive</span>
              <span className="font-mono">{quote.outputAmount} SOL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Fee</span>
              <span className="font-mono">{quote.fee} SOL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Est. Time</span>
              <span className="font-mono">{Math.floor(quote.estimatedTime / 60)} min</span>
            </div>
          </div>
        )}

        <div className="p-3 bg-surface rounded-lg border border-surface-border text-sm text-text-secondary">
          Powered by SilentSwap for private cross-chain transfers
        </div>

        <button
          onClick={handleBridge}
          disabled={loading || !amount || !vaultConfig || hasPendingBridge}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Processing...</span>
            </>
          ) : (
            <span>Bridge to {getChainName(destChain)}</span>
          )}
        </button>
      </div>
    </motion.div>
  )
}
