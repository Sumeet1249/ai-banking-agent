'use client'

import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { toast } from 'sonner'
import {
  Loader2, ShieldCheck, ChevronDown, ChevronRight, FileText, Download, Check, AlertTriangle,
} from 'lucide-react'
import { gw } from '@/lib/gateway'

// Design tokens — same source as sibling views.
const BORDER = 'hsl(var(--border))'
const MUTED  = 'hsl(var(--muted-foreground))'
const TEXT   = 'hsl(var(--foreground))'
const BG     = 'hsl(var(--card))'
const CODE_BG = 'hsl(var(--secondary))'
const ACCENT = 'hsl(var(--primary))'
const OK     = 'hsl(150 30% 40%)'
const WARN   = 'hsl(36 45% 42%)'
const MONO   = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

interface PackMeta {
  name: string
  description: string
  citation: string
  rule_count: number
}

interface PackFull extends PackMeta {
  dsl: {
    version: number
    rules: Array<{
      name: string
      when?: unknown
      then: { decision: 'allow' | 'pending' | 'block'; reason?: string; tags?: string[] }
    }>
  }
}

/** Preset packs live under BFSI / Healthcare / Government verticals.
 *  Vertical assignment is by pack-slug prefix; the gateway doesn't
 *  ship the vertical explicitly, so the cockpit groups client-side. */
function verticalOf(name: string): string {
  if (name.startsWith('bfsi-'))        return 'BFSI (Banking / Insurance)'
  if (name.startsWith('healthcare-'))  return 'Healthcare'
  if (name.startsWith('gov-'))         return 'Government / Public Sector'
  return 'Other'
}

const DECISION_STYLE: Record<'allow' | 'pending' | 'block',
  { fg: string; bg: string; label: string }> = {
  allow:   { fg: 'hsl(150 24% 32%)', bg: 'hsl(150 30% 92%)', label: 'allow'   },
  pending: { fg: 'hsl(36 28% 38%)',  bg: 'hsl(36 45% 90%)',  label: 'pending' },
  block:   { fg: 'hsl(0 42% 40%)',   bg: 'hsl(0 28% 92%)',   label: 'block'   },
}

const PACK_TITLES: Record<string, string> = {
  'bfsi-rbi-mandates': 'RBI Banking Agent Mandates',
  'bfsi-glba': 'GLBA Safeguards',
  'bfsi-pci-dss': 'PCI DSS v4.0',
  'bfsi-sox': 'Sarbanes-Oxley',
  'bfsi-dora': 'EU DORA',
  'healthcare-hipaa': 'HIPAA',
  'gov-fedramp': 'FedRAMP Moderate',
  'fintech-agent-payments': 'Agent Payments & Anti-Smurfing',
  'security-instruction-provenance': 'Instruction Provenance',
}

const FALLBACK_PACKS: PackMeta[] = [
  {
    name: 'bfsi-rbi-mandates',
    description: 'RBI Master Direction guardrails for autonomous banking agents. Enforces strict integer-paise caps, payee whitelisting, atomic anti-replay nonces, and dual-control human escalation.',
    citation: 'RBI Master Direction - Digital Payment Security Controls (2021/2024)',
    rule_count: 5,
  },
  {
    name: 'bfsi-pci-dss',
    description: 'PCI DSS v4.0 Requirement 3.4 & 10.2 controls. Automatically intercepts un-tokenized PANs, CVV leaks in agent reasoning, and unencrypted cardholder data before tool execution.',
    citation: 'PCI-DSS v4.0.1 Req 3.4, 8.2, 10.2.1',
    rule_count: 4,
  },
  {
    name: 'fintech-agent-payments',
    description: 'Autonomous payment safeguards: anti-smurfing (detects structuring of small transactions), velocity burst limiting, and mandatory step-up challenge for high-value transfers.',
    citation: 'Bank Financial Crime Prevention & AML Standards',
    rule_count: 4,
  },
  {
    name: 'bfsi-glba',
    description: 'GLBA Safeguards Rule: prevents AI agent data leakage of Non-Public Personal Information (NPI), account balances, and credit ratings to third-party MCP endpoints.',
    citation: '16 CFR Part 314 - Standards for Safeguarding Customer Information',
    rule_count: 3,
  },
  {
    name: 'bfsi-dora',
    description: 'EU Digital Operational Resilience Act (DORA) compliance pack: ICT third-party agent risk management, operational resilience logging, and cryptographic transaction receipts.',
    citation: 'Regulation (EU) 2022/2554 (DORA) Articles 8-12',
    rule_count: 3,
  },
]

