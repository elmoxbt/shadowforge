// Rule-based intent parser - runs instantly, no external dependencies

export interface ParsedIntent {
  action: 'swap' | 'lend' | 'bridge' | 'deposit' | 'withdraw' | 'unknown'
  inputAsset?: string
  outputAsset?: string
  amount?: number
  preferences: {
    minApy?: number
    maxSlippage?: number
    targetChain?: string
    compliance?: boolean
    urgency?: 'low' | 'normal' | 'high'
  }
  confidence: number
  rawParsed: string
}

export async function initializeParser(): Promise<boolean> {
  return true
}

export function isParserReady(): boolean {
  return true
}

export function getLoadProgress(): number {
  return 100
}

export async function parseIntent(intentText: string): Promise<ParsedIntent> {
  return parseWithRules(intentText)
}

function parseWithRules(intentText: string): ParsedIntent {
  const text = intentText.toLowerCase()

  const result: ParsedIntent = {
    action: 'unknown',
    preferences: {},
    confidence: 0.3,
    rawParsed: '',
  }

  if (text.includes('swap') || text.includes('exchange') || text.includes('trade') || text.includes('convert')) {
    result.action = 'swap'
    result.confidence = 0.8
  } else if (text.includes('lend') || text.includes('earn') || text.includes('yield') || text.includes('apy')) {
    result.action = 'lend'
    result.confidence = 0.8
  } else if (text.includes('bridge') || text.includes('transfer to') || text.includes('send to eth') || text.includes('move to')) {
    result.action = 'bridge'
    result.confidence = 0.8
  } else if (text.includes('deposit') || text.includes('shield') || text.includes('add')) {
    result.action = 'deposit'
    result.confidence = 0.8
  } else if (text.includes('withdraw') || text.includes('unshield') || text.includes('remove')) {
    result.action = 'withdraw'
    result.confidence = 0.8
  }

  const assetPatterns = [
    { pattern: /\b(sol|solana)\b/i, asset: 'SOL' },
    { pattern: /\b(usdc)\b/i, asset: 'USDC' },
    { pattern: /\b(usdt|tether)\b/i, asset: 'USDT' },
    { pattern: /\b(eth|ethereum)\b/i, asset: 'ETH' },
    { pattern: /\b(btc|bitcoin)\b/i, asset: 'BTC' },
    { pattern: /\b(bonk)\b/i, asset: 'BONK' },
    { pattern: /\b(jup|jupiter)\b/i, asset: 'JUP' },
  ]

  const foundAssets: string[] = []
  for (const { pattern, asset } of assetPatterns) {
    if (pattern.test(text)) {
      foundAssets.push(asset)
    }
  }

  if (foundAssets.length >= 1) {
    result.inputAsset = foundAssets[0]
    if (foundAssets.length >= 2) {
      result.outputAsset = foundAssets[1]
    }
    result.confidence += 0.1
  }

  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:sol|usdc|usdt|eth|btc)?/i)
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1])
    result.confidence += 0.05
  }

  const apyMatch = text.match(/(?:>|above|at least|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*%?\s*(?:apy|yield|interest)/i)
  if (apyMatch) {
    result.preferences.minApy = parseFloat(apyMatch[1])
  }

  const slippageMatch = text.match(/(?:max(?:imum)?|<|under)\s*(\d+(?:\.\d+)?)\s*%?\s*slippage/i)
  if (slippageMatch) {
    result.preferences.maxSlippage = parseFloat(slippageMatch[1])
  }

  if (text.includes('ethereum') || text.includes('eth chain')) {
    result.preferences.targetChain = 'ethereum'
  } else if (text.includes('polygon') || text.includes('matic')) {
    result.preferences.targetChain = 'polygon'
  } else if (text.includes('arbitrum') || text.includes('arb')) {
    result.preferences.targetChain = 'arbitrum'
  }

  if (text.includes('compliant') || text.includes('kyc') || text.includes('regulated')) {
    result.preferences.compliance = true
  }

  if (text.includes('asap') || text.includes('urgent') || text.includes('immediately') || text.includes('fast')) {
    result.preferences.urgency = 'high'
  }

  result.rawParsed = JSON.stringify(result, null, 2)
  return result
}

export function getSuggestedIntents(): string[] {
  return [
    'Swap 100 USDC for SOL privately',
    'Lend my SOL for the highest yield anonymously',
    'Bridge 0.5 SOL to Ethereum with max privacy',
    'Deposit 50 USDC into shielded vault',
    'Earn >8% APY on my USDC privately',
  ]
}
