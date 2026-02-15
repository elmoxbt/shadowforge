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
  getDarkPoolOrderPda,
  getSolscanUrl,
} from '../lib/utils'
import { starpay, anoncoin } from '../lib/sdkIntegrations'
import { LoadingSpinner } from './LoadingSpinner'
import { VaultConfig } from '../types'

interface PrivateSwapFormProps {
  vaultConfig: VaultConfig | null
  onSuccess: () => void
  onClose: () => void
}

const STARPAY_PROGRAM_ID = new PublicKey('STARpay111111111111111111111111111111111111')
const ANONCOIN_PROGRAM_ID = new PublicKey('ANCn111111111111111111111111111111111111111')

export function PrivateSwapForm({ vaultConfig, onSuccess, onClose }: PrivateSwapFormProps) {
  const { publicKey } = useWallet()
  const wallet = useAnchorWallet()
  const [amountIn, setAmountIn] = useState('')
  const [minAmountOut, setMinAmountOut] = useState('')
  const [slippage, setSlippage] = useState('1')
  const [route, setRoute] = useState<'starpay' | 'darkpool'>('starpay')
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [limitPrice, setLimitPrice] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSwap = async () => {
    if (!wallet || !publicKey || !vaultConfig) {
      toast.error('Please connect your wallet')
      return
    }

    const amount = parseAmount(amountIn)
    if (amount.isZero()) {
      toast.error('Please enter a valid amount')
      return
    }

    setLoading(true)
    const toastId = toast.loading('Generating swap proof...')

    try {
      const provider = getProvider(wallet)
      const program = getProgram(provider)

      const [vaultConfigPda] = getVaultConfigPda()
      const [userPositionPda] = getUserPositionPda(vaultConfigPda, publicKey)
      const [darkPoolOrderPda] = getDarkPoolOrderPda(vaultConfigPda, publicKey)
      const [sourceVault] = getShieldedVaultPda(vaultConfig.shieldedMint)

      let swapProof: number[]
      let amountInCommitment: number[]
      let minOutCommitment: number[]
      let limitPriceCommitment: number[] | null = null

      if (route === 'starpay') {
        const result = await starpay.generateSwapProof({
          inputMint: vaultConfig.shieldedMint,
          outputMint: vaultConfig.secondaryMint,
          amount,
          slippageBps: parseInt(slippage) * 100,
        })
        swapProof = result.swapProof
        amountInCommitment = result.amountInCommitment
        minOutCommitment = result.minOutCommitment
      } else {
        const price = parseAmount(limitPrice)
        const result = anoncoin.createDarkPoolOrder({
          side: orderSide,
          amount,
          limitPrice: price,
        })
        swapProof = result.orderProof
        amountInCommitment = result.amountCommitment
        minOutCommitment = result.priceCommitment
        limitPriceCommitment = result.priceCommitment
      }

      toast.loading('Executing private swap...', { id: toastId })

      const routeParam = route === 'starpay' ? { starpay: {} } : { anocoinDarkPool: {} }
      const actionParam =
        route === 'starpay' ? { execute: {} } : { placeLimitOrder: {} }
      const sideParam = orderSide === 'buy' ? { buy: {} } : { sell: {} }

      const tx = await program.methods
        .privateSwap({
          action: actionParam,
          route: routeParam,
          amountInCommitment,
          minOutCommitment,
          limitPriceCommitment,
          side: sideParam,
          swapProof,
          maxSlippageBps: parseInt(slippage) * 100,
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

      toast.success(
        <div>
          Swap executed privately!{' '}
          <a href={getSolscanUrl(tx)} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </div>,
        { id: toastId }
      )
      setAmountIn('')
      setMinAmountOut('')
      setLimitPrice('')
      onSuccess()
    } catch (error) {
      console.error('Swap failed:', error)
      toast.error(`Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
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
            <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z" />
          </svg>
          Private Swap
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
            onClick={() => setRoute('starpay')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              route === 'starpay'
                ? 'bg-primary text-surface'
                : 'bg-surface border border-surface-border text-text-secondary hover:border-text-muted'
            }`}
          >
            Starpay (Instant)
          </button>
          <button
            onClick={() => setRoute('darkpool')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              route === 'darkpool'
                ? 'bg-primary text-surface'
                : 'bg-surface border border-surface-border text-text-secondary hover:border-text-muted'
            }`}
          >
            Dark Pool
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Amount In (SOL)
          </label>
          <input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.00"
            className="input-field"
            disabled={loading}
          />
        </div>

        {route === 'starpay' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Min Amount Out
              </label>
              <input
                type="number"
                value={minAmountOut}
                onChange={(e) => setMinAmountOut(e.target.value)}
                placeholder="0.00"
                className="input-field"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Slippage (%)
              </label>
              <input
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                placeholder="1"
                className="input-field"
                disabled={loading}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOrderSide('buy')}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  orderSide === 'buy'
                    ? 'bg-primary text-surface'
                    : 'bg-surface border border-surface-border text-text-secondary'
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setOrderSide('sell')}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  orderSide === 'sell'
                    ? 'bg-danger text-surface'
                    : 'bg-surface border border-surface-border text-text-secondary'
                }`}
              >
                Sell
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Limit Price
              </label>
              <input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder="0.00"
                className="input-field"
                disabled={loading}
              />
            </div>
          </>
        )}

        <div className="p-3 bg-surface rounded-lg border border-surface-border text-sm text-text-secondary">
          {route === 'starpay'
            ? 'Instant ZK swap via Starpay'
            : 'Hidden order in Anoncoin dark pool'}
        </div>

        <button
          onClick={handleSwap}
          disabled={loading || !amountIn || !vaultConfig}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Processing...</span>
            </>
          ) : (
            <span>{route === 'starpay' ? 'Execute Private Swap' : 'Place Dark Pool Order'}</span>
          )}
        </button>
      </div>
    </motion.div>
  )
}
