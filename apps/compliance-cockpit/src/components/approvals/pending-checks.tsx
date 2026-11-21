'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, Shield, AlertTriangle, Database, FileText, Globe, Terminal, Mail, BarChart3, HelpCircle, User, RotateCcw } from 'lucide-react'
import { ToolIcon } from '@/lib/tool-icons'
import { describeActivity } from '@/lib/activity-description'
import { friendlyAgent } from '@/lib/friendly-names'
import { ValueView, Excerpt } from '@/components/ui/value-view'
import { PasskeyStepUpModal } from '@/components/banking/passkey-stepup-modal'
import { USE_MOCK, mockPendingChecks, mockTraces } from '@/lib/mock-traces'
import { cn } from '@/lib/utils'

const BORDER = 'hsl(var(--border))'
const MUTED  = 'hsl(var(--muted-foreground))'
const TEXT   = 'hsl(var(--foreground))'

// Semantic colour only where it carries meaning: red = will be blocked unless a
// person allows it; amber = held; everything else is ink on paper.
const RISK_COLORS: Record<string, { text: string; bg: string }> = {
  CRITICAL: { text: 'hsl(0 100% 42%)',  bg: 'hsl(0 100% 42% / 0.08)' },
  HIGH:     { text: 'hsl(0 100% 42%)',  bg: 'hsl(0 100% 42% / 0.08)' },
  MEDIUM:   { text: 'hsl(40 100% 33%)', bg: 'hsl(40 100% 33% / 0.10)' },
  LOW:      { text: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--secondary))' },
}
const CATEGORY_ICON: Record<string, typeof Database> = {
  database: Database,
  file:     FileText,
  network:  Globe,
  shell:    Terminal,
  communication: Mail,
  data:     BarChart3,
  unknown:  HelpCircle,
}
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  return `${Math.round(diff / 3_600_000)}h ago`
}

function LiveTimer({ since }: { since: string }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const diff = Math.max(0, Date.now() - new Date(since).getTime())
  const secs = Math.floor(diff / 1000) % 60
  const mins = Math.floor(diff / 60_000) % 60
  const hrs  = Math.floor(diff / 3_600_000)
  const label = hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  const isLong = diff > 5 * 60_000 // > 5 min
  return (
    <span
      className="text-[11px] font-mono tabular-nums"
      style={{ color: isLong ? 'hsl(40 100% 33%)' : MUTED }}
    >
      held {label}
    </span>
  )
}

