import { VaultConfig } from '../types'
import { formatAmount, formatBps } from '../lib/utils'
import { LoadingSpinner } from './LoadingSpinner'

interface VaultPrivacyStatsProps {
  vaultConfig: VaultConfig | null
  loading: boolean
}

export function VaultPrivacyStats({ vaultConfig, loading }: VaultPrivacyStatsProps) {
  if (loading) {
    return (
      <div className="bg-surface-light border border-surface-border rounded-xl p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    )
  }

  if (!vaultConfig) {
    return (
      <div className="bg-surface-light border border-surface-border rounded-xl p-6">
        <p className="text-text-secondary text-center py-4">Connect wallet to view vault stats</p>
      </div>
    )
  }

  const stats = [
    {
      label: 'Total Shielded TVL',
      value: `${formatAmount(vaultConfig.totalShieldedTvl)} SOL`,
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
        </svg>
      ),
    },
    {
      label: 'Active Positions',
      value: vaultConfig.totalPositions.toString(),
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      ),
    },
    {
      label: 'Current APY',
      value: formatBps(vaultConfig.currentYieldBps),
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
        </svg>
      ),
      positive: true,
    },
    {
      label: 'Deposit Fee',
      value: formatBps(vaultConfig.depositFeeBps),
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
        </svg>
      ),
    },
  ]

  const sdkStatus = [
    { name: 'Arcium', enabled: vaultConfig.arciumEnabled },
    { name: 'ShadowWire', enabled: vaultConfig.shadowwireEnabled },
    { name: 'Privacy Cash', enabled: vaultConfig.privacyCashEnabled },
    { name: 'SilentSwap', enabled: vaultConfig.silentswapEnabled },
    { name: 'Starpay', enabled: vaultConfig.starpayEnabled },
    { name: 'Anoncoin', enabled: vaultConfig.anoncoinEnabled },
    { name: 'Range', enabled: vaultConfig.rangeEnabled },
  ]

  return (
    <div className="bg-surface-light border border-surface-border rounded-xl overflow-hidden">

      <div className="p-4 border-b border-surface-border">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          </svg>
          Vault Status
        </h2>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat, i) => (
            <div key={i} className="p-3 bg-surface rounded-lg">
              <div className="flex items-center gap-2 text-text-secondary text-xs mb-1">
                {stat.icon}
                <span>{stat.label}</span>
              </div>
              <div className={`text-lg font-bold font-mono ${stat.positive ? 'text-primary' : ''}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2">
          <div className="text-xs text-text-secondary mb-2">Privacy SDKs</div>
          <div className="flex flex-wrap gap-2">
            {sdkStatus.map((sdk, i) => (
              <div
                key={i}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  sdk.enabled
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-surface text-text-muted border border-surface-border'
                }`}
              >
                {sdk.name}
              </div>
            ))}
          </div>
        </div>

        {vaultConfig.isPaused && (
          <div className="mt-2 p-3 bg-danger/10 border border-danger/20 rounded-lg">
            <div className="flex items-center gap-2 text-danger text-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <span>Vault is paused</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
