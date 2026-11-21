
// apps/compliance-cockpit/src/lib/server-agent-store.ts
import { mockAgents, MockAgent } from './mock-traces'
import { AgentPurposeId, PURPOSE_CATALOG } from './biller-catalog'

export interface ServerAgent {
  id: string
  org_id: string
  name: string
  description: string
  owner_email: string
  declared_tools: string[]
  environments: string[]
  status: 'active' | 'suspended' | 'deprecated' | 'unregistered'
  has_secret: boolean
  has_public_key: boolean
  api_key?: string
  api_key_masked?: string
  created_at: string
  updated_at: string
  last_seen_at?: string
  last_seen?: string
}

export interface ServerMandate {
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
  mandateId: string
  createdAt: string
  updatedAt: string
}

export type StoreEvent = {
  type: 'agent:created' | 'agent:updated' | 'agent:rotated' | 'agent:deleted' | 'mandate:updated'
  agentId: string
  data?: any
  timestamp: string
}

type EventListener = (event: StoreEvent) => void

// Use globalThis to persist across Next.js dev server hot-reloads
interface GlobalAgentStore {
  agents: Map<string, ServerAgent>
  secrets: Map<string, string>
  mandates: Map<string, ServerMandate>
  listeners: Set<EventListener>
  initialized: boolean
}

const g = globalThis as unknown as { __aegis_agent_store?: GlobalAgentStore }

if (!g.__aegis_agent_store) {
  g.__aegis_agent_store = {
    agents: new Map(),
    secrets: new Map(),
    mandates: new Map(),
    listeners: new Set(),
    initialized: false,
  }
}

const store = g.__aegis_agent_store

function initStore() {
  if (store.initialized) return
  store.initialized = true

  const baseAgents = mockAgents()
  const now = new Date().toISOString()

  baseAgents.forEach((a) => {
    const idKey = a.id.toLowerCase()
    const apiKey = a.secret || `agt_live_${a.id.replace(/[^a-z0-9]/gi, '')}_${Math.random().toString(36).slice(2, 8)}`
    const maskedKey = apiKey.length > 8 ? `${apiKey.slice(0, 8)}••••${apiKey.slice(-4)}` : '••••••••'

    const serverAgent: ServerAgent = {
      id: a.id,
      org_id: 'org_acme',
      name: a.name,
      description: a.description,
      owner_email: a.owner_email,
      declared_tools: [],
      environments: ['dev', 'prod'],
      status: a.status,
      has_secret: true,
      has_public_key: true,
      api_key: apiKey,
      api_key_masked: maskedKey,
      created_at: now,
      updated_at: now,
      last_seen_at: a.last_seen,
      last_seen: a.last_seen,
    }
    store.agents.set(idKey, serverAgent)
    store.secrets.set(idKey, apiKey)

    // Seed realistic mandates matching agent IDs
    let purpose: AgentPurposeId = 'general_ops'
    let payees = ['BESCOM', 'AWS India']
    let dailyCap = 10000
    let monthlyCap = 50000
    let stepUp = 2500

    if (a.id.includes('coding')) {
      purpose = 'cloud_saas'
      payees = ['GitHub Enterprise', 'Vercel', 'OpenAI API']
      dailyCap = 25000
      monthlyCap = 100000
      stepUp = 10000
    } else if (a.id.includes('support')) {
      purpose = 'vendor_b2b'
      payees = ['Zoho Corp', 'RazorpayX Payouts']
      dailyCap = 10000
      monthlyCap = 50000
      stepUp = 3000
    } else if (a.id.includes('data')) {
      purpose = 'cloud_saas'
      payees = ['AWS India', 'Google Cloud', 'Cloudflare']
      dailyCap = 50000
      monthlyCap = 250000
      stepUp = 15000
    } else if (a.id.includes('security')) {
      purpose = 'general_ops'
      payees = ['GitHub Enterprise']
      dailyCap = 5000
      monthlyCap = 20000
      stepUp = 1500
    } else if (a.id.includes('marketing')) {
      purpose = 'vendor_b2b'
      payees = ['Zoho Corp']
      dailyCap = 5000
      monthlyCap = 30000
      stepUp = 2000
    }

    const mandate: ServerMandate = {
      purpose,
      maxMonthlyLimitInr: monthlyCap,
      dailyLimitInr: dailyCap,
      stepUpThresholdInr: stepUp,
      approvedPayees: payees,
      whitelistMode: 'strict',
      ttlDays: 90,
      maxTxnsPerDay: 20,
      businessHoursOnly: true,
      autoQuarantineOnBlocks: true,
      authMode: 'ed25519_permit',
      mandateId: `MND_${a.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_01`,
      createdAt: now,
      updatedAt: now,
    }
    store.mandates.set(idKey, mandate)
  })
}

