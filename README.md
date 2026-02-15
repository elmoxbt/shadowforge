# ShadowForge: Private DeFi Aggregator on Solana

**A private DeFi platform on Solana devnet that supports shielded deposits, lending, swaps, bridging, and intent-based execution.** 

Program ID (Devnet): `[Brejex6T6bCkvVko2qCSW7LGK93anqEWoiuYs5pfu9oA]`

## Getting Started

### Prerequisites
- Node.js 18+
- Rust + Anchor 0.31.1
- Solana CLI
- Phantom or compatible wallet

### Installation

```bash
# Clone the repository
git clone https://github.com/elmoxbt/shadowforge.git
cd shadowforge

# Build and deploy the on-chain program
cd programs/shadowforge
anchor build
anchor deploy --provider.cluster devnet

# Install and run the frontend
cd ../../app
npm install
npm run dev