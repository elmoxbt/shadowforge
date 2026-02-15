import { useState } from 'react'
import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { motion } from 'framer-motion'
import { BN } from '@coral-xyz/anchor'
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from '@solana/spl-token'
import { SystemProgram, PublicKey, Transaction } from '@solana/web3.js'
import toast from 'react-hot-toast'
import { getProvider, getProgram } from '../lib/anchor'
import { parseAmount, getVaultConfigPda, getUserPositionPda, getShieldedVaultPda, getSolscanUrl } from '../lib/utils'
import { shadowWire, generateDepositCommitments } from '../lib/sdkIntegrations'
import { LoadingSpinner } from './LoadingSpinner'
import { VaultConfig } from '../types'

interface PrivateDepositFormProps {
  vaultConfig: VaultConfig | null
  userTokenAccount: PublicKey | null
  onSuccess: () => void
  onClose: () => void
}

export function PrivateDepositForm({
  vaultConfig,
  userTokenAccount,
  onSuccess,
  onClose,
}: PrivateDepositFormProps) {
  const { publicKey } = useWallet()
  const wallet = useAnchorWallet()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDeposit = async () => {
    if (!wallet || !publicKey || !vaultConfig) {
      toast.error('Please connect your wallet')
      return
    }

    const depositAmount = parseAmount(amount)
    if (depositAmount.isZero()) {
      toast.error('Please enter a valid amount')
      return
    }

    setLoading(true)
    const toastId = toast.loading('Generating ZK proof...')

    try {
      const provider = getProvider(wallet)
      const program = getProgram(provider)

      const ata = getAssociatedTokenAddressSync(
        vaultConfig.shieldedMint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      )

      let needsAta = false
      try {
        await getAccount(provider.connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID)
      } catch {
        needsAta = true
      }

      if (needsAta) {
        toast.loading('Creating token account...', { id: toastId })
        const createAtaIx = createAssociatedTokenAccountInstruction(
          publicKey,
          ata,
          publicKey,
          vaultConfig.shieldedMint,
          TOKEN_2022_PROGRAM_ID
        )
        const tx = new Transaction().add(createAtaIx)
        await provider.sendAndConfirm(tx)
      }

      toast.loading('Wrapping SOL to shielded tokens...', { id: toastId })
      const [vaultConfigPda] = getVaultConfigPda()
      await program.methods
        .wrapSol({ amount: depositAmount })
        .accountsStrict({
          user: publicKey,
          vaultConfig: vaultConfigPda,
          shieldedMint: vaultConfig.shieldedMint,
          userTokenAccount: ata,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      toast.loading('Generating ZK proof...', { id: toastId })
      await shadowWire.generateZKRangeProof(depositAmount.toNumber())
      const { amountCommitment, blindingFactor } = generateDepositCommitments(depositAmount)

      toast.loading('Submitting shielded deposit...', { id: toastId })

      const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
      const [shieldedVaultAta] = getShieldedVaultPda(vaultConfig.shieldedMint)

      const tx = await program.methods
        .privateDeposit({
          amount: depositAmount,
          amountCommitment,
          blindingFactor,
        })
        .accountsStrict({
          user: publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          userTokenAccount: ata,
          shieldedVaultAta,
          shieldedMint: vaultConfig.shieldedMint,
          complianceAttestation: null,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      toast.success(
        <div>
          Deposit shielded successfully!{' '}
          <a href={getSolscanUrl(tx)} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </div>,
        { id: toastId }
      )
      setAmount('')
      onSuccess()
    } catch (error) {
      console.error('Deposit failed:', error)
      toast.error(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
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
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          </svg>
          Shield Assets
        </h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-2 text-sm">
            <svg className="w-4 h-4 text-primary mt-0.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
            </svg>
            <span className="text-text-secondary">
              Your deposit will be encrypted using Arcuim. Only you can view the balance.
            </span>
          </div>
        </div>

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

        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>Deposit Fee</span>
          <span className="font-mono">{vaultConfig ? `${vaultConfig.depositFeeBps / 100}%` : '-'}</span>
        </div>

        <button
          onClick={handleDeposit}
          disabled={loading || !amount || !vaultConfig}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Processing...</span>
            </>
          ) : (
            <span>Shield Deposit</span>
          )}
        </button>
      </div>
    </motion.div>
  )
}