initStore()

function notify(event: StoreEvent) {
  store.listeners.forEach((listener) => {
    try {
      listener(event)
    } catch { }
  })
}

export const serverAgentStore = {
  subscribe(fn: EventListener): () => void {
    store.listeners.add(fn)
    return () => {
      store.listeners.delete(fn)
    }
  },

  listAgents(options?: { status?: string; includeDeprecated?: boolean }): ServerAgent[] {
    initStore()
    const all = Array.from(store.agents.values())
    return all.filter((a) => {
      if (!options?.includeDeprecated && a.status === 'deprecated') return false
      if (options?.status && options.status !== 'all' && a.status !== options.status) return false
      return true
    })
  },

  getAgent(id: string): ServerAgent | undefined {
    initStore()
    return store.agents.get(id.toLowerCase())
  },

  createAgent(payload: Partial<ServerAgent> & { mandate?: Partial<ServerMandate>; api_key?: string; secret?: string }): {
    agent: ServerAgent
    secret: string
    apiKey: string
    mandate: ServerMandate
  } {
    initStore()
    const id = (payload.id || `agent_${Date.now().toString(36)}`).toLowerCase()
    const now = new Date().toISOString()
    const secret = (payload.api_key || payload.secret || '').trim() ||
      `agt_live_${Array.from({ length: 24 }, () =>
        Math.floor(Math.random() * 36).toString(36)
      ).join('')}`
    const maskedKey = secret.length > 8 ? `${secret.slice(0, 8)}••••${secret.slice(-4)}` : '••••••••'

    const newAgent: ServerAgent = {
      id,
      org_id: payload.org_id || 'org_acme',
      name: payload.name || id,
      description: payload.description || 'Autonomous agent under mandate governance',
      owner_email: payload.owner_email || 'operator@bank.internal',
      declared_tools: payload.declared_tools || [],
      environments: payload.environments || ['dev', 'prod'],
      status: 'active',
      has_secret: true,
      has_public_key: true,
      api_key: secret,
      api_key_masked: maskedKey,
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      last_seen: now,
    }

    store.agents.set(id, newAgent)
    store.secrets.set(id, secret)

    const purpose: AgentPurposeId = (payload.mandate?.purpose as AgentPurposeId) || 'general_ops'
    const catalog = PURPOSE_CATALOG[purpose] || PURPOSE_CATALOG.general_ops

    const mandate: ServerMandate = {
      purpose,
      maxMonthlyLimitInr: payload.mandate?.maxMonthlyLimitInr || catalog.defaultMonthlyCapInr,
      dailyLimitInr: payload.mandate?.dailyLimitInr || catalog.defaultDailyCapInr,
      stepUpThresholdInr: payload.mandate?.stepUpThresholdInr || catalog.defaultStepUpInr,
      approvedPayees: payload.mandate?.approvedPayees || [...catalog.majorBillers.slice(0, 2)],
      whitelistMode: payload.mandate?.whitelistMode || 'strict',
      ttlDays: payload.mandate?.ttlDays !== undefined ? payload.mandate.ttlDays : 90,
      maxTxnsPerDay: payload.mandate?.maxTxnsPerDay || 20,
      businessHoursOnly: payload.mandate?.businessHoursOnly !== undefined ? payload.mandate.businessHoursOnly : true,
      autoQuarantineOnBlocks: payload.mandate?.autoQuarantineOnBlocks !== undefined ? payload.mandate.autoQuarantineOnBlocks : true,
      authMode: 'ed25519_permit',
      mandateId: `MND_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_01`,
      createdAt: now,
      updatedAt: now,
    }

    store.mandates.set(id, mandate)

    notify({
      type: 'agent:created',
      agentId: id,
      data: { agent: newAgent, mandate },
      timestamp: now,
    })

    return { agent: newAgent, secret, apiKey: secret, mandate }
  },

  updateAgent(id: string, patch: Partial<ServerAgent>): ServerAgent | undefined {
    initStore()
    const idKey = id.toLowerCase()
    const existing = store.agents.get(idKey)
    if (!existing) return undefined

    const updated: ServerAgent = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    if (patch.api_key) {
      updated.api_key = patch.api_key
      updated.api_key_masked = patch.api_key.length > 8 ? `${patch.api_key.slice(0, 8)}••••${patch.api_key.slice(-4)}` : '••••••••'
      store.secrets.set(idKey, patch.api_key)
    }
    store.agents.set(idKey, updated)

    notify({
      type: 'agent:updated',
      agentId: idKey,
      data: { agent: updated },
      timestamp: updated.updated_at,
    })

    return updated
  },

  rotateSecret(id: string): { secret: string; apiKey: string } | undefined {
    initStore()
    const idKey = id.toLowerCase()
    const existing = store.agents.get(idKey)
    if (!existing) return undefined

    const newSecret = `agt_live_${Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join('')}`
    store.secrets.set(idKey, newSecret)

    existing.has_secret = true
    existing.api_key = newSecret
    existing.api_key_masked = `${newSecret.slice(0, 8)}••••${newSecret.slice(-4)}`
    existing.updated_at = new Date().toISOString()
    store.agents.set(idKey, existing)

    notify({
      type: 'agent:rotated',
      agentId: idKey,
      timestamp: existing.updated_at,
    })

    return { secret: newSecret, apiKey: newSecret }
  },

  deleteAgent(id: string): boolean {
    initStore()
    const idKey = id.toLowerCase()
    const existing = store.agents.get(idKey)
    if (!existing) return false

    existing.status = 'deprecated'
    existing.updated_at = new Date().toISOString()
    store.agents.set(idKey, existing)

    notify({
      type: 'agent:deleted',
      agentId: idKey,
      timestamp: existing.updated_at,
    })

    return true
  },

  getMandate(id: string): ServerMandate | undefined {
    initStore()
    return store.mandates.get(id.toLowerCase())
  },

  listMandates(): Record<string, ServerMandate> {
    initStore()
    const res: Record<string, ServerMandate> = {}
    store.mandates.forEach((v, k) => {
      res[k] = v
    })
    return res
  },

  saveMandate(id: string, mandatePatch: Partial<ServerMandate>): ServerMandate {
    initStore()
    const idKey = id.toLowerCase()
    const existing = store.mandates.get(idKey)
    const now = new Date().toISOString()

    const updated: ServerMandate = {
      ...(existing || {
        purpose: 'general_ops',
        maxMonthlyLimitInr: 50000,
        dailyLimitInr: 10000,
        stepUpThresholdInr: 2500,
        approvedPayees: ['BESCOM'],
        whitelistMode: 'strict',
        ttlDays: 90,
        maxTxnsPerDay: 20,
        businessHoursOnly: true,
        autoQuarantineOnBlocks: true,
        authMode: 'ed25519_permit',
        mandateId: `MND_${idKey.toUpperCase()}_01`,
        createdAt: now,
      }),
      ...mandatePatch,
      updatedAt: now,
    }

    store.mandates.set(idKey, updated)

    notify({
      type: 'mandate:updated',
      agentId: idKey,
      data: { mandate: updated },
      timestamp: now,
    })

    return updated
  },
}
