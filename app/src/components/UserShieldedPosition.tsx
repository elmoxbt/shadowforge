import { UserEncryptedPosition, VaultConfig } from '../types'
import { formatAmount, formatBps, shortenAddress } from '../lib/utils'
import { LoadingSpinner } from './LoadingSpinner'
import { PublicKey } from '@solana/web3.js'

interface UserShieldedPositionProps {
  position: UserEncryptedPosition | null
  vaultConfig: VaultConfig | null
  loading: boolean
  onAction: (action: string) => void
}

export function UserShieldedPosition({
  position,
  vaultConfig,
  loading,
  onAction,
}: UserShieldedPositionProps) {
  if (loading) {
    return (
      <div className="bg-surface-light border border-surface-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold">Your Shielded Position</h2>
        </div>
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    )
  }

  if (!position) {
    return (
      <div className="bg-surface-light border border-surface-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold">Your Shielded Position</h2>
        </div>
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">No Shielded Position</h3>
          <p className="text-text-secondary text-sm mb-6">
            Deposit assets to create your first private position
          </p>
          <button onClick={() => onAction('deposit')} className="btn-primary">
            Shield Assets
          </button>
        </div>
      </div>
    )
  }

  const estimatedYield = vaultConfig
    ? (vaultConfig.currentYieldBps / 10000) * 0.1
    : 0

  return (
    <div className="bg-surface-light border border-surface-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-surface-border flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
          </svg>
          Your Shielded Position
        </h2>
        <div className="flex items-center gap-2">
          {position.complianceVerified && (
            <span className="badge-success">
              <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              Compliant
            </span>
          )}
          {position.hasActiveLoan && <span className="badge-warning">Active Loan</span>}
          {position.hasPendingBridge && <span className="badge-warning">Pending Bridge</span>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-surface">
              <th className="table-header">Asset</th>
              <th className="table-header text-right">Shielded Balance</th>
              <th className="table-header text-right">Est. Yield</th>
              <th className="table-header text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="table-cell">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <span className="text-primary text-sm font-bold">S</span>
                  </div>
                  <div>
                    <div className="font-medium">Shielded SOL</div>
                    <div className="text-xs text-text-secondary">
                      {shortenAddress(vaultConfig?.shieldedMint || PublicKey.default)}
                    </div>
                  </div>
                </div>
              </td>
              <td className="table-cell text-right">
                <div className="font-mono">
                  <span className="text-primary">●●●●</span>
                  <span className="text-text-muted text-xs ml-1">encrypted</span>
                </div>
              </td>
              <td className="table-cell text-right">
                <div className="font-mono text-primary">
                  +{(estimatedYield * 100).toFixed(2)}%
                </div>
              </td>
              <td className="table-cell text-right">
                <span className="badge-success">Active</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-surface-border bg-surface/50">
        <div className="grid grid-cols-4 gap-4 text-center text-sm">
          <div>
            <div className="text-text-secondary">Deposits</div>
            <div className="font-mono font-medium">{position.depositCount}</div>
          </div>
          <div>
            <div className="text-text-secondary">Withdrawals</div>
            <div className="font-mono font-medium">{position.withdrawalCount}</div>
          </div>
          <div>
            <div className="text-text-secondary">Actions</div>
            <div className="font-mono font-medium">{position.actionCount}</div>
          </div>
          <div>
            <div className="text-text-secondary">APY</div>
            <div className="font-mono font-medium text-primary">
              {vaultConfig ? formatBps(vaultConfig.currentYieldBps) : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-surface-border">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onAction('deposit')} className="btn-secondary text-sm">
            Deposit
          </button>
          <button onClick={() => onAction('withdraw')} className="btn-secondary text-sm">
            Withdraw
          </button>
          <button onClick={() => onAction('lend')} className="btn-secondary text-sm">
            Lend
          </button>
          <button onClick={() => onAction('swap')} className="btn-secondary text-sm">
            Swap
          </button>
          <button onClick={() => onAction('bridge')} className="btn-secondary text-sm">
            Bridge
          </button>
        </div>
      </div>
    </div>
  )
}