export function PendingChecks() {
  const queryClient = useQueryClient()
  const [deciding, setDeciding] = useState<Record<string, 'allowing' | 'blocking'>>({})
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [passkeyCheck, setPasskeyCheck] = useState<any | null>(null)
  const [mockCheckOverrides, setMockCheckOverrides] = useState<any[] | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pending-checks'],
    queryFn: async () => {
      const res = await fetch('/api/gateway/check/pending')
      if (!res.ok) throw new Error('Failed to fetch pending checks')
      return res.json()
    },
    refetchInterval: 1500,
  })

  // Listen for real-time approval events from Workflow Studio & Budget Pools
  useEffect(() => {
    const onApprovalEvent = () => {
      setMockCheckOverrides(null)
      refetch()
      queryClient.invalidateQueries({ queryKey: ['pending-checks'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    }
    window.addEventListener('aegis-approval-event', onApprovalEvent)
    window.addEventListener('storage', onApprovalEvent)
    return () => {
      window.removeEventListener('aegis-approval-event', onApprovalEvent)
      window.removeEventListener('storage', onApprovalEvent)
    }
  }, [refetch, queryClient])

  const checks: any[] = mockCheckOverrides !== null
    ? mockCheckOverrides
    : (data?.checks && data.checks.length > 0 ? data.checks : (USE_MOCK ? mockPendingChecks() : []))

  async function decide(checkId: string, decision: 'allow' | 'block') {
    setDeciding(prev => ({ ...prev, [checkId]: decision === 'allow' ? 'allowing' : 'blocking' }))
    setExitingIds(prev => new Set(prev).add(checkId))
    try {
      const targetCheck = checks.find(c => c.check_id === checkId)

      // 1. If linked to Bank Gate category reservation, approve or release reservation
      if (targetCheck?.reservation_id) {
        try {
          if (decision === 'allow') {
            await fetch(`/api/bank-gate/category-reservations/${targetCheck.reservation_id}/approve`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ passkey_verified: true, verified_at: new Date().toISOString() })
            })
          } else {
            await fetch(`/api/bank-gate/category-reservations/${targetCheck.reservation_id}/release`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'HUMAN_APPROVAL_BLOCKED' })
            })
          }
        } catch (e) {
          console.warn('Bank Gate sync error:', e)
        }
      }

      // 2. 340ms exit collapse transition
      await new Promise(r => setTimeout(r, 340))

      if (mockCheckOverrides !== null) {
        setMockCheckOverrides(prev => (prev || []).filter((c: any) => c.check_id !== checkId))
      }

      // 3. Update gateway / local fallback
      await fetch(`/api/gateway/check/${checkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decided_by: 'dashboard-user' }),
      }).catch(() => {})

      // 4. Dispatch global event & cross-tab storage for immediate bi-directional reactive update
      const eventDetail = {
        check_id: checkId,
        decision,
        workflow_id: targetCheck?.workflow_id,
        reservation_id: targetCheck?.reservation_id,
        agent_id: targetCheck?.agent_id,
      }
      window.dispatchEvent(new CustomEvent('aegis-approval-decided', { detail: eventDetail }))
      try {
        localStorage.setItem('aegis-last-approval-decided', JSON.stringify({ ...eventDetail, ts: Date.now() }))
      } catch {}

      queryClient.invalidateQueries({ queryKey: ['pending-checks'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      refetch()
    } finally {
      setDeciding(prev => { const n = { ...prev }; delete n[checkId]; return n })
      setExitingIds(prev => { const n = new Set(prev); n.delete(checkId); return n })
    }
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg animate-pulse" style={{ background: 'hsl(var(--secondary))' }} />
        ))}
      </div>
    )
  }

  if (checks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3" style={{ color: MUTED }}>
        <Shield className="h-7 w-7 opacity-40 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">No pending checks</p>
        <p className="text-xs text-muted-foreground">All held agent actions have been decided.</p>
        <button
          onClick={() => setMockCheckOverrides(mockPendingChecks())}
          className="mt-2 px-3.5 py-1.5 rounded-lg border border-border bg-secondary hover:bg-muted text-xs font-semibold text-foreground flex items-center gap-1.5 transition shadow-sm"
        >
          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
          Restore Sample Held Calls
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {checks.map((check: any) => (
        <HeldCallCard
          key={check.check_id}
          check={check}
          loading={deciding[check.check_id]}
          isExiting={exitingIds.has(check.check_id)}
          onTriggerPasskey={() => setPasskeyCheck(check)}
          onDecide={d => decide(check.check_id, d)}
        />
      ))}

      {/* Passkey Step-Up Verification Modal for High-Risk Checks */}
      {passkeyCheck && (
        <PasskeyStepUpModal
          isOpen={Boolean(passkeyCheck)}
          onClose={() => setPasskeyCheck(null)}
          agentName={passkeyCheck.agent_name || friendlyAgent(passkeyCheck.agent_id)}
          payee={passkeyCheck.arguments?.payee || passkeyCheck.arguments?.destination || passkeyCheck.arguments?.merchant || 'Requested Payee'}
          amountPaise={Number(passkeyCheck.arguments?.amount_paise || (passkeyCheck.arguments?.amount ? Number(passkeyCheck.arguments.amount) * 100 : 485000))}
          thresholdPaise={200000}
          reason={plainReason(passkeyCheck)}
          onApproved={() => {
            const id = passkeyCheck.check_id
            setPasskeyCheck(null)
            decide(id, 'allow')
          }}
        />
      )}
    </div>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  read_file: 'a file the agent read', get_webpage: 'a web page', read_inbox: 'the inbox',
  read_channel_messages: 'a Slack channel', search_emails: 'an email search',
}

/** Rule names are for policy authors; a reviewer needs the reason. */
function plainReason(check: any): string {
  const r: string = check.rule ?? ''
  if (r.includes('destination')) return 'Where this sends to came from content the agent read, not from the person it works for.'
  if (r.includes('exfil-sink')) return 'Nothing the person asked for explains this outbound call.'
  if (r.includes('destructive')) return 'An irreversible action that traces back to content the agent read.'
  if (r.includes('tool-named')) return 'Only the content the agent read mentions this tool; the person never did.'
  if (r.includes('authority-review')) return 'This call is better explained by what a tool returned than by the request it serves.'
  if (r.includes('unclear-authority')) return 'An outbound call the request does not clearly ask for.'
  const v: string = check.violations?.[0] ?? ''
  if (/requires human (approval|review)/i.test(v)) return 'Messages, invitations and other outbound communication always go to a person in this deployment.'
  return v || 'Held for a person to decide.'
}

function HeldCallCard({ check, loading, isExiting, onTriggerPasskey, onDecide }: {
  check: any
  loading?: 'allowing' | 'blocking'
  isExiting?: boolean
  onTriggerPasskey?: () => void
  onDecide: (d: 'allow' | 'block') => void
}) {
  const ev = check.evidence
  const act = describeActivity({ tool_call: { tool_name: check.tool_name, arguments: check.arguments } })
  const highlight: string[] = ev?.untrusted_only_values ?? []
  const fromUntrusted = ev?.authorised_by === 'untrusted' || highlight.length > 0
  const hasArgs = check.arguments && Object.keys(check.arguments).length > 0

  const requiresPasskey =
    check.risk === 'CRITICAL' ||
    check.risk === 'HIGH' ||
    check.tool_name?.includes('payment') ||
    check.tool_name?.includes('transfer') ||
    (check.arguments && (
      Number(check.arguments.amount) > 200000 ||
      Number(check.arguments.amount_paise) > 200000 ||
      Number(check.arguments.amount) > 2000
    ))

  return (
    <article
      className={cn(
        "rounded-2xl border overflow-hidden transition-all duration-300",
        isExiting && "approval-card-exit"
      )}
      style={{ borderColor: BORDER, background: 'hsl(var(--card))' }}
    >
      {/* what the agent wants to do, in a sentence */}
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        <ToolIcon name={act.iconKey ?? check.tool_name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-semibold leading-snug" style={{ color: TEXT }}>{act.text}</p>
            {check.source === 'workflow_studio' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                Workflow Studio · Step 4 Gate
              </span>
            )}
            {check.source === 'budget_simulator' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Budget Pools · Invariant I1 Step-Up
              </span>
            )}
            {check.source === 'bank_gate' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Bank Gate :4000 · Sovereign Hold
              </span>
            )}
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>
            {check.agent_name || friendlyAgent(check.agent_id)} wants to run <span className="font-mono">{check.tool_name}</span>
          </p>
        </div>
        <LiveTimer since={check.created_at} />
      </header>

      {/* why it is waiting */}
      <div className="mx-5 mb-4 flex gap-2.5 rounded-xl px-3.5 py-2.5"
           style={{ background: fromUntrusted ? 'hsl(36 100% 50% / 0.10)' : 'hsl(var(--secondary))' }}>
        <AlertTriangle className="h-4 w-4 mt-[1px] flex-shrink-0" style={{ color: fromUntrusted ? 'hsl(32 95% 40%)' : MUTED }} />
        <p className="text-[13px] leading-snug" style={{ color: TEXT }}>{plainReason(check)}</p>
      </div>

      {/* the evidence: what was asked, and what the agent read */}
      {ev && (
        <div className={`grid gap-3 px-5 pb-4 ${(ev.excerpts ?? []).length ? 'md:grid-cols-2' : ''}`}>
          <section className="rounded-xl border p-3.5" style={{ borderColor: BORDER }}>
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
              <User className="h-3.5 w-3.5" /> The person asked
            </h4>
            <p className="text-[13px] leading-relaxed" style={{ color: TEXT }}>
              {ev.user_request ? `\u201c${ev.user_request}\u201d` : <span style={{ color: MUTED }}>No request was reported for this session.</span>}
            </p>
          </section>
          {(ev.excerpts ?? []).length > 0 && (
          <section className="rounded-xl border p-3.5" style={{ borderColor: BORDER }}>
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
              <FileText className="h-3.5 w-3.5" /> The agent read
            </h4>
            {(ev.excerpts ?? []).slice(0, 2).map((x: any, i: number) => (
              <div key={i} className={i ? 'mt-2.5 pt-2.5 border-t' : ''} style={{ borderColor: BORDER }}>
                {x.source && (
                  <p className="flex items-center gap-1.5 text-[11.5px] mb-1" style={{ color: MUTED }}>
                    <ToolIcon name={x.source} size={14} /> {SOURCE_LABEL[x.source] ?? x.source}
                  </p>
                )}
                <p className="text-[13px] leading-relaxed" style={{ color: TEXT }}>
                  <Excerpt text={x.text} highlight={x.highlight} truncatedBefore={x.truncated_before} truncatedAfter={x.truncated_after} />
                </p>
              </div>
            ))}
          </section>
          )}
        </div>
      )}

      {/* the call itself, readable */}
      {hasArgs && (
        <div className="px-5 pb-4">
          <ValueView value={check.arguments} highlight={highlight} />
        </div>
      )}

      <footer className="flex items-center gap-3 px-5 py-3 border-t" style={{ borderColor: BORDER, background: 'hsl(var(--secondary) / 0.5)' }}>
        <span className="text-[11.5px]" style={{ color: MUTED }}>
          The agent is paused until you decide{highlight.length > 0 ? ' \u00b7 highlighted values came only from what it read' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onDecide('block')}
            disabled={!!loading || isExiting}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 h-8.5 rounded-lg border transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-40"
            style={{ borderColor: BORDER, color: TEXT, background: 'hsl(var(--card))' }}
          >
            <XCircle className="h-4 w-4" />
            {loading === 'blocking' ? 'Blocking\u2026' : 'Block'}
          </button>
          <button
            onClick={() => {
              if (requiresPasskey && onTriggerPasskey) {
                onTriggerPasskey()
              } else {
                onDecide('allow')
              }
            }}
            disabled={!!loading || isExiting}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 h-8.5 rounded-lg transition-opacity hover:opacity-85 disabled:opacity-40 shadow-sm"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            <CheckCircle className="h-4 w-4" />
            {loading === 'allowing' ? 'Allowing\u2026' : requiresPasskey ? 'Passkey Verify' : 'Allow once'}
          </button>
        </div>
      </footer>
    </article>
  )
}
