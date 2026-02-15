import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useWallet } from '@solana/wallet-adapter-react'
import { motion } from 'framer-motion'

export function Header() {
  const { connected } = useWallet()

  return (
    <header className="border-b border-surface-border bg-surface/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-[#1a1a2e] flex items-center justify-center overflow-hidden">
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <defs>
                  <linearGradient id="headerShadowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{stopColor:'#00ff00', stopOpacity:1}} />
                    <stop offset="100%" style={{stopColor:'#009900', stopOpacity:1}} />
                  </linearGradient>
                  <clipPath id="headerMoonClip">
                    <circle cx="12" cy="12" r="8"/>
                  </clipPath>
                </defs>
                <circle cx="12" cy="12" r="10" fill="#1a1a2e"/>
                <circle cx="12" cy="12" r="9.5" fill="none" stroke="url(#headerShadowGrad)" strokeWidth="0.5" opacity="0.6"/>
                <g clipPath="url(#headerMoonClip)">
                  <circle cx="12" cy="12" r="8" fill="url(#headerShadowGrad)"/>
                  <circle cx="17" cy="12" r="7" fill="#1a1a2e"/>
                </g>
                <circle cx="12" cy="12" r="8" fill="none" stroke="url(#headerShadowGrad)" strokeWidth="0.5" opacity="0.8"/>
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">Shadow</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            {connected && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-medium text-primary">Devnet</span>
              </div>
            )}
            <WalletMultiButton className="!bg-surface-light !border !border-surface-border hover:!border-primary !rounded-lg !h-10 !text-sm !font-medium" />
          </motion.div>
        </div>
      </div>
    </header>
  )
}