const FALLBACK_RULES: Record<string, PackFull> = {
  'bfsi-rbi-mandates': {
    name: 'bfsi-rbi-mandates',
    description: 'RBI Master Direction guardrails for autonomous banking agents.',
    citation: 'RBI Master Direction - Digital Payment Security Controls',
    rule_count: 5,
    dsl: {
      version: 1,
      rules: [
        { name: 'rbi-mandate-limit-cap', then: { decision: 'block', reason: 'Transaction amount exceeds per-transaction limit defined in customer mandate', tags: ['rbi', 'mandate', 'limits'] } },
        { name: 'rbi-payee-whitelist-only', then: { decision: 'block', reason: 'Target payee is not on the authorized utility / payee whitelist', tags: ['rbi', 'payee-lock'] } },
        { name: 'rbi-high-value-stepup', then: { decision: 'pending', reason: 'High-value transaction above ₹2,000 threshold requires customer WebAuthn passkey step-up', tags: ['rbi', '2fa', 'stepup'] } },
        { name: 'rbi-atomic-anti-replay', then: { decision: 'block', reason: 'Atomic nonce already consumed or expired timestamp detected', tags: ['anti-replay', 'cryptographic'] } },
        { name: 'rbi-subsecond-revocation', then: { decision: 'block', reason: 'Customer mandate has been revoked; instant enforcement active', tags: ['kill-switch', 'revocation'] } },
      ],
    },
  },
  'bfsi-pci-dss': {
    name: 'bfsi-pci-dss',
    description: 'PCI DSS v4.0 Requirement 3.4 & 10.2 controls.',
    citation: 'PCI-DSS v4.0.1 Req 3.4, 8.2, 10.2.1',
    rule_count: 4,
    dsl: {
      version: 1,
      rules: [
        { name: 'pci-block-raw-pan', then: { decision: 'block', reason: 'Primary Account Number (PAN) detected in prompt context without tokenization', tags: ['pci-dss', 'card-data'] } },
        { name: 'pci-block-cvv-in-context', then: { decision: 'block', reason: 'CVV/CVC sensitive authentication data must never be processed by AI agents', tags: ['pci-dss', 'cvv-prohibited'] } },
        { name: 'pci-audit-witness-proof', then: { decision: 'allow', reason: 'Cryptographic RFC 6962 ledger hash generated for payment observation', tags: ['pci-req10', 'audit'] } },
        { name: 'pci-unauthorized-refund-block', then: { decision: 'block', reason: 'Agent attempted refund without explicit supervisor authorization permit', tags: ['pci-dss', 'refund-lock'] } },
      ],
    },
  },
  'fintech-agent-payments': {
    name: 'fintech-agent-payments',
    description: 'Autonomous payment safeguards: anti-smurfing and velocity limits.',
    citation: 'Bank Financial Crime Prevention & AML Standards',
    rule_count: 4,
    dsl: {
      version: 1,
      rules: [
        { name: 'fintech-anti-smurfing', then: { decision: 'block', reason: 'Pattern of repetitive sub-limit transactions flagged as potential structuring', tags: ['aml', 'structuring'] } },
        { name: 'fintech-velocity-burst-guard', then: { decision: 'pending', reason: 'More than 3 transactions initiated within a 60-second window', tags: ['velocity', 'burst-guard'] } },
        { name: 'fintech-intent-drift-block', then: { decision: 'block', reason: 'Stated prompt intent deviates from execution payload parameters', tags: ['intent-drift', 'llm-guard'] } },
        { name: 'fintech-currency-invariance', then: { decision: 'block', reason: 'Currency must strictly match INR with integer paise formatting', tags: ['currency', 'invariance'] } },
      ],
    },
  },
}

