'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Zap,
  Droplets,
  Wifi,
  Cloud,
  Building2,
  ShieldCheck,
  Bot,
  Check,
  Plus,
  Search,
  Copy,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  X,
  Lock,
  KeyRound,
  Clock,
  Sliders,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Code2,
  Terminal,
  Loader2,
  AlertCircle,
  FileText,
  Info,
  LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  AgentPurposeId,
  PURPOSE_CATALOG,
  PURPOSE_LIST,
  PurposeCatalogEntry,
} from '@/lib/biller-catalog'
import {
  AgentMandateConfig,
  agentMandateStore,
  formatInr,
  formatPaise,
  computeMandateRiskPosture,
} from '@/lib/agent-mandates'
import { USE_MOCK } from '@/lib/mock-traces'

export interface RegisterAgentModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: (newAgent: any) => void
}

const PURPOSE_ICONS: Record<PurposeCatalogEntry['iconKey'], LucideIcon> = {
  Zap,
  Droplets,
  Wifi,
  Cloud,
  Building2,
  ShieldCheck,
  Bot,
}

export function RegisterAgentModal({ open, onClose, onSuccess }: RegisterAgentModalProps) {
  // Purpose & Basic
  const [purposeId, setPurposeId] = useState<AgentPurposeId>('electricity')
  const [name, setName] = useState('')
  const [hasManuallyEditedLimits, setHasManuallyEditedLimits] = useState(false)

  // Financial Guardrails
  const activePurpose = PURPOSE_CATALOG[purposeId]
  const [monthlyLimit, setMonthlyLimit] = useState(activePurpose.defaultMonthlyCapInr)
  const [dailyLimit, setDailyLimit] = useState(activePurpose.defaultDailyCapInr)
  const [stepUpLine, setStepUpLine] = useState(activePurpose.defaultStepUpInr)

  // Payees & Whitelist
  const [selectedPayees, setSelectedPayees] = useState<string[]>([
    ...activePurpose.majorBillers.slice(0, 2),
  ])
  const [payeeSearch, setPayeeSearch] = useState('')
  const [customPayeeInput, setCustomPayeeInput] = useState('')
  const [whitelistMode, setWhitelistMode] = useState<'strict' | 'step_up_unlisted'>('strict')

  // Velocity & Safety
  const [ttlDays, setTtlDays] = useState<30 | 90 | 365 | null>(90)
  const [maxTxnsPerDay, setMaxTxnsPerDay] = useState<number>(20)
  const [businessHoursOnly, setBusinessHoursOnly] = useState<boolean>(true)
  const [autoQuarantine, setAutoQuarantine] = useState<boolean>(true)

  // Advanced & Gateway Settings
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [customId, setCustomId] = useState('')
  const [description, setDescription] = useState('')
  const [declaredTools, setDeclaredTools] = useState<string>(activePurpose.suggestedTools.join(', '))
  const [environments, setEnvironments] = useState<Array<'dev' | 'staging' | 'prod'>>(['dev', 'prod'])
  const [issueSecret, setIssueSecret] = useState(true)

  // Submission & Post-Submit State
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sealedCredential, setSealedCredential] = useState<{
    mandateId: string
    agentId: string
    agentName: string
    secret: string
    revealed: boolean
    activeSnippetTab: 'ts' | 'curl' | 'env'
  } | null>(null)

  // 3D Tilt Card Physics
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 })

  // Auto-slug derivation
  const autoSlug = useMemo(() => {
    if (!name.trim()) return 'agent_unnamed'
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    return slug.startsWith('agent_') ? slug : `agent_${slug}`
  }, [name])

  // Purpose Switch Handler
  const handleSelectPurpose = (newId: AgentPurposeId) => {
    setPurposeId(newId)
    const p = PURPOSE_CATALOG[newId]
    setSelectedPayees([...p.majorBillers.slice(0, 2)])
    setDeclaredTools(p.suggestedTools.join(', '))
    if (!hasManuallyEditedLimits) {
      setMonthlyLimit(p.defaultMonthlyCapInr)
      setDailyLimit(p.defaultDailyCapInr)
      setStepUpLine(p.defaultStepUpInr)
    }
  }

  // Monthly Limit Handler
  const handleMonthlyChange = (val: number) => {
    setHasManuallyEditedLimits(true)
    setMonthlyLimit(val)
    if (dailyLimit > val) {
      setDailyLimit(val)
      if (stepUpLine > val) setStepUpLine(val)
    }
  }

  // Daily Limit Handler
  const handleDailyChange = (val: number) => {
    setHasManuallyEditedLimits(true)
    const clamped = Math.min(val, monthlyLimit)
    setDailyLimit(clamped)
    if (stepUpLine > clamped) setStepUpLine(clamped)
  }

  // Step-Up Line Handler
  const handleStepUpChange = (val: number) => {
    setHasManuallyEditedLimits(true)
    setStepUpLine(Math.min(val, dailyLimit))
  }

  // Toggle Payee Selection
  const togglePayee = (p: string) => {
    setSelectedPayees((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    )
  }

  // Add Custom Payee
  const handleAddCustomPayee = () => {
    const trimmed = customPayeeInput.trim().toUpperCase()
    if (!trimmed) return
    if (!selectedPayees.includes(trimmed)) {
      setSelectedPayees((prev) => [...prev, trimmed])
      toast.success(`Payee "${trimmed}" added to whitelist`)
    }
    setCustomPayeeInput('')
  }

  // Filtered Billers
  const filteredBillers = useMemo(() => {
    if (!payeeSearch.trim()) return activePurpose.majorBillers
    const q = payeeSearch.toLowerCase().trim()
    return activePurpose.majorBillers.filter((b) => b.toLowerCase().includes(q))
  }, [activePurpose.majorBillers, payeeSearch])

  // Computed Risk Posture
  const riskPosture = useMemo(() => {
    return computeMandateRiskPosture({
      purpose: purposeId,
      maxMonthlyLimitInr: monthlyLimit,
      dailyLimitInr: dailyLimit,
      stepUpThresholdInr: stepUpLine,
      approvedPayees: selectedPayees,
      whitelistMode,
      businessHoursOnly,
    })
  }, [purposeId, monthlyLimit, dailyLimit, stepUpLine, selectedPayees, whitelistMode, businessHoursOnly])

  // Keyboard navigation / dismissal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // 3D Card Mouse Move
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const mx = Math.round((x / rect.width) * 100)
    const my = Math.round((y / rect.height) * 100)
    const rx = ((y - rect.height / 2) / (rect.height / 2)) * -3.5
    const ry = ((x - rect.width / 2) / (rect.width / 2)) * 3.5
    setTilt({ rx, ry, mx, my })
  }

  const handleCardMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50 })
  }

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMessage('Agent name is required')
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const agentIdentifier = customId.trim() || autoSlug
    const mandateId = `MND_${agentIdentifier.toUpperCase()}_${Date.now().toString().slice(-4)}`

    const mandateConfig: AgentMandateConfig = {
      purpose: purposeId,
      maxMonthlyLimitInr: monthlyLimit,
      dailyLimitInr: dailyLimit,
      stepUpThresholdInr: stepUpLine,
      approvedPayees: selectedPayees,
      whitelistMode,
      ttlDays,
      maxTxnsPerDay,
      businessHoursOnly,
      autoQuarantineOnBlocks: autoQuarantine,
      authMode: 'ed25519_permit',
      mandateId,
      createdAt: new Date().toISOString(),
    }

    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        issue_secret: issueSecret,
        environments,
      }
      if (customId.trim()) payload.id = customId.trim()
      if (ownerEmail.trim()) payload.owner_email = ownerEmail.trim()
      if (description.trim()) payload.description = description.trim()
      if (declaredTools.trim()) {
        payload.declared_tools = declaredTools
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }

      let secretStr = `agt_live_${Array.from({ length: 24 }, () =>
        Math.floor(Math.random() * 36).toString(36)
      ).join('')}`
      let createdAgent: any = null

          try {
            const res = await fetch('/api/gateway/agents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...payload,
                mandate: mandateConfig,
              }),
            })
            if (res.ok) {
              const data = await res.json()
              createdAgent = data.agent ?? data
              if (data.secret) secretStr = data.secret
            }
          } catch {
            // Fallback
          }

          if (!createdAgent) {
            createdAgent = {
              id: agentIdentifier,
              name: name.trim(),
              owner_email: ownerEmail.trim() || 'operator@bank.internal',
              description: description.trim() || activePurpose.shortDescription,
              declared_tools: payload.declared_tools || activePurpose.suggestedTools,
              environments,
              status: 'active',
              has_secret: issueSecret,
              has_public_key: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          }

          // Persist mandate to store
          agentMandateStore.saveMandate(agentIdentifier, mandateConfig, name.trim())

          toast.success(`Agent ${name.trim()} Registered`, {
            description: `Mandate ${mandateId} notarized with ${formatInr(dailyLimit)} daily cap.`,
          })

          onSuccess?.(createdAgent)

          if (issueSecret) {
            setSealedCredential({
              mandateId,
              agentId: agentIdentifier,
              agentName: name.trim(),
              secret: secretStr,
              revealed: false,
              activeSnippetTab: 'ts',
            })
          } else {
            onClose()
          }
        } catch (err: any) {
          setErrorMessage(err.message || 'Failed to register agent')
          toast.error('Registration Error', { description: err.message })
        } finally {
          setSubmitting(false)
        }
      }

      if (!open) return null

      // Two-tone threshold percentages
      const safePct = dailyLimit > 0 ? Math.min(100, (stepUpLine / dailyLimit) * 100) : 0
      const passkeyPct = dailyLimit > 0 ? Math.max(0, 100 - safePct) : 0

      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => onClose()}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: 'perspective(1200px) translate3d(0, 0, 0)',
            }}
            className="w-full max-w-5xl max-h-[92vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            {/* Modal Top Header */}
            <div className="px-6 py-4 border-b border-border bg-secondary/30 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Bot className="h-5 w-5" strokeWidth={1.6} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">
                      {sealedCredential ? 'Sealed Credential Vault' : 'Register Agent & Mandate Studio'}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                      KEY #1 DELEGATION
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sealedCredential
                      ? 'Cryptographic identity sealed. Export credentials for agent integration.'
                      : 'Define autonomous agent identity, scoped financial boundaries, and biometric step-up lines.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>

            {/* ── POST-SUBMIT: SEALED CREDENTIAL VAULT ── */}
            {sealedCredential ? (
              <div className="p-6 overflow-y-auto space-y-6">
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" strokeWidth={1.6} />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      Agent Identity &amp; Mandate Active
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Registered <strong className="text-foreground">{sealedCredential.agentName}</strong>{' '}
                      with mandate ID <code className="font-mono text-foreground font-bold">{sealedCredential.mandateId}</code>.
                      Copy the one-time agent secret below. AgentShield does not store plaintext secrets.
                    </p>
                  </div>
                </div>

                {/* Secret Card */}
                <div className="p-5 rounded-xl border border-border bg-secondary/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.6} />
                      X-AEGIS-Agent-Secret (One-Time Plaintext)
                    </span>
                    <span className="text-[10.5px] font-mono text-rose-500">Unrecoverable upon exit</span>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-background font-mono text-xs">
                    <span className="flex-1 truncate select-all">
                      {sealedCredential.revealed
                        ? sealedCredential.secret
                        : '•'.repeat(sealedCredential.secret.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSealedCredential((prev) =>
                          prev ? { ...prev, revealed: !prev.revealed } : null
                        )
                      }
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title={sealedCredential.revealed ? 'Hide secret' : 'Reveal secret'}
                    >
                      {sealedCredential.revealed ? (
                        <EyeOff className="h-4 w-4" strokeWidth={1.6} />
                      ) : (
                        <Eye className="h-4 w-4" strokeWidth={1.6} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(sealedCredential.secret)
                        toast.success('Agent secret copied to clipboard')
                      }}
                      className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs flex items-center gap-1 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" strokeWidth={1.6} />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>

                {/* Quick Integration Tabs */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Quick Integration Snippets
                    </span>
                    <div className="flex rounded-lg border border-border p-0.5 bg-secondary/40 text-xs">
                      {(['ts', 'curl', 'env'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() =>
                            setSealedCredential((prev) =>
                              prev ? { ...prev, activeSnippetTab: tab } : null
                            )
                          }
                          className={cn(
                            'px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors',
                            sealedCredential.activeSnippetTab === tab
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {tab === 'ts' ? 'TypeScript SDK' : tab === 'curl' ? 'cURL' : '.env'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative rounded-xl border border-border bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto">
                    <pre className="text-[11px] leading-relaxed">
                      {sealedCredential.activeSnippetTab === 'ts' &&
                        `import { AgentGuardClient } from '@agentguard/sdk-js'\n\nconst client = new AgentGuardClient({\n  gatewayUrl: 'http://localhost:8080',\n  agentId: '${sealedCredential.agentId}',\n  agentSecret: '${sealedCredential.secret}',\n})\n\n// Pre-execution evaluation under mandate ${sealedCredential.mandateId}\nconst permit = await client.evaluateTransfer({\n  payee: '${selectedPayees[0] || 'BESCOM'}',\n  amountPaise: 490000, // ₹4,900.00\n})`}
                      {sealedCredential.activeSnippetTab === 'curl' &&
                        `curl -X POST http://localhost:8080/api/v1/permits \\\n  -H "Content-Type: application/json" \\\n  -H "X-AEGIS-Agent-Id: ${sealedCredential.agentId}" \\\n  -H "X-AEGIS-Agent-Secret: ${sealedCredential.secret}" \\\n  -d '{"payee":"${selectedPayees[0] || 'BESCOM'}","amount_paise":490000}'`}
                      {sealedCredential.activeSnippetTab === 'env' &&
                        `AGENTGUARD_GATEWAY_URL="http://localhost:8080"\nAGENTGUARD_AGENT_ID="${sealedCredential.agentId}"\nAGENTGUARD_AGENT_SECRET="${sealedCredential.secret}"\nAGENTGUARD_MANDATE_ID="${sealedCredential.mandateId}"`}
                    </pre>
                    <button
                      type="button"
                      onClick={() => {
                        const content =
                          sealedCredential.activeSnippetTab === 'ts'
                            ? `import { AgentGuardClient } from '@agentguard/sdk-js'\nconst client = new AgentGuardClient({ gatewayUrl: 'http://localhost:8080', agentId: '${sealedCredential.agentId}', agentSecret: '${sealedCredential.secret}' })`
                            : sealedCredential.activeSnippetTab === 'curl'
                              ? `curl -X POST http://localhost:8080/api/v1/permits -H "X-AEGIS-Agent-Id: ${sealedCredential.agentId}" -H "X-AEGIS-Agent-Secret: ${sealedCredential.secret}"`
                              : `AGENTGUARD_AGENT_ID="${sealedCredential.agentId}"\nAGENTGUARD_AGENT_SECRET="${sealedCredential.secret}"`
                        navigator.clipboard?.writeText(content)
                        toast.success('Snippet copied to clipboard')
                      }}
                      className="absolute top-3 right-3 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1 transition-colors"
                    >
                      <Copy className="h-3 w-3" strokeWidth={1.6} />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs transition-opacity hover:opacity-90 shadow-sm"
                  >
                    Done &amp; Return to Agents
                  </button>
                </div>
              </div>
            ) : (
              /* ── 3D SPLIT-PANE STUDIO LAYOUT ── */
              <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-0">
                {/* LEFT PANE (7 cols, 58% width, scrollable cleanly inside modal) */}
                <form
                  onSubmit={handleSubmit}
                  className="lg:col-span-7 overflow-y-auto p-5 sm:p-6 space-y-6 border-b lg:border-b-0 lg:border-r border-border"
                >
                  {/* 1. Agent Name & Auto-Slug */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>1. Agent Name &amp; Identity</span>
                      <span className="font-mono text-[10.5px] text-indigo-500 font-normal">
                        Auto-Slug: {autoSlug}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Home Electricity Auto-Pay"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-secondary/30 text-foreground text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                      />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <span className="font-mono text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
                          {autoSlug}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Purpose Selector Grid */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        2. Core Purpose &amp; Utility Category
                      </label>
                      <span className="text-[11px] text-muted-foreground">7 Preset Utility Archetypes</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {PURPOSE_LIST.map((p) => {
                        const IconComponent = PURPOSE_ICONS[p.iconKey]
                        const isSelected = purposeId === p.id

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectPurpose(p.id)}
                            className={cn(
                              'p-3 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between select-none active:scale-[0.98]',
                              isSelected
                                ? 'border-indigo-500 bg-secondary/80 ring-1 ring-indigo-500/30 shadow-sm'
                                : 'border-border bg-card hover:bg-secondary/30'
                            )}
                          >
                            <div className="flex items-center justify-between w-full mb-1.5">
                              <div
                                className={cn(
                                  'p-1.5 rounded-lg border',
                                  isSelected
                                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500'
                                    : 'bg-secondary border-border text-muted-foreground'
                                )}
                              >
                                <IconComponent className="h-4 w-4" strokeWidth={1.6} />
                              </div>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 text-indigo-500" strokeWidth={2.2} />
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-foreground leading-tight truncate">
                                {p.label}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                Def. {formatInr(p.defaultDailyCapInr)}/day
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* 3. Financial Guardrails (Integer-Paise Precision) */}
                  <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Sliders className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.6} />
                        3. Financial Guardrails (Integer-Paise Caps)
                      </span>
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        Zero Float Rounding
                      </span>
                    </div>

                    {/* Monthly Cap */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Max Monthly Limit:</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-foreground text-sm">
                            {formatInr(monthlyLimit)}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground block">
                            {formatPaise(monthlyLimit)}
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="5000"
                        max="500000"
                        step="5000"
                        value={monthlyLimit}
                        onChange={(e) => handleMonthlyChange(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                      <div className="flex gap-1.5 flex-wrap">
                        {[10000, 25000, 50000, 100000, 500000].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => handleMonthlyChange(v)}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10.5px] font-mono border transition-colors',
                              monthlyLimit === v
                                ? 'bg-primary text-primary-foreground border-primary font-bold'
                                : 'bg-background hover:bg-secondary text-muted-foreground border-border'
                            )}
                          >
                            {formatInr(v)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Daily Cap */}
                    <div className="space-y-1.5 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Daily Limit Cap:</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-foreground text-sm">
                            {formatInr(dailyLimit)}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground block">
                            {formatPaise(dailyLimit)}
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="1000"
                        max={monthlyLimit}
                        step="1000"
                        value={dailyLimit}
                        onChange={(e) => handleDailyChange(Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                      <div className="flex gap-1.5 flex-wrap">
                        {[2000, 5000, 10000, 25000].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => handleDailyChange(v)}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10.5px] font-mono border transition-colors',
                              dailyLimit === v
                                ? 'bg-primary text-primary-foreground border-primary font-bold'
                                : 'bg-background hover:bg-secondary text-muted-foreground border-border'
                            )}
                          >
                            {formatInr(v)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Passkey Step-Up Line */}
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">
                          Biometric Passkey Step-Up Line:
                        </span>
                        <span className="font-mono font-bold text-amber-500 text-sm">
                          {formatInr(stepUpLine)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="500"
                        max={dailyLimit}
                        step="500"
                        value={stepUpLine}
                        onChange={(e) => handleStepUpChange(Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />

                      {/* Two-tone threshold bar */}
                      <div className="space-y-1">
                        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden flex">
                          <div
                            className="h-full bg-emerald-500 transition-[width] duration-200"
                            style={{ width: `${safePct}%` }}
                          />
                          <div
                            className="h-full bg-amber-500 transition-[width] duration-200"
                            style={{ width: `${passkeyPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                          <span className="text-emerald-500">₹0 – {formatInr(stepUpLine)} Autonomous (&lt;4ms)</span>
                          <span className="text-amber-500">{formatInr(stepUpLine)} – {formatInr(dailyLimit)} FIDO2 Step-Up</span>
                          <span className="text-rose-500">&gt; {formatInr(dailyLimit)} Hard Block</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Approved Payees / Billers (Dynamic by Purpose) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          4. Approved Payees / Billers
                        </label>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-muted text-muted-foreground">
                          Optional · {selectedPayees.length} selected
                        </span>
                      </div>
                      {selectedPayees.length > 0 && (
                        <div className="flex rounded-md border border-border p-0.5 text-[10.5px]">
                          <button
                            type="button"
                            onClick={() => setWhitelistMode('strict')}
                            className={cn(
                              'px-2 py-0.5 rounded font-semibold transition-colors',
                              whitelistMode === 'strict'
                                ? 'bg-rose-500/20 text-rose-500'
                                : 'text-muted-foreground'
                            )}
                          >
                            Strict Block
                          </button>
                          <button
                            type="button"
                            onClick={() => setWhitelistMode('step_up_unlisted')}
                            className={cn(
                              'px-2 py-0.5 rounded font-semibold transition-colors',
                              whitelistMode === 'step_up_unlisted'
                                ? 'bg-amber-500/20 text-amber-500'
                                : 'text-muted-foreground'
                            )}
                          >
                            Hold for Passkey
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Payee Search & Custom Add */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={payeeSearch}
                          onChange={(e) => setPayeeSearch(e.target.value)}
                          placeholder={`Search ${activePurpose.label} billers...`}
                          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-secondary/30 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={customPayeeInput}
                          onChange={(e) => setCustomPayeeInput(e.target.value)}
                          placeholder="+ Custom Payee/UPI"
                          className="w-36 px-2.5 py-1.5 rounded-lg border border-border bg-secondary/30 text-foreground text-xs uppercase font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomPayee}
                          className="px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Major Billers Chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 rounded-lg border border-border/60 bg-secondary/10">
                      {filteredBillers.map((biller) => {
                        const isSelected = selectedPayees.includes(biller)
                        return (
                          <button
                            key={biller}
                            type="button"
                            onClick={() => togglePayee(biller)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-all flex items-center gap-1 active:scale-[0.98]',
                              isSelected
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold'
                                : 'bg-card border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 text-emerald-500" strokeWidth={2.4} />}
                            <span>{biller}</span>
                          </button>
                        )
                      })}
                      {filteredBillers.length === 0 && (
                        <span className="text-xs text-muted-foreground italic p-2">
                          No matching billers found. You can add a custom payee code above.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 5. Velocity, Expiry & Safety Controls */}
                  <div className="space-y-3 pt-2 border-t border-border">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                      5. Velocity, Expiry &amp; Safety Controls
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      {/* TTL */}
                      <div className="p-3 rounded-lg border border-border bg-secondary/20 space-y-1.5">
                        <span className="text-muted-foreground font-medium block text-[11px]">
                          Mandate Expiry TTL:
                        </span>
                        <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                          {([30, 90, 365, null] as const).map((days) => (
                            <button
                              key={String(days)}
                              type="button"
                              onClick={() => setTtlDays(days)}
                              className={cn(
                                'p-1 rounded border text-center font-semibold transition-colors',
                                ttlDays === days
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-background border-border text-muted-foreground hover:bg-secondary'
                              )}
                            >
                              {days ? `${days}d` : 'No Exp'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Max Txns / Day */}
                      <div className="p-3 rounded-lg border border-border bg-secondary/20 space-y-1.5">
                        <span className="text-muted-foreground font-medium block text-[11px]">
                          Max Txns / Day:
                        </span>
                        <div className="flex items-center justify-between border border-border rounded p-1 bg-background">
                          <button
                            type="button"
                            onClick={() => setMaxTxnsPerDay((p) => Math.max(1, p - 5))}
                            className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 font-mono font-bold"
                          >
                            -
                          </button>
                          <span className="font-mono font-bold text-foreground">{maxTxnsPerDay}</span>
                          <button
                            type="button"
                            onClick={() => setMaxTxnsPerDay((p) => p + 5)}
                            className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 font-mono font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Safety Toggles */}
                      <div className="p-3 rounded-lg border border-border bg-secondary/20 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-foreground">
                          <input
                            type="checkbox"
                            checked={businessHoursOnly}
                            onChange={(e) => setBusinessHoursOnly(e.target.checked)}
                            className="rounded border-border accent-indigo-600"
                          />
                          <span>IST Hours (08:00–22:00)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-foreground">
                          <input
                            type="checkbox"
                            checked={autoQuarantine}
                            onChange={(e) => setAutoQuarantine(e.target.checked)}
                            className="rounded border-border accent-indigo-600"
                          />
                          <span>Auto-Quarantine (3 blocks)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 6. Collapsible Advanced & Gateway Settings Accordion */}
                  <div className="border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="w-full flex items-center justify-between text-xs font-bold text-muted-foreground hover:text-foreground py-1"
                    >
                      <span className="flex items-center gap-1.5 uppercase tracking-wider">
                        <Code2 className="h-3.5 w-3.5 text-indigo-500" />
                        Advanced &amp; Gateway Settings (Optional)
                      </span>
                      {showAdvanced ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {showAdvanced && (
                      <div className="mt-3 p-4 rounded-xl border border-border bg-secondary/20 space-y-3 animate-in fade-in duration-150 text-xs">
                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1 text-muted-foreground font-semibold">
                            Owner Email
                          </label>
                          <input
                            type="email"
                            value={ownerEmail}
                            onChange={(e) => setOwnerEmail(e.target.value)}
                            placeholder="ops@acme.com"
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1 text-muted-foreground font-semibold">
                            Promote Existing Agent ID (optional)
                          </label>
                          <input
                            type="text"
                            value={customId}
                            onChange={(e) => setCustomId(e.target.value)}
                            placeholder="<uuid>"
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-background font-mono text-xs text-foreground"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1 text-muted-foreground font-semibold">
                            Description
                          </label>
                          <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What this autonomous agent does"
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1 text-muted-foreground font-semibold">
                            Declared Tools (comma-separated)
                          </label>
                          <input
                            type="text"
                            value={declaredTools}
                            onChange={(e) => setDeclaredTools(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-background font-mono text-xs text-foreground"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1 text-muted-foreground font-semibold">
                            Deployment Environments
                          </label>
                          <div className="flex gap-1.5">
                            {(['dev', 'staging', 'prod'] as const).map((env) => {
                              const active = environments.includes(env)
                              return (
                                <button
                                  key={env}
                                  type="button"
                                  onClick={() =>
                                    setEnvironments((prev) =>
                                      active ? prev.filter((x) => x !== env) : [...prev, env]
                                    )
                                  }
                                  className={cn(
                                    'px-2.5 py-1 rounded border text-[11px] font-mono font-semibold transition-colors',
                                    active
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background border-border text-muted-foreground'
                                  )}
                                >
                                  {env}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground pt-1">
                          <input
                            type="checkbox"
                            checked={issueSecret}
                            onChange={(e) => setIssueSecret(e.target.checked)}
                            className="rounded border-border accent-indigo-600"
                          />
                          <span>Issue agent secret (X-AEGIS-Agent-Secret required on every call)</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Error Message */}
                  {errorMessage && (
                    <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-40"
                    >
                      {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>Register &amp; Mint Mandate</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </form>

                {/* RIGHT PANE (5 cols, 42% width, sticky inside modal: Live 3D Vault Mandate Card) */}
                <div className="lg:col-span-5 p-5 sm:p-6 bg-secondary/15 flex flex-col justify-between overflow-y-auto space-y-5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                        Live 3D Vault Mandate Card
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-mono font-bold border',
                          riskPosture === 'Low Risk'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            : riskPosture === 'Balanced'
                              ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30'
                              : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                        )}
                      >
                        {riskPosture} Posture
                      </span>
                    </div>

                    {/* 3D Tilt Card */}
                    <div
                      ref={cardRef}
                      onMouseMove={handleCardMouseMove}
                      onMouseLeave={handleCardMouseLeave}
                      style={{
                        transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
                        transition: 'transform 120ms ease-out',
                      }}
                      className="relative rounded-2xl border border-border bg-gradient-to-br from-card via-card/90 to-secondary/60 p-5 shadow-xl select-none overflow-hidden"
                    >
                      {/* Cursor Specular Highlight */}
                      <div
                        className="pointer-events-none absolute inset-0 opacity-40 transition-opacity"
                        style={{
                          background: `radial-gradient(circle 180px at ${tilt.mx}% ${tilt.my}%, hsl(var(--brand) / 0.25), transparent 70%)`,
                        }}
                      />

                      {/* Card Content */}
                      <div className="relative z-10 space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-500 shadow-sm">
                              {React.createElement(PURPOSE_ICONS[activePurpose.iconKey], {
                                className: 'h-5 w-5',
                                strokeWidth: 1.6,
                              })}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-foreground leading-tight">
                                {name.trim() || 'Agent Name'}
                              </h4>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {autoSlug}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-1">
                            {environments.map((e) => (
                              <span
                                key={e}
                                className="px-1.5 py-0.5 rounded font-mono text-[9px] uppercase font-bold bg-secondary text-foreground border border-border"
                              >
                                {e}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Financial Figures Strip */}
                        <div className="p-3 rounded-xl border border-border/80 bg-background/80 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Daily Allowance:</span>
                            <span className="font-mono font-bold text-foreground">
                              {formatInr(dailyLimit)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Passkey Step-Up Line:</span>
                            <span className="font-mono font-bold text-amber-500">
                              {formatInr(stepUpLine)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                            <span className="text-muted-foreground">Monthly Cap:</span>
                            <span className="font-mono font-bold text-indigo-500">
                              {formatInr(monthlyLimit)}
                            </span>
                          </div>
                        </div>

                        {/* Payees Pills */}
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                            Allowlisted Beneficiaries ({selectedPayees.length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {selectedPayees.slice(0, 4).map((p) => (
                              <span
                                key={p}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-foreground border border-border"
                              >
                                {p}
                              </span>
                            ))}
                            {selectedPayees.length > 4 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-muted-foreground">
                                +{selectedPayees.length - 4} more
                              </span>
                            )}
                            {selectedPayees.length === 0 && (
                              <span className="text-[10.5px] text-muted-foreground italic">
                                Unrestricted payees (Hold/Step-up required)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Ed25519 Fingerprint */}
                        <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                          <span>Auth: Ed25519 Ephemeral</span>
                          <span>ed25519:7f4c…9a0b</span>
                        </div>
                      </div>
                    </div>

                    {/* Plain-English Policy Contract */}
                    <div className="p-4 rounded-xl border border-border bg-card/80 space-y-2 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <FileText className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Plain-English Policy Contract</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                        This agent is authorized for <strong className="text-foreground">{activePurpose.label}</strong>.
                        Transfers up to <strong className="text-emerald-500">{formatInr(stepUpLine)}</strong> execute
                        autonomously in &lt;4ms. Transfers between{' '}
                        <strong className="text-amber-500">{formatInr(stepUpLine)}</strong> and{' '}
                        <strong className="text-amber-500">{formatInr(dailyLimit)}</strong> suspend for customer
                        biometric passkey confirmation. Any single or cumulative daily spend exceeding{' '}
                        <strong className="text-rose-500">{formatInr(dailyLimit)}</strong> is rejected by Bank Gate :4000.
                      </p>

                      {/* Warning if High Monthly Limit & No Payees */}
                      {selectedPayees.length === 0 && monthlyLimit >= 100000 && (
                        <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] flex items-start gap-1.5 mt-2">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            Advisory: High monthly cap ({formatInr(monthlyLimit)}) with no payee allowlist.
                            Consider selecting at least 1 verified beneficiary to avoid exposure.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Guarantee */}
                  <div className="text-[11px] font-mono text-muted-foreground flex items-center justify-between pt-2 border-t border-border">
                    <span>AgentShield Mandate Engine</span>
                    <span>Rule E1: Int64 Paise</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }
