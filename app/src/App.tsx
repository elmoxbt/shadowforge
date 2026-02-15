import { useState, useEffect, useCallback } from 'react'
import { useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './components/Header'
import { HeroSection } from './components/HeroSection'
import { UserShieldedPosition } from './components/UserShieldedPosition'
import { VaultPrivacyStats } from './components/VaultPrivacyStats'
import { PrivateDepositForm } from './components/PrivateDepositForm'
import { PrivateWithdrawForm } from './components/PrivateWithdrawForm'
import { PrivateLendForm } from './components/PrivateLendForm'
import { PrivateSwapForm } from './components/PrivateSwapForm'
import { PrivateBridgeForm } from './components/PrivateBridgeForm'
import { ComplianceToggle } from './components/ComplianceToggle'
import { MevShieldSimulator } from './components/MevShieldSimulator'
import { PrivateIntentRouter } from './components/PrivateIntentRouter'
import { getProvider, getProgram, getProgramReadOnly } from './lib/anchor'
import { getVaultConfigPda, getUserPositionPda, getCompliancePda } from './lib/utils'
import { VaultConfig, UserEncryptedPosition, ComplianceAttestation } from './types'

type ActiveForm = 'deposit' | 'withdraw' | 'lend' | 'swap' | 'bridge' | null

export default function App() {
  const { publicKey, connected } = useWallet()
  const wallet = useAnchorWallet()
  const [vaultConfig, setVaultConfig] = useState<VaultConfig | null>(null)
  const [userPosition, setUserPosition] = useState<UserEncryptedPosition | null>(null)
  const [compliance, setCompliance] = useState<ComplianceAttestation | null>(null)
  const [userTokenAccount, setUserTokenAccount] = useState<PublicKey | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeForm, setActiveForm] = useState<ActiveForm>(null)
  const [showSimulator, setShowSimulator] = useState(false)
  const [showIntentRouter, setShowIntentRouter] = useState(false)

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const program = wallet ? getProgram(getProvider(wallet)) : getProgramReadOnly()
      const [vaultConfigPda] = getVaultConfigPda()

      const config = await program.account.vaultConfig.fetchNullable(vaultConfigPda)
      if (config) {
        setVaultConfig(config as unknown as VaultConfig)

        if (publicKey) {
          const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
          const [compliancePda] = getCompliancePda(vaultConfigPda, publicKey)

          const [position, complianceData] = await Promise.all([
            program.account.userEncryptedPosition.fetchNullable(userPositionPda),
            program.account.complianceAttestation.fetchNullable(compliancePda),
          ])

          setUserPosition(position as unknown as UserEncryptedPosition | null)
          setCompliance(complianceData as unknown as ComplianceAttestation | null)

          try {
            const ata = getAssociatedTokenAddressSync(
              config.shieldedMint as PublicKey,
              publicKey,
              false,
              TOKEN_2022_PROGRAM_ID
            )
            setUserTokenAccount(ata)
          } catch {
            setUserTokenAccount(null)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [publicKey, wallet])

  useEffect(() => {
    fetchData(true)
    const interval = setInterval(() => fetchData(false), 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleSuccess = () => {
    setActiveForm(null)
    fetchData()
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <HeroSection
          onOpenSimulator={() => setShowSimulator(true)}
          onOpenIntentRouter={() => setShowIntentRouter(true)}
        />

        <AnimatePresence>
          {showSimulator && (
            <div className="mb-6">
              <MevShieldSimulator
                vaultConfig={vaultConfig}
                isVisible={showSimulator}
                onClose={() => setShowSimulator(false)}
              />
            </div>
          )}
          {showIntentRouter && (
            <div className="mb-6">
              <PrivateIntentRouter
                vaultConfig={vaultConfig}
                isVisible={showIntentRouter}
                onClose={() => setShowIntentRouter(false)}
                onSuccess={handleSuccess}
              />
            </div>
          )}
        </AnimatePresence>

        {connected ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <UserShieldedPosition
                position={userPosition}
                vaultConfig={vaultConfig}
                loading={loading}
                onAction={(action) => setActiveForm(action as ActiveForm)}
              />

              <AnimatePresence mode="wait">
                {activeForm === 'deposit' && (
                  <PrivateDepositForm
                    key="deposit"
                    vaultConfig={vaultConfig}
                    userTokenAccount={userTokenAccount}
                    onSuccess={handleSuccess}
                    onClose={() => setActiveForm(null)}
                  />
                )}
                {activeForm === 'withdraw' && (
                  <PrivateWithdrawForm
                    key="withdraw"
                    vaultConfig={vaultConfig}
                    userTokenAccount={userTokenAccount}
                    onSuccess={handleSuccess}
                    onClose={() => setActiveForm(null)}
                  />
                )}
                {activeForm === 'lend' && (
                  <PrivateLendForm
                    key="lend"
                    vaultConfig={vaultConfig}
                    userPosition={userPosition}
                    onSuccess={handleSuccess}
                    onClose={() => setActiveForm(null)}
                  />
                )}
                {activeForm === 'swap' && (
                  <PrivateSwapForm
                    key="swap"
                    vaultConfig={vaultConfig}
                    onSuccess={handleSuccess}
                    onClose={() => setActiveForm(null)}
                  />
                )}
                {activeForm === 'bridge' && (
                  <PrivateBridgeForm
                    key="bridge"
                    vaultConfig={vaultConfig}
                    userPosition={userPosition}
                    onSuccess={handleSuccess}
                    onClose={() => setActiveForm(null)}
                  />
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-6">
              <VaultPrivacyStats vaultConfig={vaultConfig} loading={loading} />
              <ComplianceToggle
                vaultConfig={vaultConfig}
                compliance={compliance}
                onSuccess={fetchData}
              />
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-light flex items-center justify-center">
              <svg className="w-8 h-8 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
            <p className="text-text-secondary">
              Connect a Solana wallet to view your shielded positions
            </p>
          </motion.div>
        )}
      </main>

      <footer className="border-t border-surface-border mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <defs>
                  <linearGradient id="footerShadowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#00ff00', stopOpacity:1}} />
                    <stop offset="100%" style={{stopColor:'#009900', stopOpacity:1}} />
                  </linearGradient>
                  <clipPath id="footerMoonClip">
                    <circle cx="12" cy="12" r="8"/>
                  </clipPath>
                </defs>
                <g clipPath="url(#footerMoonClip)">
                  <circle cx="12" cy="12" r="8" fill="url(#footerShadowGrad)"/>
                  <circle cx="17" cy="12" r="7" fill="#1a1a2e"/>
                </g>
                <circle cx="12" cy="12" r="8" fill="none" stroke="url(#footerShadowGrad)" strokeWidth="0.5" opacity="0.8"/>
              </svg>
              <span>All your privacy tools in one place</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <span>Solana Privacy Hackathon 2025</span>
              <span className="text-primary">Devnet</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
