// src/lib/agent-mandates.ts

import { AgentPurposeId, PURPOSE_CATALOG } from './biller-catalog'

export interface AgentMandateConfig {
  purpose: AgentPurposeId
  maxMonthlyLimitInr: number
  dailyLimitInr: number
  stepUpThresholdInr: number
  approvedPayees: string[]
  whitelistMode: 'strict' | 'step_up_unlisted'
  ttlDays: 30 | 90 | 365 | null
  maxTxnsPerDay: number
  businessHoursOnly: boolean
  autoQuarantineOnBlocks: boolean
  authMode: 'ed25519_permit' | 'bearer_token'
  mandateId?: string
  createdAt?: string
  updatedAt?: string
}

export type MandateRiskPosture = 'Low Risk' | 'Balanced' | 'High Exposure'

/** Format number as Indian Rupee string, e.g. ₹25,000 */
export function formatInr(amountInr: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountInr)
}

/** Format Rupee amount into raw Integer Paise representation, e.g. "25,00,000 paise" */
export function formatPaise(amountInr: number): string {
  const paise = Math.round(amountInr * 100)
  return `${paise.toLocaleString('en-IN')} paise`
}

/** Evaluate dynamic risk posture from mandate configuration */
export function computeMandateRiskPosture(
  config: Partial<AgentMandateConfig>
): MandateRiskPosture {
  const monthly = config.maxMonthlyLimitInr ?? 50000
  const daily = config.dailyLimitInr ?? 10000
  const stepUp = config.stepUpThresholdInr ?? 2500
  const payees = config.approvedPayees ?? []
  const strict = config.whitelistMode === 'strict'
  const businessHours = config.businessHoursOnly ?? false

  // High Exposure conditions: large monthly cap, no payee restrictions, high step-up threshold
  if (
    (payees.length === 0 && monthly >= 100000 && stepUp >= daily * 0.8) ||
    monthly >= 300000
  ) {
    return 'High Exposure'
  }

  // Low Risk conditions: strict whitelist with payees, conservative step-up, business hours
  if (
    payees.length > 0 &&
    strict &&
    stepUp <= 5000 &&
    (businessHours || daily <= 10000)
  ) {
    return 'Low Risk'
  }

  return 'Balanced'
}

/** Realistic seed data for mock/demo agents */
const SEED_MANDATES: Record<string, AgentMandateConfig> = {
  'agent-coding-asst': {
    purpose: 'cloud_saas',
    maxMonthlyLimitInr: 100000,
    dailyLimitInr: 25000,
    stepUpThresholdInr: 10000,
    approvedPayees: ['GitHub Enterprise', 'Vercel', 'OpenAI API'],
    whitelistMode: 'strict',
    ttlDays: 365,
    maxTxnsPerDay: 20,
    businessHoursOnly: false,
    autoQuarantineOnBlocks: true,
    authMode: 'ed25519_permit',
    mandateId: 'MND_CODING_ASST_01',
    createdAt: '2026-01-15T08:00:00Z',
  },
  'agent-customer-support': {
    purpose: 'vendor_b2b',
    maxMonthlyLimitInr: 50000,
    dailyLimitInr: 10000,
    stepUpThresholdInr: 3000,
    approvedPayees: ['Zoho Corp', 'RazorpayX Payouts'],
    whitelistMode: 'step_up_unlisted',
    ttlDays: 90,
    maxTxnsPerDay: 15,
    businessHoursOnly: true,
    autoQuarantineOnBlocks: true,
    authMode: 'ed25519_permit',
    mandateId: 'MND_CUST_SUPPORT_02',
    createdAt: '2026-02-01T10:30:00Z',
  },
  'agent-data-pipeline': {
    purpose: 'cloud_saas',
    maxMonthlyLimitInr: 250000,
    dailyLimitInr: 50000,
    stepUpThresholdInr: 15000,
    approvedPayees: ['AWS India', 'Google Cloud', 'Cloudflare'],
    whitelistMode: 'strict',
    ttlDays: 365,
    maxTxnsPerDay: 50,
    businessHoursOnly: false,
    autoQuarantineOnBlocks: true,
    authMode: 'ed25519_permit',
    mandateId: 'MND_DATA_PIPELINE_03',
    createdAt: '2026-01-20T12:00:00Z',
  },
  'agent-security-triage': {
    purpose: 'general_ops',
    maxMonthlyLimitInr: 20000,
    dailyLimitInr: 5000,
    stepUpThresholdInr: 1500,
    approvedPayees: ['GitHub Enterprise'],
    whitelistMode: 'strict',
    ttlDays: 90,
    maxTxnsPerDay: 10,
    businessHoursOnly: true,
    autoQuarantineOnBlocks: true,
    authMode: 'ed25519_permit',
    mandateId: 'MND_SEC_TRIAGE_04',
    createdAt: '2026-02-10T14:15:00Z',
  },
  'agent-marketing-asst': {
    purpose: 'vendor_b2b',
    maxMonthlyLimitInr: 30000,
    dailyLimitInr: 5000,
    stepUpThresholdInr: 2000,
    approvedPayees: ['Zoho Corp'],
    whitelistMode: 'strict',
    ttlDays: 30,
    maxTxnsPerDay: 5,
    businessHoursOnly: true,
    autoQuarantineOnBlocks: true,
    authMode: 'ed25519_permit',
    mandateId: 'MND_MKTG_ASST_05',
    createdAt: '2026-03-01T09:00:00Z',
  },
}

