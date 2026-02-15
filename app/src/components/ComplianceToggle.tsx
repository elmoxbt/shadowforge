import { useState } from 'react'
import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { motion } from 'framer-motion'
import { SystemProgram, PublicKey } from '@solana/web3.js'
import toast from 'react-hot-toast'
import { getProvider, getProgram } from '../lib/anchor'
import { getVaultConfigPda, getUserPositionPda, getCompliancePda, getSolscanUrl } from '../lib/utils'
import { rangeCompliance } from '../lib/sdkIntegrations'
import { LoadingSpinner } from './LoadingSpinner'
import { VaultConfig, ComplianceAttestation } from '../types'

interface ComplianceToggleProps {
  vaultConfig: VaultConfig | null
  compliance: ComplianceAttestation | null
  onSuccess: () => void
}

const RANGE_PROGRAM_ID = new PublicKey('RANGE11111111111111111111111111111111111111')

export function ComplianceToggle({ vaultConfig, compliance, onSuccess }: ComplianceToggleProps) {
  const { publicKey } = useWallet()
  const wallet = useAnchorWallet()
  const [loading, setLoading] = useState(false)

  const isCompliant = compliance?.isValid ?? false

  const handleToggle = async () => {
    if (!wallet || !publicKey || !vaultConfig) {
      toast.error('Please connect your wallet')
      return
    }

    setLoading(true)
    const toastId = toast.loading(isCompliant ? 'Revoking compliance...' : 'Submitting compliance...')

    try {
      const provider = getProvider(wallet)
      const program = getProgram(provider)

      const [vaultConfigPda] = getVaultConfigPda()
      const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
      const [compliancePda] = getCompliancePda(vaultConfigPda, publicKey)

      const { attestationHash, disclosureProof } = rangeCompliance.generateComplianceAttestation({
        userAddress: publicKey,
        jurisdiction: 'US',
        validityDays: 30,
      })

      const actionParam = isCompliant ? { revoke: {} } : { submit: {} }

      const tx = await program.methods
        .applyCompliance({
          action: actionParam,
          attestationHash,
          disclosureProof,
          validityDays: 30,
        })
        .accountsStrict({
          user: publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          complianceAttestation: compliancePda,
          rangeProgram: RANGE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' })

      toast.success(
        <div>
          {isCompliant ? 'Compliance revoked' : 'Compliance verified!'}{' '}
          <a href={getSolscanUrl(tx)} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </div>,
        { id: toastId }
      )
      onSuccess()
    } catch (error) {
      console.error('Compliance failed:', error)
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        id: toastId,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-light border border-surface-border rounded-xl p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isCompliant ? 'bg-primary/20' : 'bg-surface'
            }`}
          >
            <svg
              className={`w-5 h-5 ${isCompliant ? 'text-primary' : 'text-text-muted'}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </div>
          <div>
            <div className="font-medium">Compliance Status</div>
            <div className="text-sm text-text-secondary">
              {isCompliant ? 'Verified via Range Protocol' : 'Not verified'}
            </div>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={loading || !vaultConfig}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
            isCompliant
              ? 'bg-surface border border-surface-border text-text-secondary hover:border-danger hover:text-danger'
              : 'bg-primary text-surface hover:bg-primary-dim'
          }`}
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Processing...</span>
            </>
          ) : isCompliant ? (
            'Revoke'
          ) : (
            'Verify'
          )}
        </button>
      </div>

      {compliance && isCompliant && (
        <div className="mt-4 pt-4 border-t border-surface-border">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-secondary">Risk Score</span>
              <div className="font-mono text-primary">{compliance.riskScore}/100</div>
            </div>
            <div>
              <span className="text-text-secondary">Expires</span>
              <div className="font-mono">
                {new Date(compliance.expiresAt.toNumber() * 1000).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