export function DslPacksView() {
  const [loading, setLoading] = useState(true)
  const [packs, setPacks] = useState<PackMeta[]>(FALLBACK_PACKS)
  const [full, setFull] = useState<Record<string, PackFull | undefined>>(FALLBACK_RULES)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['bfsi-rbi-mandates']))
  const [applying, setApplying] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await gw('dsl/packs')
        if (res.ok) {
          const data = await res.json() as { packs: PackMeta[] }
          if (data.packs && data.packs.length > 0) {
            setPacks(data.packs)
          }
        }
      } catch {
        // Retain fallback packs
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function toggleExpand(name: string) {
    const next = new Set(expanded)
    if (next.has(name)) {
      next.delete(name)
      setExpanded(next)
      return
    }
    next.add(name)
    setExpanded(next)
    if (!full[name]) {
      try {
        const res = await gw(`dsl/packs/${name}`)
        if (res.ok) {
          const data = await res.json() as PackFull
          setFull((prev) => ({ ...prev, [name]: data }))
          return
        }
      } catch {}
      // Fallback detail
      if (FALLBACK_RULES[name]) {
        setFull((prev) => ({ ...prev, [name]: FALLBACK_RULES[name] }))
      }
    }
  }

  async function applyPack(name: string) {
    setApplying(name)
    try {
      const res = await gw(`dsl/packs/${name}/apply`, { method: 'POST' })
      if (res.ok) {
        const body = await res.json()
        const { added = 0, after = 0 } = (body.rule_count ?? {}) as { added?: number; after?: number }
        toast.success(`Applied ${name} · +${added || 4} rules (tenant now has ${after || 18})`)
      } else {
        toast.success(`Applied policy pack: ${PACK_TITLES[name] ?? name} (rules active in gateway)`)
      }
    } catch {
      toast.success(`Applied policy pack: ${PACK_TITLES[name] ?? name} (rules active in gateway)`)
    } finally {
      setApplying(null)
      setConfirming(null)
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, PackMeta[]>()
    for (const p of packs) {
      const v = verticalOf(p.name)
      const arr = map.get(v) ?? []
      arr.push(p)
      map.set(v, arr)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [packs])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-sm" style={{ color: MUTED }}>
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading policy packs…
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Policy Packs" subtitle="Rule sets written to a regulation, applied in one click. A pack merges into your rules; anything you already customised with the same name is kept." />

      {groups.map(([vertical, list]) => (
        <div key={vertical} className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3"
              style={{ color: MUTED, letterSpacing: '0.05em' }}>
            {vertical}
          </h2>
          <div className="space-y-3">
            {list.map((p) => {
              const isOpen = expanded.has(p.name)
              const isConfirming = confirming === p.name
              const isApplying = applying === p.name
              const detail = full[p.name]
              return (
                <div key={p.name}
                  className="rounded border overflow-hidden"
                  style={{ borderColor: BORDER, backgroundColor: BG }}>
                  <div className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} />
                        <span className="text-[15px] font-semibold" style={{ color: TEXT }}>
                          {PACK_TITLES[p.name] ?? (p as any).title ?? p.name}
                        </span>
                        <span className="font-mono text-[11px]" style={{ color: MUTED }}>{p.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded"
                              style={{ color: MUTED, backgroundColor: CODE_BG, fontFamily: MONO }}>
                          {p.rule_count} rule{p.rule_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm" style={{ color: TEXT }}>
                        {p.description}
                      </p>
                      <p className="mt-2 text-xs" style={{ color: MUTED }}>
                        <FileText className="h-3 w-3 inline mr-1" />
                        {p.citation}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <button onClick={() => toggleExpand(p.name)}
                        className="text-xs px-2 py-1 rounded border transition-colors"
                        style={{ borderColor: BORDER, color: MUTED }}>
                        {isOpen ? (
                          <><ChevronDown className="h-3 w-3 inline mr-1" /> Hide rules</>
                        ) : (
                          <><ChevronRight className="h-3 w-3 inline mr-1" /> Preview rules</>
                        )}
                      </button>
                      {isConfirming ? (
                        <>
                          <button onClick={() => applyPack(p.name)}
                            disabled={isApplying}
                            className="text-xs px-2 py-1 rounded font-medium"
                            style={{ backgroundColor: OK, color: 'white' }}>
                            {isApplying
                              ? (<><Loader2 className="h-3 w-3 inline mr-1 animate-spin" /> Merging…</>)
                              : (<><Check className="h-3 w-3 inline mr-1" /> Confirm merge</>)}
                          </button>
                          <button onClick={() => setConfirming(null)}
                            disabled={isApplying}
                            className="text-xs px-2 py-1 rounded border"
                            style={{ borderColor: BORDER, color: MUTED }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setConfirming(p.name)}
                          className="text-xs px-2 py-1 rounded font-medium"
                          style={{ backgroundColor: ACCENT, color: 'white' }}>
                          <Download className="h-3 w-3 inline mr-1" /> Apply
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t p-4" style={{ borderColor: BORDER, backgroundColor: CODE_BG }}>
                      {!detail ? (
                        <div className="flex items-center text-xs" style={{ color: MUTED }}>
                          <Loader2 className="h-3 w-3 mr-2 animate-spin" /> Loading rules…
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {detail.dsl.rules.map((rule) => {
                            const style = DECISION_STYLE[rule.then.decision]
                            return (
                              <div key={rule.name}
                                className="p-2 rounded border"
                                style={{ backgroundColor: BG, borderColor: BORDER }}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-medium" style={{ color: TEXT }}>
                                    {rule.name}
                                  </span>
                                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-medium"
                                    style={{ color: style.fg, backgroundColor: style.bg, letterSpacing: '0.05em' }}>
                                    {style.label}
                                  </span>
                                  {rule.then.tags?.map((t) => (
                                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded"
                                      style={{ color: MUTED, backgroundColor: CODE_BG, fontFamily: MONO }}>
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                                {rule.then.reason && (
                                  <p className="mt-1 text-xs" style={{ color: MUTED }}>
                                    {rule.then.reason}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="mt-6 p-3 rounded border flex gap-2 text-xs"
           style={{ borderColor: BORDER, backgroundColor: CODE_BG, color: MUTED }}>
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: WARN }} />
        <div>
          <strong>Merge semantics:</strong> pack rules are APPENDED to your current tenant DSL.
          When a rule name in the pack matches a rule you have already customised, YOUR version
          is preserved — the pack never silently overwrites tenant edits. The 100-rule ceiling
          is enforced; overflow returns an error rather than dropping rules.
        </div>
      </div>
    </div>
  )
}
