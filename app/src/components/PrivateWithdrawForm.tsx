import { useState } from 'react'
import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { motion } from 'framer-motion'
import { BN } from '@coral-xyz/anchor'
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { SystemProgram, PublicKey } from '@solana/web3.js'
import toast from 'react-hot-toast'
import { getProvider, getProgram } from '../lib/anchor'
import { parseAmount, getVaultConfigPda, getUserPositionPda, getShieldedVaultPda, getSolscanUrl } from '../lib/utils'
import { generateWithdrawalProofs } from '../lib/sdkIntegrations'
import { LoadingSpinner } from './LoadingSpinner'
import { VaultConfig } from '../types'

interface PrivateWithdrawFormProps {
  vaultConfig: VaultConfig | null
  userTokenAccount: PublicKey | null
  onSuccess: () => void
  onClose: () => void
}

export function PrivateWithdrawForm({
  vaultConfig,
  userTokenAccount,
  onSuccess,
  onClose,
}: PrivateWithdrawFormProps) {
  const { publicKey } = useWallet()
  const wallet = useAnchorWallet()
  const [amount, setAmount] = useState('')
  const [withdrawType, setWithdrawType] = useState<'partial' | 'full' | 'yieldOnly'>('partial')
  const [loading, setLoading] = useState(false)

  const handleWithdraw = async () => {
    if (!wallet || !publicKey || !vaultConfig || !userTokenAccount) {
      toast.error('Please connect your wallet')
      return
    }

    const withdrawAmount = parseAmount(amount)
    if (withdrawAmount.isZero() && withdrawType === 'partial') {
      toast.error('Please enter a valid amount')
      return
    }

    setLoading(true)
    const toastId = toast.loading('Generating withdrawal proof...')

    try {
      const provider = getProvider(wallet)
      const program = getProgram(provider)

      const [vaultConfigPda] = getVaultConfigPda()
      const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
      const [shieldedVaultAta] = getShieldedVaultPda(vaultConfig.shieldedMint)

      const { withdrawalProof, ownershipProof, nullifier } = generateWithdrawalProofs(
        withdrawAmount,
        userPositionPda
      )

      toast.loading('Submitting private withdrawal...', { id: toastId })

      const withdrawTypeParam =
        withdrawType === 'full'
          ? { full: {} }
          : withdrawType === 'yieldOnly'
          ? { yieldOnly: {} }
          : { partial: {} }

      const tx = await program.methods
        .privateWithdraw({
          withdrawType: withdrawTypeParam,
          withdrawalProof,
          ownershipProof,
          nullifier,
          expectedAmount: withdrawAmount,
        })
        .accountsStrict({
          user: publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          userTokenAccount,
          shieldedVaultAta,
          shieldedMint: vaultConfig.shieldedMint,
          complianceAttestation: null,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      toast.success(
        <div>
          Withdrawal completed!{' '}
          <a href={getSolscanUrl(tx)} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </div>,
        { id: toastId }
      )
      setAmount('')
      onSuccess()
    } catch (error) {
      console.error('Withdrawal failed:', error)
      toast.error(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
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
            <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
          </svg>
          Withdraw
        </h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Withdrawal Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['partial', 'full', 'yieldOnly'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setWithdrawType(type)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  withdrawType === type
                    ? 'bg-primary text-surface'
                    : 'bg-surface border border-surface-border text-text-secondary hover:border-text-muted'
                }`}
              >
                {type === 'partial' ? 'Partial' : type === 'full' ? 'Full' : 'Yield Only'}
              </button>
            ))}
          </div>
        </div>

        {withdrawType === 'partial' && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Amount (SOL)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="input-field"
              disabled={loading}
            />
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>Withdrawal Fee</span>
          <span className="font-mono">
            {vaultConfig ? `${vaultConfig.withdrawalFeeBps / 100}%` : '-'}
          </span>
        </div>

        <div className="p-3 bg-surface rounded-lg border border-surface-border">
          <div className="flex items-start gap-2 text-sm">
            <svg className="w-4 h-4 text-primary mt-0.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
            <span className="text-text-secondary">
              MEV protected: Withdrawal uses nullifiers to prevent front-running
            </span>
          </div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={loading || (!amount && withdrawType === 'partial') || !vaultConfig}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Processing...</span>
            </>
          ) : (
            <span>Withdraw Privately</span>
          )}
        </button>
      </div>
    </motion.div>
  )
}
