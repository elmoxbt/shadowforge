import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { DEVNET_RPC } from './lib/anchor'
import './index.css'
import '@solana/wallet-adapter-react-ui/styles.css'

const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={DEVNET_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 5000,
              style: {
                background: '#111111',
                color: '#ffffff',
                border: '1px solid #222222',
                borderRadius: '12px',
              },
              success: {
                iconTheme: { primary: '#00ff00', secondary: '#111111' },
              },
              error: {
                iconTheme: { primary: '#ff4444', secondary: '#111111' },
              },
            }}
          />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
)
