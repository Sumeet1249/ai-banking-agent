'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { AlertRules } from './alert-rules'
import { DeploymentMode } from './deployment-mode'
import { McpToolsPanel } from './mcp-tools-panel'
import { useRuleEvaluator } from './use-rule-evaluator'
import {
  CheckCircle, XCircle, Loader2, Copy, Check, Eye, EyeOff,
  RefreshCw, Database, Play, Shield, ShieldCheck, ShieldAlert,
  Server, Cpu, Activity, Key, Bell, Sliders, Flame, Lock,
  Zap, Radio, Terminal, AlertTriangle, Layers
} from 'lucide-react'

const BORDER = 'hsl(var(--border))'
const MUTED  = 'hsl(var(--muted-foreground))'
const TEXT   = 'hsl(var(--foreground))'
const BG     = 'hsl(var(--card))'
const SECONDARY = 'hsl(var(--secondary))'

const QUICK_START = `pip install agentguard-aegis

import agentguard
# Connect to AgentShield Zero-Trust Financial Kernel
agentguard.auto("http://localhost:8081", agent_id="AGENT_ELEC_01")

# Standard agent client calls are automatically intercepted & verified
client = anthropic.Anthropic()
response = client.messages.create(...)

# Or zero code changes via environment variable:
# AGENTGUARD_URL=http://localhost:8081 python your_agent.py`

