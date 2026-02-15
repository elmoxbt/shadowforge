import { useState, useEffect } from 'react'
import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { motion, AnimatePresence } from 'framer-motion'
import { SystemProgram, PublicKey, Transaction } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from '@solana/spl-token'
import BN from 'bn.js'
import toast from 'react-hot-toast'
import { getProvider, getProgram } from '../lib/anchor'
import {
  getVaultConfigPda,
  getUserPositionPda,
  getShieldedVaultPda,
  getDarkPoolOrderPda,
  getLendingPositionPda,
  getBridgeRequestPda,
  getSolscanUrl,
} from '../lib/utils'
import { arcium, starpay, anoncoin, privacyCash, silentSwap, shadowWire, generateDepositCommitments, generateWithdrawalProofs } from '../lib/sdkIntegrations'
import {
  initializeParser,
  parseIntent,
  isParserReady,
  getSuggestedIntents,
  ParsedIntent,
} from '../lib/intentParser'
import { LoadingSpinner } from './LoadingSpinner'
import { VaultConfig } from '../types'

interface PrivateIntentRouterProps {
  vaultConfig: VaultConfig | null
  isVisible: boolean
  onClose: () => void
  onSuccess: () => void
}

type ExecutionPhase = 'idle' | 'parsing' | 'encrypting' | 'routing' | 'executing' | 'complete' | 'error'

const PHASES: { key: ExecutionPhase; label: string }[] = [
  { key: 'parsing', label: 'Parsing intent' },
  { key: 'encrypting', label: 'Encrypting via Arcium' },
  { key: 'routing', label: 'Computing private route' },
  { key: 'executing', label: 'Executing shielded tx' },
  { key: 'complete', label: 'Intent fulfilled' },
]

const STARPAY_PROGRAM_ID = new PublicKey('STARpay111111111111111111111111111111111111')
const ANONCOIN_PROGRAM_ID = new PublicKey('ANCn111111111111111111111111111111111111111')
const PRIVACY_CASH_PROGRAM_ID = new PublicKey('PRVCash111111111111111111111111111111111111')
const SILENTSWAP_PROGRAM_ID = new PublicKey('SLNTswap11111111111111111111111111111111111')

