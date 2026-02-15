import { useState, useEffect } from 'react'
import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { motion, AnimatePresence } from 'framer-motion'
import { SystemProgram, PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import toast from 'react-hot-toast'
import { getProvider, getProgram } from '../lib/anchor'
import {
  getVaultConfigPda,
  getUserPositionPda,
  getShieldedVaultPda,
  getDarkPoolOrderPda,
  getSolscanUrl,
} from '../lib/utils'
import { starpay } from '../lib/sdkIntegrations'
import { LoadingSpinner } from './LoadingSpinner'
import { VaultConfig } from '../types'

interface MevShieldSimulatorProps {
  vaultConfig: VaultConfig | null
  isVisible: boolean
  onClose: () => void
}

type SimulationPhase = 'idle' | 'public-attack' | 'private-shield' | 'complete'

const STARPAY_PROGRAM_ID = new PublicKey('STARpay111111111111111111111111111111111111')
const ANONCOIN_PROGRAM_ID = new PublicKey('ANCn111111111111111111111111111111111111111')

// Simulated MEV loss calculation (realistic range for sandwich attacks)
function calculateMevLoss(): { percentage: number; amount: number } {
  const percentage = 5 + Math.random() * 15 // 5-20% loss
  const amount = 0.01 + Math.random() * 0.05 // 0.01-0.06 SOL
  return { percentage: Math.round(percentage * 100) / 100, amount: Math.round(amount * 1000) / 1000 }
}

export function MevShieldSimulator({ vaultConfig, isVisible, onClose }: MevShieldSimulatorProps) {
  const { publicKey, connected } = useWallet()
  const wallet = useAnchorWallet()
  const [phase, setPhase] = useState<SimulationPhase>('idle')
  const [mevLoss, setMevLoss] = useState({ percentage: 0, amount: 0 })
  const [publicBots, setPublicBots] = useState<number[]>([])
  const [privateBots, setPrivateBots] = useState<number[]>([])
  const [shieldActive, setShieldActive] = useState(false)
  const [txSignature, setTxSignature] = useState<string | null>(null)

  // Reset state when closing
  useEffect(() => {
    if (!isVisible) {
      setPhase('idle')
      setPublicBots([])
      setPrivateBots([])
      setShieldActive(false)
      setTxSignature(null)
    }
  }, [isVisible])

  const runSimulation = async () => {
    if (!connected) {
      toast.error('Connect wallet to run simulation')
      return
    }

    setPhase('public-attack')
    setMevLoss(calculateMevLoss())
    setPublicBots([])
    setPrivateBots([])
    setShieldActive(false)
    setTxSignature(null)

    // Phase 1: Public DeFi attack simulation (animated)
    const toastId = toast.loading('Simulating public swap...')

    // Animate bots attacking public side
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 400))
      setPublicBots((prev) => [...prev, i])
    }

    await new Promise((r) => setTimeout(r, 800))
    toast.loading('MEV bots detected! Front-run in progress...', { id: toastId })

    await new Promise((r) => setTimeout(r, 1200))

    // Phase 2: Private DeFi protection
    setPhase('private-shield')
    toast.loading('Now running through Shadow...', { id: toastId })

    // Activate shield
    await new Promise((r) => setTimeout(r, 500))
    setShieldActive(true)

    // Bots try to attack but get blocked
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 300))
      setPrivateBots((prev) => [...prev, i])
    }

    await new Promise((r) => setTimeout(r, 600))

    // Execute real private swap on devnet (if wallet connected and vault exists)
    if (wallet && publicKey && vaultConfig) {
      try {
        toast.loading('Executing private swap on devnet...', { id: toastId })

        const provider = getProvider(wallet)
        const program = getProgram(provider)

        const [vaultConfigPda] = getVaultConfigPda()
        const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
        const [darkPoolOrderPda] = getDarkPoolOrderPda(vaultConfigPda, publicKey)
        const [sourceVault] = getShieldedVaultPda(vaultConfig.shieldedMint)

        // Generate proof using SDK
        const { swapProof, amountInCommitment, minOutCommitment } = await starpay.generateSwapProof({
          inputMint: vaultConfig.shieldedMint,
          outputMint: vaultConfig.secondaryMint,
          amount: new BN(1000000), // 0.001 SOL equivalent
          slippageBps: 100,
        })

        const tx = await program.methods
          .privateSwap({
            action: { execute: {} },
            route: { starpay: {} },
            amountInCommitment,
            minOutCommitment,
            limitPriceCommitment: null,
            side: { buy: {} },
            swapProof,
            maxSlippageBps: 100,
          })
          .accountsStrict({
            user: publicKey,
            vaultConfig: vaultConfigPda,
            userPosition: userPositionPda,
            darkPoolOrder: darkPoolOrderPda,
            sourceMint: vaultConfig.shieldedMint,
            destMint: vaultConfig.secondaryMint,
            sourceVault,
            starpayProgram: STARPAY_PROGRAM_ID,
            anoncoinProgram: ANONCOIN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'confirmed' })

        setTxSignature(tx)
      } catch (error) {
        console.log('Simulation tx skipped (demo mode):', error)
        // Continue simulation even if tx fails (demo purposes)
      }
    }

    // Phase 3: Complete
    setPhase('complete')
    toast.success(
      <div className="flex items-center gap-2">
        <span>Shadow wins! MEV blocked.</span>
        {txSignature && (
          <a
            href={getSolscanUrl(txSignature)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View tx
          </a>
        )}
      </div>,
      { id: toastId, duration: 5000 }
    )
  }

  const resetSimulation = () => {
    setPhase('idle')
    setPublicBots([])
    setPrivateBots([])
    setShieldActive(false)
    setTxSignature(null)
  }

  if (!isVisible) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-surface-light border border-surface-border rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-surface-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
          </svg>
          MEV Shield Simulator
        </h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* Simulation Area */}
      <div className="p-4">
        {/* Description */}
        <p className="text-sm text-text-secondary mb-4">
          Watch how MEV bots attack public swaps vs. how Shadow protects your transactions.
        </p>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Public DeFi Panel */}
          <div className="relative bg-surface rounded-lg border border-surface-border p-4 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-danger animate-pulse" />
              <span className="text-sm font-medium text-danger">Public DeFi</span>
            </div>

            {/* Transaction visualization */}
            <div className="relative h-32 bg-surface-light rounded-lg border border-surface-border flex items-center justify-center overflow-hidden">
              {/* User transaction */}
              <motion.div
                className="absolute left-4 w-8 h-8 rounded-full bg-text-secondary/20 flex items-center justify-center z-10"
                animate={phase !== 'idle' ? { x: [0, 80, 80] } : {}}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
              >
                <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </motion.div>

              {/* MEV Bots attacking */}
              <AnimatePresence>
                {publicBots.map((bot, i) => (
                  <motion.div
                    key={`public-bot-${bot}`}
                    initial={{ opacity: 0, x: -20, y: -40 + i * 20 }}
                    animate={{ opacity: 1, x: 60, y: -40 + i * 20 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className="absolute"
                  >
                    <svg className="w-6 h-6 text-danger" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z" />
                    </svg>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Target */}
              <div className="absolute right-4 w-10 h-10 rounded-lg bg-surface-border flex items-center justify-center">
                <svg className="w-5 h-5 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
                </svg>
              </div>
            </div>

            {/* Loss metric */}
            <AnimatePresence>
              {(phase === 'public-attack' || phase === 'private-shield' || phase === 'complete') && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 p-2 bg-danger/10 border border-danger/20 rounded-lg"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-danger flex items-center gap-1">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                      </svg>
                      Sandwich Attack
                    </span>
                    <span className="font-mono text-danger font-bold">-{mevLoss.percentage}%</span>
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    Lost: <span className="font-mono text-danger">{mevLoss.amount} SOL</span> to MEV
                    bots
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Shadow Private Panel */}
          <div className="relative bg-surface rounded-lg border border-primary/30 p-4 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-medium text-primary">Shadow Private</span>
            </div>

            {/* Transaction visualization */}
            <div className="relative h-32 bg-surface-light rounded-lg border border-surface-border flex items-center justify-center overflow-hidden">
              {/* User transaction */}
              <motion.div
                className="absolute left-4 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center z-10"
                animate={phase === 'private-shield' || phase === 'complete' ? { x: [0, 80, 80] } : {}}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
              >
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </motion.div>

              {/* Shield */}
              <AnimatePresence>
                {shieldActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/50 flex items-center justify-center"
                    >
                      <svg className="w-10 h-10 text-primary" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                      </svg>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* MEV Bots blocked */}
              <AnimatePresence>
                {privateBots.map((bot, i) => (
                  <motion.div
                    key={`private-bot-${bot}`}
                    initial={{ opacity: 0, x: -20, y: -40 + i * 20 }}
                    animate={{ opacity: [0, 1, 0.3], x: [0, 30, 20], y: -40 + i * 20 }}
                    transition={{ duration: 0.8, delay: i * 0.1 }}
                    className="absolute"
                  >
                    <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z" />
                    </svg>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Target */}
              <div className="absolute right-4 w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
                </svg>
              </div>
            </div>

            {/* Protection metric */}
            <AnimatePresence>
              {(phase === 'private-shield' || phase === 'complete') && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 p-2 bg-primary/10 border border-primary/20 rounded-lg"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-primary flex items-center gap-1">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                      Protected
                    </span>
                    <span className="font-mono text-primary font-bold">+0% loss</span>
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    Saved: <span className="font-mono text-primary">{mevLoss.amount} SOL</span> from
                    MEV
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Summary Metrics */}
        <AnimatePresence>
          {phase === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg mb-4"
            >
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-text-secondary mb-1">Public Loss</div>
                  <div className="font-mono text-lg text-danger font-bold">-{mevLoss.percentage}%</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary mb-1">Shadow Saved</div>
                  <div className="font-mono text-lg text-primary font-bold">
                    +{mevLoss.amount} SOL
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary mb-1">MEV Blocked</div>
                  <div className="font-mono text-lg text-primary font-bold flex items-center justify-center gap-1">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                    </svg>
                    100%
                  </div>
                </div>
              </div>
              {txSignature && (
                <div className="mt-3 pt-3 border-t border-primary/20 text-center">
                  <a
                    href={getSolscanUrl(txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    View real private swap on Solscan
                  </a>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {phase === 'idle' ? (
            <button
              onClick={runSimulation}
              disabled={!connected}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run MEV Shield Simulation
            </button>
          ) : phase === 'complete' ? (
            <button
              onClick={resetSimulation}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
              Run Again
            </button>
          ) : (
            <button disabled className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Simulating...
            </button>
          )}
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-text-muted text-center mt-3">
          This simulation demonstrates MEV protection.
        </p>
      </div>
    </motion.div>
  )
}