const STORAGE_KEY = 'agentshield_agent_mandates_v1'

class AgentMandateStore {
  private cache: Map<string, AgentMandateConfig> = new Map()
  private initialized = false
  private listeners: Set<() => void> = new Set()

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn()
      } catch {}
    })
  }

  private init() {
    if (this.initialized) return
    this.initialized = true

    // Load seeds first
    Object.entries(SEED_MANDATES).forEach(([id, config]) => {
      this.cache.set(id.toLowerCase(), config)
    })

    if (typeof window === 'undefined') return

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, AgentMandateConfig>
        Object.entries(parsed).forEach(([k, v]) => {
          this.cache.set(k.toLowerCase(), v)
        })
      }
    } catch {
      // Storage unavailable or invalid JSON
    }
  }

  private persist() {
    if (typeof window === 'undefined') return
    try {
      const obj: Record<string, AgentMandateConfig> = {}
      this.cache.forEach((v, k) => {
        obj[k] = v
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch {}
  }

  getMandate(agentIdOrName?: string): AgentMandateConfig {
    this.init()
    if (!agentIdOrName) return this.getDefaultConfig('general_ops')

    const key = agentIdOrName.toLowerCase()
    const hit = this.cache.get(key)
    if (hit) return hit

    // Try partial/fuzzy match (e.g. "Coding Assistant" -> "agent-coding-asst")
    for (const [k, v] of Array.from(this.cache.entries())) {
      if (key.includes(k) || k.includes(key)) return v
    }

    // Return default for general ops
    return this.getDefaultConfig('general_ops')
  }

  saveMandate(agentId: string, config: AgentMandateConfig, agentName?: string): void {
    this.init()
    const idKey = agentId.toLowerCase()
    this.cache.set(idKey, config)
    if (agentName) {
      this.cache.set(agentName.toLowerCase(), config)
    }
    this.persist()
    this.notify()
  }

  updateMandate(
    agentId: string,
    updates: Partial<AgentMandateConfig>,
    agentName?: string
  ): AgentMandateConfig {
    const existing = this.getMandate(agentId || agentName)
    const updated: AgentMandateConfig = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    this.saveMandate(agentId, updated, agentName)
    return updated
  }

  getAllMandates(): Record<string, AgentMandateConfig> {
    this.init()
    const result: Record<string, AgentMandateConfig> = {}
    this.cache.forEach((v, k) => {
      result[k] = v
    })
    return result
  }

  getDefaultConfig(purposeId: AgentPurposeId): AgentMandateConfig {
    const entry = PURPOSE_CATALOG[purposeId]
    return {
      purpose: purposeId,
      maxMonthlyLimitInr: entry.defaultMonthlyCapInr,
      dailyLimitInr: entry.defaultDailyCapInr,
      stepUpThresholdInr: entry.defaultStepUpInr,
      approvedPayees: [...entry.majorBillers.slice(0, 3)],
      whitelistMode: 'strict',
      ttlDays: 90,
      maxTxnsPerDay: 20,
      businessHoursOnly: true,
      autoQuarantineOnBlocks: true,
      authMode: 'ed25519_permit',
      createdAt: new Date().toISOString(),
    }
  }
}

export const agentMandateStore = new AgentMandateStore()