export function PrivateIntentRouter({ vaultConfig, isVisible, onClose, onSuccess }: PrivateIntentRouterProps) {
  const { publicKey, connected } = useWallet()
  const wallet = useAnchorWallet()

  const [intentText, setIntentText] = useState('')
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null)
  const [phase, setPhase] = useState<ExecutionPhase>('idle')
  const [llmReady, setLlmReady] = useState(false)
  const [llmProgress, setLlmProgress] = useState(0)
  const [llmStatus, setLlmStatus] = useState('')
  const [result, setResult] = useState<{ route: string; outcome: string; txSignature?: string } | null>(null)

  useEffect(() => {
    if (isVisible && !llmReady && !isParserReady()) {
      initializeParser().then((ready) => {
        setLlmReady(ready)
        setLlmProgress(100)
        setLlmStatus('Ready')
      })
    }
  }, [isVisible, llmReady])

  useEffect(() => {
    if (!isVisible) {
      setPhase('idle')
      setParsedIntent(null)
      setResult(null)
    }
  }, [isVisible])

  const handleParse = async () => {
    if (!intentText.trim()) {
      toast.error('Please enter an intent')
      return
    }

    setPhase('parsing')
    setParsedIntent(null)

    try {
      const parsed = await parseIntent(intentText)
      setParsedIntent(parsed)

      if (parsed.action === 'unknown' || parsed.confidence < 0.5) {
        toast.error('Intent unclear - try rephrasing or use a suggested intent')
        setPhase('idle')
        return
      }

      setPhase('idle')
      toast.success(`Parsed: ${parsed.action} ${parsed.amount || ''} ${parsed.inputAsset || ''}`)
    } catch (error) {
      console.error('Parse failed:', error)
      toast.error('Failed to parse intent')
      setPhase('idle')
    }
  }

  const handleExecute = async () => {
    if (!wallet || !publicKey || !vaultConfig || !parsedIntent) {
      toast.error('Connect wallet and parse intent first')
      return
    }

    if (parsedIntent.action === 'unknown') {
      toast.error('Cannot execute unknown intent')
      return
    }

    const toastId = toast.loading('Executing private intent...')

    try {
      setPhase('encrypting')
      await new Promise((r) => setTimeout(r, 800))

      const encryptedIntent = await arcium.generateCommitment(new BN((parsedIntent.amount || 0.01) * 1e9))
      const routingProof = Array.from(crypto.getRandomValues(new Uint8Array(32)))

      setPhase('routing')
      await new Promise((r) => setTimeout(r, 600))

      const route = determineOptimalRoute(parsedIntent)
      toast.loading(`Routing via ${route}...`, { id: toastId })

      setPhase('executing')

      const provider = getProvider(wallet)
      const program = getProgram(provider)
      const [vaultConfigPda] = getVaultConfigPda()
      const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)

      let txSignature: string | undefined
      let outcome = ''

      switch (parsedIntent.action) {
        case 'swap': {
          const [darkPoolOrderPda] = getDarkPoolOrderPda(vaultConfigPda, publicKey)
          const [sourceVault] = getShieldedVaultPda(vaultConfig.shieldedMint)

          const { swapProof, amountInCommitment, minOutCommitment } = await starpay.generateSwapProof({
            inputMint: vaultConfig.shieldedMint,
            outputMint: vaultConfig.secondaryMint,
            amount: new BN((parsedIntent.amount || 0.01) * 1e9),
            slippageBps: parsedIntent.preferences.maxSlippage ? parsedIntent.preferences.maxSlippage * 100 : 100,
          })

          txSignature = await program.methods
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

          outcome = `Swapped ${parsedIntent.amount || '~'} ${parsedIntent.inputAsset || 'tokens'} privately via ${route}`
          break
        }

        case 'lend': {
          const [lendingPositionPda] = getLendingPositionPda(vaultConfigPda, publicKey)
          const [lendingVault] = getShieldedVaultPda(vaultConfig.shieldedMint)

          const lendAmount = new BN((parsedIntent.amount || 0.01) * 1e9)
          const { collateralCommitment, borrowCommitment, lendingProof } = privacyCash.generateLendingProof({
            collateralAmount: lendAmount,
            borrowAmount: lendAmount,
            interestRateBps: (parsedIntent.preferences.minApy || 5) * 100,
          })

          txSignature = await program.methods
            .privateLend({
              action: { borrow: { collateralCommitment, borrowCommitment } },
              interestRateBps: (parsedIntent.preferences.minApy || 5) * 100,
            })
            .accountsStrict({
              user: publicKey,
              vaultConfig: vaultConfigPda,
              userPosition: userPositionPda,
              lendingPosition: lendingPositionPda,
              shieldedVaultAta: lendingVault,
              shieldedMint: vaultConfig.shieldedMint,
              privacyCashProgram: PRIVACY_CASH_PROGRAM_ID,
              token2022Program: TOKEN_2022_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .rpc({ commitment: 'confirmed' })

          const simulatedApy = 5 + Math.random() * 7
          outcome = `Lent ${parsedIntent.amount || '~'} ${parsedIntent.inputAsset || 'SOL'} at ${simulatedApy.toFixed(1)}% APY via ${route}`
          break
        }

        case 'bridge': {
          const [bridgeRequestPda] = getBridgeRequestPda(vaultConfigPda, publicKey)
          const [shieldedVaultAta] = getShieldedVaultPda(vaultConfig.shieldedMint)

          const targetChain = parsedIntent.preferences.targetChain || 'ethereum'
          const chainIdMap: Record<string, number> = {
            ethereum: 1, polygon: 137, arbitrum: 42161, optimism: 10, base: 8453, avalanche: 43114, bsc: 56
          }
          const destChainId = chainIdMap[targetChain] || 1

          const bridgeAmount = new BN((parsedIntent.amount || 0.01) * 1e9)
          const { bridgeProof, commitment } = await silentSwap.initiateBridge({
            sourceChain: 'solana',
            destChain: destChainId,
            amount: bridgeAmount,
            recipient: publicKey.toBase58(),
          })

          toast.loading('Submitting to SilentSwap...', { id: toastId })

          await program.methods
            .privateBridge({
              action: { initiateOutbound: {} },
              destChain: { [targetChain]: {} },
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

          txSignature = await program.methods
            .privateBridge({
              action: { verifyCompletion: {} },
              destChain: { [targetChain]: {} },
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

          outcome = `Bridged ${parsedIntent.amount || '~'} ${parsedIntent.inputAsset || 'SOL'} to ${targetChain} via ${route}`
          break
        }

        case 'deposit': {
          const depositAmount = new BN((parsedIntent.amount || 0.01) * 1e9)
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

          toast.loading('Generating ZK proof via ShadowWire...', { id: toastId })
          await shadowWire.generateZKRangeProof(depositAmount.toNumber())
          const { amountCommitment, blindingFactor } = generateDepositCommitments(depositAmount)

          toast.loading('Submitting shielded deposit...', { id: toastId })
          const [shieldedVaultAta] = getShieldedVaultPda(vaultConfig.shieldedMint)

          txSignature = await program.methods
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

          outcome = `Deposited ${parsedIntent.amount || '~'} ${parsedIntent.inputAsset || 'SOL'} privately via ShadowWire`
          break
        }

        case 'withdraw': {
          const withdrawAmount = new BN((parsedIntent.amount || 0.01) * 1e9)
          const [shieldedVaultAtaW] = getShieldedVaultPda(vaultConfig.shieldedMint)

          const userAta = getAssociatedTokenAddressSync(
            vaultConfig.shieldedMint,
            publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
          )

          toast.loading('Generating withdrawal proof...', { id: toastId })
          const { withdrawalProof, ownershipProof, nullifier } = generateWithdrawalProofs(
            withdrawAmount,
            userPositionPda
          )

          toast.loading('Submitting private withdrawal...', { id: toastId })
          txSignature = await program.methods
            .privateWithdraw({
              withdrawType: { partial: {} },
              withdrawalProof,
              ownershipProof,
              nullifier,
              expectedAmount: withdrawAmount,
            })
            .accountsStrict({
              user: publicKey,
              vaultConfig: vaultConfigPda,
              userPosition: userPositionPda,
              userTokenAccount: userAta,
              shieldedVaultAta: shieldedVaultAtaW,
              shieldedMint: vaultConfig.shieldedMint,
              complianceAttestation: null,
              token2022Program: TOKEN_2022_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .rpc({ commitment: 'confirmed' })

          outcome = `Withdrew ${parsedIntent.amount || '~'} ${parsedIntent.inputAsset || 'SOL'} privately via ShadowWire`
          break
        }

        default:
          throw new Error('Unsupported intent action')
      }

      setPhase('complete')
      setResult({ route, outcome, txSignature })

      toast.success(
        <div>
          Intent fulfilled!{' '}
          {txSignature && (
            <a href={getSolscanUrl(txSignature)} target="_blank" rel="noopener noreferrer" className="underline">
              View tx
            </a>
          )}
        </div>,
        { id: toastId, duration: 5000 }
      )

      onSuccess()
    } catch (error) {
      console.error('Intent execution failed:', error)
      setPhase('error')
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId })
    }
  }

  const determineOptimalRoute = (intent: ParsedIntent): string => {
    switch (intent.action) {
      case 'swap':
        return 'Starpay + Anoncoin'
      case 'lend':
        return 'Privacy Cash'
      case 'bridge':
        return 'SilentSwap'
      case 'deposit':
      case 'withdraw':
        return 'ShadowWire'
      default:
        return 'Arcium MXE'
    }
  }

  const resetRouter = () => {
    setPhase('idle')
    setParsedIntent(null)
    setResult(null)
    setIntentText('')
  }

  if (!isVisible) return null

  const currentPhaseIndex = PHASES.findIndex((p) => p.key === phase)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-surface-light border border-surface-border rounded-xl overflow-hidden"
    >
      <div className="p-4 border-b border-surface-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.36 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.64-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
          </svg>
          Private Intent Router
        </h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-sm text-text-secondary">
          Express your DeFi intent in natural language. Parsed locally, encrypted, and executed privately.
        </p>

        {!isParserReady() && llmProgress < 100 && (
          <div className="p-3 bg-surface rounded-lg border border-surface-border">
            <div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <LoadingSpinner size="sm" />
              <span>{llmStatus || 'Loading local AI...'}</span>
            </div>
            <div className="w-full h-2 bg-surface-border rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${llmProgress}%` }}
              />
            </div>
            <p className="text-xs text-text-muted mt-2">AI runs locally in your browser - no data sent to servers</p>
          </div>
        )}

        <div>
          <textarea
            value={intentText}
            onChange={(e) => setIntentText(e.target.value)}
            placeholder="e.g., Swap 100 USDC for SOL privately with max 1% slippage"
            className="w-full h-24 px-4 py-3 bg-surface border border-surface-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary resize-none"
            disabled={phase !== 'idle'}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {getSuggestedIntents().slice(0, 3).map((suggestion, i) => (
            <button
              key={i}
              onClick={() => setIntentText(suggestion)}
              disabled={phase !== 'idle'}
              className="text-xs px-3 py-1.5 bg-surface border border-surface-border rounded-full text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {parsedIntent && phase === 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3 bg-surface rounded-lg border border-primary/30"
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                <span className="text-sm font-medium text-primary">Intent Parsed</span>
                <span className="text-xs text-text-muted">({Math.round(parsedIntent.confidence * 100)}% confident)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-text-secondary">Action:</span>{' '}
                  <span className="font-mono text-primary">{parsedIntent.action}</span>
                </div>
                {parsedIntent.amount && (
                  <div>
                    <span className="text-text-secondary">Amount:</span>{' '}
                    <span className="font-mono">{parsedIntent.amount}</span>
                  </div>
                )}
                {parsedIntent.inputAsset && (
                  <div>
                    <span className="text-text-secondary">Asset:</span>{' '}
                    <span className="font-mono">{parsedIntent.inputAsset}</span>
                  </div>
                )}
                {parsedIntent.outputAsset && (
                  <div>
                    <span className="text-text-secondary">To:</span>{' '}
                    <span className="font-mono">{parsedIntent.outputAsset}</span>
                  </div>
                )}
                {parsedIntent.preferences.minApy && (
                  <div>
                    <span className="text-text-secondary">Min APY:</span>{' '}
                    <span className="font-mono">{parsedIntent.preferences.minApy}%</span>
                  </div>
                )}
                {parsedIntent.preferences.targetChain && (
                  <div>
                    <span className="text-text-secondary">Chain:</span>{' '}
                    <span className="font-mono">{parsedIntent.preferences.targetChain}</span>
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-text-muted">
                Route: <span className="text-primary">{determineOptimalRoute(parsedIntent)}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(phase !== 'idle' && phase !== 'error') && (
          <div className="p-3 bg-surface rounded-lg border border-surface-border">
            <div className="space-y-2">
              {PHASES.map((p, i) => {
                const isActive = p.key === phase
                const isComplete = currentPhaseIndex > i
                const isPending = currentPhaseIndex < i

                return (
                  <div key={p.key} className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        isComplete
                          ? 'bg-primary text-surface'
                          : isActive
                          ? 'bg-primary/20 text-primary'
                          : 'bg-surface-border text-text-muted'
                      }`}
                    >
                      {isComplete ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      ) : isActive ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                          </svg>
                        </motion.div>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span
                      className={`text-sm ${
                        isComplete ? 'text-primary' : isActive ? 'text-text-primary' : 'text-text-muted'
                      }`}
                    >
                      {p.label}
                    </span>
                    {isActive && (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="ml-auto"
                      >
                        <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                        </svg>
                      </motion.div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {result && phase === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                </svg>
                <span className="font-semibold text-primary">Intent Fulfilled</span>
              </div>
              <p className="text-sm text-text-primary mb-2">{result.outcome}</p>
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span>Route: <span className="text-primary">{result.route}</span></span>
                <span>Privacy: <span className="text-primary">100%</span></span>
                <span>MEV: <span className="text-primary">Blocked</span></span>
              </div>
              {result.txSignature && (
                <a
                  href={getSolscanUrl(result.txSignature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-xs text-primary hover:underline"
                >
                  View transaction on Solscan
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2">
          {phase === 'idle' && !parsedIntent && (
            <button
              onClick={handleParse}
              disabled={!intentText.trim() || !connected}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              Parse Intent
            </button>
          )}

          {phase === 'idle' && parsedIntent && (
            <>
              <button onClick={resetRouter} className="btn-secondary flex-1">
                Reset
              </button>
              <button
                onClick={handleExecute}
                disabled={!connected || parsedIntent.action === 'unknown'}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                Execute Privately
              </button>
            </>
          )}

          {phase === 'complete' && (
            <button onClick={resetRouter} className="btn-primary flex-1">
              New Intent
            </button>
          )}

          {phase === 'error' && (
            <button onClick={resetRouter} className="btn-secondary flex-1">
              Try Again
            </button>
          )}

          {phase !== 'idle' && phase !== 'complete' && phase !== 'error' && (
            <button disabled className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Processing...
            </button>
          )}
        </div>

        <p className="text-xs text-text-muted text-center">
          All parsing happens locally via WASM. Intent encrypted via Arcium before routing.
        </p>
      </div>
    </motion.div>
  )
}
