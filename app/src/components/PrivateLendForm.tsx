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
  getLendingPositionPda,
  getSolscanUrl,
} from '../lib/utils'
import { privacyCash } from '../lib/sdkIntegrations'
import { LoadingSpinner } from './LoadingSpinner'
import { VaultConfig, UserEncryptedPosition } from '../types'

interface PrivateLendFormProps {
  vaultConfig: VaultConfig | null
  userPosition: UserEncryptedPosition | null
  onSuccess: () => void
  onClose: () => void
}

const PRIVACY_CASH_PROGRAM_ID = new PublicKey('PRVCash111111111111111111111111111111111111')

export function PrivateLendForm({
  vaultConfig,
  userPosition,
  onSuccess,
  onClose,
}: PrivateLendFormProps) {
  const { publicKey } = useWallet()
  const wallet = useAnchorWallet()
  const [action, setAction] = useState<'borrow' | 'repay'>('borrow')
  const [collateralAmount, setCollateralAmount] = useState('')
  const [borrowAmount, setBorrowAmount] = useState('')
  const [repayAmount, setRepayAmount] = useState('')
  const [interestRate, setInterestRate] = useState('8')
  const [loading, setLoading] = useState(false)

  const handleLend = async () => {
    if (!wallet || !publicKey || !vaultConfig) {
      toast.error('Please connect your wallet')
      return
    }

    setLoading(true)
    const toastId = toast.loading('Generating lending proof...')

    try {
      const provider = getProvider(wallet)
      const program = getProgram(provider)

      const [vaultConfigPda] = getVaultConfigPda()
      const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
      const [lendingPositionPda] = getLendingPositionPda(vaultConfigPda, publicKey)
      const [shieldedVaultAta] = getShieldedVaultPda(vaultConfig.shieldedMint)

      let actionParam
      let interestRateBps = 0

      if (action === 'borrow') {
        const collateral = parseAmount(collateralAmount)
        const borrow = parseAmount(borrowAmount)
        interestRateBps = parseInt(interestRate) * 100

        const { collateralCommitment, borrowCommitment } = privacyCash.generateLendingProof({
          collateralAmount: collateral,
          borrowAmount: borrow,
          interestRateBps,
        })

        actionParam = {
          borrow: {
            collateralCommitment,
            borrowCommitment,
          },
        }
      } else {
        const repay = parseAmount(repayAmount)
        const { repaymentCommitment } = privacyCash.generateRepaymentProof(repay)

        actionParam = {
          repay: {
            repaymentCommitment,
          },
        }
      }

      toast.loading('Submitting private lending transaction...', { id: toastId })

      const tx = await program.methods
        .privateLend({
          action: actionParam,
          interestRateBps,
        })
        .accountsStrict({
          user: publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          lendingPosition: lendingPositionPda,
          shieldedVaultAta,
          shieldedMint: vaultConfig.shieldedMint,
          privacyCashProgram: PRIVACY_CASH_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      toast.success(
        <div>
          {action === 'borrow' ? 'Borrow' : 'Repayment'} successful!{' '}
          <a href={getSolscanUrl(tx)} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </div>,
        { id: toastId }
      )
      setCollateralAmount('')
      setBorrowAmount('')
      setRepayAmount('')
      onSuccess()
    } catch (error) {
      console.error('Lending failed:', error)
      toast.error(`Lending failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        id: toastId,
      })
    } finally {
      setLoading(false)
    }
  }

  const hasActiveLoan = userPosition?.hasActiveLoan ?? false

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
            <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
          </svg>
          Private Lending
        </h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setAction('borrow')}
            disabled={hasActiveLoan}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              action === 'borrow'
                ? 'bg-primary text-surface'
                : 'bg-surface border border-surface-border text-text-secondary hover:border-text-muted'
            } ${hasActiveLoan ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Borrow
          </button>
          <button
            onClick={() => setAction('repay')}
            disabled={!hasActiveLoan}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              action === 'repay'
                ? 'bg-primary text-surface'
                : 'bg-surface border border-surface-border text-text-secondary hover:border-text-muted'
            } ${!hasActiveLoan ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Repay
          </button>
        </div>

        {action === 'borrow' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Collateral Amount (SOL)
              </label>
              <input
                type="number"
                value={collateralAmount}
                onChange={(e) => setCollateralAmount(e.target.value)}
                placeholder="0.00"
                className="input-field"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Borrow Amount (SOL)
              </label>
              <input
                type="number"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
                placeholder="0.00"
                className="input-field"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Interest Rate (%)
              </label>
              <input
                type="number"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="8"
                className="input-field"
                disabled={loading}
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Repayment Amount (SOL)
            </label>
            <input
              type="number"
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              placeholder="0.00"
              className="input-field"
              disabled={loading}
            />
          </div>
        )}

        <div className="p-3 bg-surface rounded-lg border border-surface-border text-sm text-text-secondary">
          Powered by Privacy Cash for anonymous lending
        </div>

        <button
          onClick={handleLend}
          disabled={loading || !vaultConfig}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Processing...</span>
            </>
          ) : (
            <span>{action === 'borrow' ? 'Create Private Loan' : 'Repay Privately'}</span>
          )}
        </button>
      </div>
    </motion.div>
  )
}