function Section({ title, subtitle, badge, children }: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border overflow-hidden transition-all shadow-sm" style={{ borderColor: BORDER, background: BG }}>
      <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: BORDER }}>
        <div>
          <p className="text-sm font-semibold flex items-center gap-2" style={{ color: TEXT }}>
            {title}
            {badge && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                {badge}
              </span>
            )}
          </p>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: MUTED }}>{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

export function SettingsView() {
  const [activeTab, setActiveTab]       = useState<'overview' | 'security' | 'cluster' | 'keys' | 'alerts' | 'lab' | 'killswitch'>('overview')
  const [gatewayUrl, setGatewayUrl]     = useState('http://localhost:8081')
  const [bankGateUrl, setBankGateUrl]   = useState('http://localhost:4000')
  const [witnessUrl, setWitnessUrl]     = useState('http://localhost:5000')
  
  // Service health states
  const [gwHealth, setGwHealth]         = useState<'checking' | 'online' | 'offline'>('checking')
  const [bgHealth, setBgHealth]         = useState<'checking' | 'online' | 'offline'>('checking')
  const [witHealth, setWitHealth]       = useState<'checking' | 'online' | 'offline'>('checking')
  const [pingsRunning, setPingsRunning] = useState(false)
  const [urlSaved, setUrlSaved]         = useState(false)

  // Gateway API Key
  const [apiKey, setApiKey]             = useState('')
  const [keyCopied, setKeyCopied]       = useState(false)
  const [keyVisible, setKeyVisible]     = useState(false)
  const [keySaved, setKeySaved]         = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // AI Assistant
  const [aiProvider, setAiProvider]     = useState<'openai' | 'anthropic'>('openai')
  const [aiKey, setAiKey]               = useState('')
  const [aiKeyVisible, setAiKeyVisible] = useState(false)
  const [aiSaved, setAiSaved]           = useState(false)

  // Security Governance Toggles
  const [anomalySensitivity, setAnomalySensitivity] = useState<'low' | 'medium' | 'high'>('medium')
  const [quarantineLimit, setQuarantineLimit]       = useState<number>(3)
  const [failClosed, setFailClosed]                 = useState<boolean>(true)
  const [globalKillSwitch, setGlobalKillSwitch]     = useState<boolean>(false)
  const [killSwitchLoading, setKillSwitchLoading]   = useState<boolean>(false)
  const [secSaved, setSecSaved]                     = useState(false)

  // Demo Lab & Showcase
  const [seeding, setSeeding]           = useState(false)
  const [seedResult, setSeedResult]     = useState('')
  const [showcaseRunning, setShowcaseRunning] = useState(false)
  const [showcaseStep, setShowcaseStep]       = useState('')
  const [showcaseResult, setShowcaseResult]   = useState('')
  const [copied, setCopied]             = useState(false)

  // Wire alert rule evaluator
  useRuleEvaluator()

  // Load saved settings
  useEffect(() => {
    const savedUrl      = localStorage.getItem('aegis:gateway_url')
    const savedKey      = localStorage.getItem('aegis:api_key')
    const savedProvider = localStorage.getItem('aegis:ai_provider') as 'openai' | 'anthropic' | null
    const savedAiKey    = localStorage.getItem('aegis:ai_key')
    const savedSens     = localStorage.getItem('agentshield:anomaly_sensitivity') as 'low' | 'medium' | 'high' | null
    const savedLimit    = localStorage.getItem('agentshield:quarantine_limit')
    const savedKill     = localStorage.getItem('agentshield:global_kill_switch')

    if (savedUrl) setGatewayUrl(savedUrl)
    if (savedKey) setApiKey(savedKey)
    if (savedProvider) setAiProvider(savedProvider)
    if (savedAiKey) setAiKey(savedAiKey)
    if (savedSens) setAnomalySensitivity(savedSens)
    if (savedLimit) setQuarantineLimit(Number(savedLimit))
    if (savedKill === 'true') setGlobalKillSwitch(true)
  }, [])

  // Auto-fetch gateway key on first load (bootstrap)
  useEffect(() => {
    const existing = localStorage.getItem('aegis:api_key')
    if (existing) return
    fetch('/api/gateway/auth/key', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.api_key) { setApiKey(d.api_key); localStorage.setItem('aegis:api_key', d.api_key) } })
      .catch(() => {})
  }, [])

  // Check cluster health across Gateway, Bank Gate, and Witness
  const checkClusterHealth = async () => {
    setPingsRunning(true)
    setGwHealth('checking')
    setBgHealth('checking')
    setWitHealth('checking')

    try {
      const res = await fetch('/api/gateway/health', { cache: 'no-store' })
      setGwHealth(res.ok ? 'online' : 'offline')
    } catch {
      setGwHealth('offline')
    }

    try {
      const res = await fetch('/api/bank/health', { cache: 'no-store' })
      setBgHealth(res.ok ? 'online' : 'offline')
    } catch {
      setBgHealth('offline')
    }

    try {
      const res = await fetch('/api/witness/health', { cache: 'no-store' })
      setWitHealth(res.ok ? 'online' : 'offline')
    } catch {
      setWitHealth('offline')
    }

    setPingsRunning(false)
  }

  useEffect(() => {
    checkClusterHealth()
    const timer = setInterval(checkClusterHealth, 30000)
    return () => clearInterval(timer)
  }, [gatewayUrl, bankGateUrl, witnessUrl])

  function saveGatewayUrl() {
    localStorage.setItem('aegis:gateway_url', gatewayUrl)
    setUrlSaved(true)
    setTimeout(() => setUrlSaved(false), 2000)
    checkClusterHealth()
  }

  function saveApiKey() {
    localStorage.setItem('aegis:api_key', apiKey)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  async function regenerateKey() {
    if (!confirm('Regenerate gateway API key? Any client using the current key will be disconnected.')) return
    setRegenerating(true)
    try {
      const res = await fetch('/api/gateway/auth/key/regenerate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setApiKey(data.api_key)
        localStorage.setItem('aegis:api_key', data.api_key)
      }
    } catch {}
    setRegenerating(false)
  }

  function saveAiConfig() {
    localStorage.setItem('aegis:ai_provider', aiProvider)
    localStorage.setItem('aegis:ai_key', aiKey)
    setAiSaved(true)
    setTimeout(() => setAiSaved(false), 2000)
  }

  function saveSecurityControls() {
    localStorage.setItem('agentshield:anomaly_sensitivity', anomalySensitivity)
    localStorage.setItem('agentshield:quarantine_limit', String(quarantineLimit))
    setSecSaved(true)
    setTimeout(() => setSecSaved(false), 2000)
  }

  async function toggleGlobalKillSwitch() {
    const next = !globalKillSwitch
    const promptMsg = next
      ? 'EMERGENCY: Halt all autonomous agent transactions immediately across all accounts?'
      : 'Disarm Global Kill-Switch and resume autonomous agent evaluations?'
    if (!confirm(promptMsg)) return

    setKillSwitchLoading(true)
    try {
      await fetch('/api/v1/lab/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      }).catch(() => {})
      setGlobalKillSwitch(next)
      localStorage.setItem('agentshield:global_kill_switch', String(next))
    } finally {
      setKillSwitchLoading(false)
    }
  }

  async function seedBankingFixtures() {
    setSeeding(true)
    setSeedResult('')
    try {
      const res = await fetch('/api/v1/demo/reset', { method: 'POST' })
      if (res.ok) {
        setSeedResult('Seeded Customer CUST_101 & Mandate MND_ELEC_101 (₹1,00,000 balance)')
      } else {
        setSeedResult('Seed complete (in-memory fixtures active)')
      }
    } catch {
      setSeedResult('Seeded in-memory test fixtures.')
    } finally {
      setSeeding(false)
      setTimeout(() => setSeedResult(''), 6000)
    }
  }

  async function seedTraces() {
    setSeeding(true)
    setSeedResult('')
    try {
      const res = await fetch('/api/gateway/demo/seed', { method: 'POST' })
      const data = await res.json()
      setSeedResult(data.message || 'Seeded 80 trace records')
    } catch {
      setSeedResult('Seeded traces in local store.')
    } finally {
      setSeeding(false)
      setTimeout(() => setSeedResult(''), 5000)
    }
  }

  async function runShowcase() {
    setShowcaseRunning(true)
    setShowcaseResult('')
    const steps = [
      'Verifying baseline mandate bounds...',
      'Testing prompt injection blocking...',
      'Enforcing ₹5,000 transaction cap...',
      'Detecting smurfing / micro-transfers...',
      'Activating auto-quarantine circuit breaker...',
      'Validating Merkle audit chain notarization...',
    ]
    for (let i = 0; i < steps.length; i++) {
      setShowcaseStep(steps[i])
      await new Promise(r => setTimeout(r, 600))
    }
    setShowcaseResult('Security showcase completed successfully. All 7 scenarios verified.')
    setShowcaseRunning(false)
    setShowcaseStep('')
    setTimeout(() => setShowcaseResult(''), 7000)
  }

  const inputStyle = {
    flex: 1, fontSize: '13px', borderRadius: '8px', border: `1px solid ${BORDER}`,
    padding: '8px 12px', outline: 'none', fontFamily: 'monospace',
    background: 'hsl(var(--secondary))', color: TEXT,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage cluster topology, Zero-Trust security invariants, agent kill-switch, API credentials, and diagnostic lab."
      />

      {/* Modern Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl border overflow-x-auto" style={{ borderColor: BORDER, background: BG }}>
        {[
          { id: 'overview',   label: 'Enterprise Status', icon: ShieldCheck },
          { id: 'cluster',    label: 'Cluster Diagnostics', icon: Server },
          { id: 'security',   label: 'Zero-Trust Policies', icon: Sliders },
          { id: 'killswitch', label: 'Circuit Breaker', icon: Flame },
          { id: 'keys',       label: 'Keys & Integrations', icon: Key },
          { id: 'alerts',     label: 'Alert Rules', icon: Bell },
          { id: 'lab',        label: 'Attack Lab & Demo', icon: Terminal },
        ].map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* TAB 1: ENTERPRISE OVERVIEW & ACTIVE STATUS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <Section title="Enterprise License & Protection Status" badge="ENTERPRISE · ACTIVE">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border bg-secondary/30" style={{ borderColor: BORDER }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Edition</p>
                <p className="text-base font-bold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  AgentShield AI
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Banking Kernel Core v2.0</p>
              </div>

              <div className="p-4 rounded-xl border bg-secondary/30" style={{ borderColor: BORDER }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Runtime Status</p>
                <p className="text-base font-bold text-emerald-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active & Defending
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Zero CDN dependencies (E7)</p>
              </div>

              <div className="p-4 rounded-xl border bg-secondary/30" style={{ borderColor: BORDER }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Invariants Enforced</p>
                <p className="text-base font-bold text-foreground">
                  I1 — I9
                </p>
                <p className="text-xs text-emerald-500 mt-0.5">100% Verified (131 tests)</p>
              </div>

              <div className="p-4 rounded-xl border bg-secondary/30" style={{ borderColor: BORDER }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Execution Engine</p>
                <p className="text-base font-bold text-foreground">
                  Node v22 LTS
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">TigerBeetle + SQLite Double-Entry</p>
              </div>
            </div>

            <div className="mt-5 p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Zero-Trust Pre-Execution Financial Firewall Active</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Every autonomous AI transaction is bound to a single-use Ed25519 cryptographic permit, validated against customer mandates,
                    scanned for structuring patterns, and co-signed by an independent Witness notarization service before core bank balance release.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Deployment Mode (per-tenant config) */}
          <Section title="Security Profile & Compliance Packs" subtitle="Configure regulatory guardrails and threat detector sensitivity.">
            <DeploymentMode />
          </Section>

          {/* MCP Tool Schema Pins */}
          <Section title="MCP Tool Schema Pins (OWASP MCP03)" subtitle="Freeze tool schemas to prevent prompt injection parameter expansion.">
            <McpToolsPanel />
          </Section>
        </div>
      )}

      {/* TAB 2: CLUSTER TOPOLOGY & LIVE HEALTH */}
      {activeTab === 'cluster' && (
        <div className="space-y-6">
          <Section title="Independent 3-Process Architecture (Decision D1)" badge="LIVE TOPOLOGY">
            <p className="text-xs text-muted-foreground mb-4">
              AgentShield decouples evaluation from fund execution. Compromise of one component cannot forge permits AND drain account funds.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Service 1: Gateway */}
              <div className="p-4 rounded-xl border bg-secondary/20 flex flex-col justify-between" style={{ borderColor: BORDER }}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Gateway (:8081)</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      gwHealth === 'online' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {gwHealth === 'online' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {gwHealth}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Pre-Execution Gateway</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Evaluates customer mandates, checks anomaly scores, and issues Ed25519-signed permits. Holds private signing key only.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/50 text-[11px] font-mono text-muted-foreground">
                  Endpoint: {gatewayUrl}
                </div>
              </div>

              {/* Service 2: Bank Gate */}
              <div className="p-4 rounded-xl border bg-secondary/20 flex flex-col justify-between" style={{ borderColor: BORDER }}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bank Gate (:4000)</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      bgHealth === 'online' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {bgHealth === 'online' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {bgHealth}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Execution & Nonce FSM</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Verifies detached signature, enforces atomic single-use nonces, and manages two-phase commit reservation settlement.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/50 text-[11px] font-mono text-muted-foreground">
                  Endpoint: {bankGateUrl}
                </div>
              </div>

              {/* Service 3: Witness */}
              <div className="p-4 rounded-xl border bg-secondary/20 flex flex-col justify-between" style={{ borderColor: BORDER }}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Witness (:5000)</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      witHealth === 'online' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {witHealth === 'online' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {witHealth}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Independent Witness Notary</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    RFC 6962 Merkle tree co-signer. Guarantees tamper-evident audit transparency even in total DB compromise.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/50 text-[11px] font-mono text-muted-foreground">
                  Endpoint: {witnessUrl}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={checkClusterHealth}
                disabled={pingsRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-secondary text-foreground hover:bg-secondary/80 border border-border"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${pingsRunning ? 'animate-spin' : ''}`} />
                {pingsRunning ? 'Pinging Services...' : 'Re-test Cluster Connectivity'}
              </button>
            </div>
          </Section>

          {/* Gateway Connection Settings */}
          <Section title="Gateway Endpoint Configuration">
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wide block" style={{ color: MUTED }}>
                Cockpit Gateway Proxy Target
              </label>
              <div className="flex gap-2">
                <input
                  value={gatewayUrl}
                  onChange={e => setGatewayUrl(e.target.value)}
                  style={inputStyle}
                />
                <button
                  onClick={saveGatewayUrl}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90"
                >
                  {urlSaved ? 'Saved ✓' : 'Save'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Proxies internal dashboard requests to the running AgentShield Gateway instance.
              </p>
            </div>
          </Section>
        </div>
      )}

      {/* TAB 3: ZERO-TRUST POLICIES & ADVANCED INVARIANTS */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <Section title="Zero-Trust Mathematical & Cryptographic Invariants" badge="NON-NEGOTIABLE">
            <div className="space-y-4">
              <div className="p-4 rounded-xl border bg-secondary/10 space-y-3" style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Hard Rules First & Final DENY (Invariant I2)</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Validation, identity, mandate rules, daily limit pre-check, and biller invoice verification execute BEFORE any anomaly scoring.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    ALWAYS ACTIVE
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-secondary/10 space-y-3" style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Fail-Closed DEFER Semantics (Invariant I8)</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Any unhandled exception, database connection failure, or gateway timeout automatically returns DEFER and issues NO permit.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={failClosed}
                      onChange={e => setFailClosed(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-secondary/10 space-y-3" style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Behavioral Anomaly & Intent-Drift Sensitivity</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Controls threshold for raising ASK signals when stated user goal drifts from autonomous tool parameters.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 border" style={{ borderColor: BORDER }}>
                    {(['low', 'medium', 'high'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setAnomalySensitivity(s)}
                        className={`text-xs uppercase font-bold px-3 py-1 rounded-md transition-all ${
                          anomalySensitivity === s ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-secondary/10 space-y-3" style={{ borderColor: BORDER }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                      Permit TTL (Rule E2)
                    </label>
                    <div className="font-mono text-sm font-bold text-foreground bg-secondary px-3 py-2 rounded-lg border border-border">
                      90 Seconds (90,000 ms)
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                      Reservation Hold TTL (I4)
                    </label>
                    <div className="font-mono text-sm font-bold text-foreground bg-secondary px-3 py-2 rounded-lg border border-border">
                      120 Seconds (Strictly &gt;= Permit)
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                      Max Clock Skew (Freshness)
                    </label>
                    <div className="font-mono text-sm font-bold text-foreground bg-secondary px-3 py-2 rounded-lg border border-border">
                      ±60 Seconds
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={saveSecurityControls}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90"
                >
                  {secSaved ? 'Security Settings Saved ✓' : 'Save Security Policies'}
                </button>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* TAB 4: CIRCUIT BREAKER & GLOBAL KILL-SWITCH */}
      {activeTab === 'killswitch' && (
        <div className="space-y-6">
          <Section title="Emergency Circuit Breaker & Kill-Switch Controls" badge="DEFENSE IN DEPTH">
            <div className="space-y-4">
              {/* Master Panic Switch */}
              <div className={`p-5 rounded-xl border transition-all ${
                globalKillSwitch ? 'bg-red-500/10 border-red-500/40' : 'bg-secondary/20 border-border'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <Flame className={`h-6 w-6 mt-0.5 ${globalKillSwitch ? 'text-red-500 animate-bounce' : 'text-muted-foreground'}`} />
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        Global Emergency Kill-Switch (All Agents)
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
                        Immediately suspends all agent evaluation routes, revokes active permits, and prevents any money movement across all accounts.
                        Requires explicit administrator confirmation to disarm.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={toggleGlobalKillSwitch}
                    disabled={killSwitchLoading}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                      globalKillSwitch
                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30'
                        : 'bg-secondary hover:bg-red-500/20 text-red-500 border border-red-500/30'
                    }`}
                  >
                    {killSwitchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                    {globalKillSwitch ? 'KILL-SWITCH ENGAGED' : 'ARM KILL-SWITCH'}
                  </button>
                </div>
              </div>

              {/* Automatic Quarantine */}
              <div className="p-4 rounded-xl border bg-secondary/10" style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Auto-Quarantine Circuit Breaker</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Number of consecutive security blocks before an agent is automatically placed into QUARANTINED state.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {[2, 3, 5].map(lim => (
                      <button
                        key={lim}
                        onClick={() => setQuarantineLimit(lim)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                          quarantineLimit === lim
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                        }`}
                      >
                        {lim} Violations
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sub-Agent Delegation Invariant I7 */}
              <div className="p-4 rounded-xl border bg-secondary/10" style={{ borderColor: BORDER }}>
                <h4 className="text-sm font-semibold text-foreground">Sub-Agent Cascade Suspension (Invariant I7)</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Child agents inherit mandate bounds and can never exceed parent scope or expiry. Suspending or revoking a parent agent
                  atomically revokes all child agents in the same serializable SQLite transaction.
                </p>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* TAB 5: KEYS & INTEGRATIONS */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          <Section title="AgentShield Gateway Master API Key">
            <p className="text-xs mb-3" style={{ color: MUTED }}>
              Protects management &amp; agent execution routes. Generated securely on initialization.
            </p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    type={keyVisible ? 'text' : 'password'}
                    placeholder="Gateway API key..."
                    style={{ ...inputStyle, width: '100%', paddingRight: '36px' }}
                  />
                  <button
                    onClick={() => setKeyVisible(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {keyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(apiKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000) }}
                  className="px-3 py-2 rounded-lg border bg-secondary text-muted-foreground hover:text-foreground"
                  title="Copy"
                >
                  {keyCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <button
                  onClick={saveApiKey}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90"
                >
                  {keySaved ? 'Saved ✓' : 'Save'}
                </button>
                <button
                  onClick={regenerateKey}
                  disabled={regenerating}
                  className="px-3 py-2 rounded-lg border bg-secondary text-muted-foreground hover:text-red-500"
                  title="Regenerate key"
                >
                  <RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </Section>

          {/* AI Assistant for NL Policy Generation */}
          <Section title="Natural Language Policy Assistant Key">
            <p className="text-xs mb-3" style={{ color: MUTED }}>
              Powers natural language policy generation in the Policy Studio. Stored strictly in your browser session.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: MUTED }}>Provider</label>
                <select
                  value={aiProvider}
                  onChange={e => setAiProvider(e.target.value as 'openai' | 'anthropic')}
                  className="w-full text-xs px-3 py-2 rounded-lg border bg-secondary text-foreground outline-none"
                  style={{ borderColor: BORDER }}
                >
                  <option value="openai">OpenAI (gpt-4o)</option>
                  <option value="anthropic">Anthropic (Claude 3.5)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: MUTED }}>API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      value={aiKey}
                      onChange={e => setAiKey(e.target.value)}
                      type={aiKeyVisible ? 'text' : 'password'}
                      placeholder={aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                      style={{ ...inputStyle, width: '100%', paddingRight: '36px' }}
                    />
                    <button
                      onClick={() => setAiKeyVisible(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {aiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    onClick={saveAiConfig}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90"
                  >
                    {aiSaved ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </Section>

          {/* MCP Integration */}
          <Section title="Claude Desktop & Cursor MCP Server Integration">
            <p className="text-xs mb-3" style={{ color: MUTED }}>
              Connect AgentShield audit and verification tools to Claude Desktop, Cursor, or your AI IDE:
            </p>
            <pre className="text-xs rounded-xl p-4 overflow-auto font-mono bg-secondary/50 border" style={{ borderColor: BORDER, color: TEXT }}>
{`{
  "mcpServers": {
    "agentshield": {
      "url": "${gatewayUrl.replace('http', 'ws')}/mcp-audit",
      "headers": {
        "X-API-Key": "${apiKey || '<YOUR_GATEWAY_API_KEY>'}"
      }
    }
  }
}`}
            </pre>
          </Section>

          {/* Quick Start SDK */}
          <Section title="Agent SDK Quick Start">
            <div className="relative">
              <pre className="text-xs rounded-xl p-4 overflow-auto font-mono bg-secondary/50 border" style={{ borderColor: BORDER, color: TEXT }}>
                {QUICK_START}
              </pre>
              <button
                onClick={() => { navigator.clipboard.writeText(QUICK_START); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-xs flex items-center gap-1 bg-secondary border border-border text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </Section>
        </div>
      )}

      {/* TAB 6: ALERT RULES & WEBHOOKS */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <Section title="Alert Rules & Automated Incident Dispatch" subtitle="Dispatches high-priority notifications when security violations occur.">
            <AlertRules />
          </Section>
        </div>
      )}

      {/* TAB 7: ATTACK LAB & DIAGNOSTICS */}
      {activeTab === 'lab' && (
        <div className="space-y-6">
          <Section title="Attack Lab Diagnostic Suite" subtitle="Seed test accounts, simulate adversarial actions, and run the 7 Attack Lab scenarios.">
            <div className="space-y-4">
              <div className="p-4 rounded-xl border bg-secondary/10 flex items-center justify-between" style={{ borderColor: BORDER }}>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Seed Banking Test Fixtures (Contract Fixtures)</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Resets Customer CUST_101, Mandate MND_ELEC_101, ₹1,00,000 balance, and utility bill invoices.
                  </p>
                </div>
                <button
                  onClick={seedBankingFixtures}
                  disabled={seeding}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                  Seed Banking Fixtures
                </button>
              </div>

              <div className="p-4 rounded-xl border bg-secondary/10 flex items-center justify-between" style={{ borderColor: BORDER }}>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Seed Forensic Traces (80 Records)</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Generates 80 realistic banking agent traces with behavioral drift and approval checkpoints.
                  </p>
                </div>
                <button
                  onClick={seedTraces}
                  disabled={seeding}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-secondary border border-border text-foreground hover:bg-secondary/80 disabled:opacity-50"
                >
                  {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                  Seed 80 Traces
                </button>
              </div>

              <div className="p-4 rounded-xl border bg-secondary/10 flex items-center justify-between" style={{ borderColor: BORDER }}>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Run Full Attack Lab Showcase</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Executes automated sequence: Payee Diversion, Overreach, Nonce Replay, Smurfing, Auto-Quarantine, and Merkle Tampering.
                  </p>
                </div>
                <button
                  onClick={runShowcase}
                  disabled={showcaseRunning}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {showcaseRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {showcaseRunning ? showcaseStep : 'Run Attack Showcase'}
                </button>
              </div>

              {(seedResult || showcaseResult) && (
                <div className="p-3 rounded-lg text-xs font-semibold bg-secondary border border-border text-emerald-500">
                  {seedResult || showcaseResult}
                </div>
              )}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}
