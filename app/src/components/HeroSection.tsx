import { motion } from 'framer-motion'
import { useWallet } from '@solana/wallet-adapter-react'

interface HeroSectionProps {
  onOpenSimulator?: () => void
  onOpenIntentRouter?: () => void
}

export function HeroSection({ onOpenSimulator, onOpenIntentRouter }: HeroSectionProps) {
  const { connected } = useWallet()

  // Show compact feature CTAs when connected
  if (connected) {
    return (
      <section className="py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-3">
          {onOpenIntentRouter && (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={onOpenIntentRouter}
              className="flex-1 group relative flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-500/10 to-purple-500/5 hover:from-purple-500/20 hover:to-purple-500/10 border border-purple-500/20 hover:border-purple-500/40 rounded-xl transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.36 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.64-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-purple-400">Intent Router</div>
                  <div className="text-xs text-text-secondary">Natural language DeFi</div>
                </div>
              </div>
            </motion.button>
          )}
          {onOpenSimulator && (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              onClick={onOpenSimulator}
              className="flex-1 group relative flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 border border-primary/20 hover:border-primary/40 rounded-xl transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-primary">MEV Simulator</div>
                  <div className="text-xs text-text-secondary">See protection in action</div>
                </div>
              </div>
            </motion.button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
            <span className="text-sm font-medium text-primary">Private DeFi on Solana</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Track Your{' '}
            <span className="text-gradient">Shielded</span>
            {' '}Positions
          </h1>

          <p className="text-lg md:text-xl text-text-secondary mb-8 max-w-2xl mx-auto">
            Invisible to MEV bots. Your deposits, swaps, and yields stay private with zero-knowledge proofs.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            {onOpenIntentRouter && (
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                onClick={onOpenIntentRouter}
                className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-500/20 to-purple-500/10 hover:from-purple-500/30 hover:to-purple-500/20 border border-purple-500/30 hover:border-purple-500/50 rounded-xl transition-all duration-300"
              >
                <div className="absolute inset-0 bg-purple-500/5 rounded-xl blur-xl group-hover:blur-2xl transition-all" />
                <div className="relative flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.36 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.64-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-purple-400">Private Intent Router</div>
                    <div className="text-xs text-text-secondary">Natural language DeFi execution</div>
                  </div>
                </div>
              </motion.button>
            )}
            {onOpenSimulator && (
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.15 }}
                onClick={onOpenSimulator}
                className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-primary/20 to-primary/10 hover:from-primary/30 hover:to-primary/20 border border-primary/30 hover:border-primary/50 rounded-xl transition-all duration-300"
              >
                <div className="absolute inset-0 bg-primary/5 rounded-xl blur-xl group-hover:blur-2xl transition-all" />
                <div className="relative flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-primary">MEV Shield Simulator</div>
                    <div className="text-xs text-text-secondary">Watch bots get blocked</div>
                  </div>
                </div>
              </motion.button>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-4 mb-12">
            <Feature
              icon={
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                </svg>
              }
              text="Encrypted Balances"
            />
            <Feature
              icon={
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                </svg>
              }
              text="MEV Protection"
            />
            <Feature
              icon={
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                </svg>
              }
              text="Cross-Chain Privacy"
            />
            <Feature
              icon={
                <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              }
              text="Compliant"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-surface-light border border-surface-border rounded-2xl p-8"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Stat label="Total Shielded" value="$2.4M" />
            <Stat label="Active Positions" value="1,247" />
            <Stat label="Avg APY" value="12.5%" positive />
            <Stat label="Privacy Score" value="100%" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface-light rounded-lg border border-surface-border">
      {icon}
      <span className="text-sm font-medium">{text}</span>
    </div>
  )
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div>
      <div className={`text-2xl md:text-3xl font-bold font-mono ${positive ? 'text-primary' : 'text-text-primary'}`}>
        {value}
      </div>
      <div className="text-sm text-text-secondary mt-1">{label}</div>
    </div>
  )
}
