'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Clock,
  AlertTriangle,
  Building2,
  Bot,
  ExternalLink,
  ShieldX,
  FileCheck2,
  Database,
} from 'lucide-react'
import { friendlyAgent } from '@/lib/friendly-names'
import { cn } from '@/lib/utils'

export interface AgentBlockHistoryItem {
  block_id: string
  agent_id: string
  tenant_id: string
  customer_ref: string
  category_id: string
  amount_paise: number
  merchant_name: string
  reason: string
  violations: string
  timestamp: number
}

function formatPaiseToInr(paise: number): string {
  if (isNaN(paise) || paise === null || paise === undefined) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100)
}

function formatTimestamp(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

const REASON_LABELS: Record<string, { label: string; description: string; tone: string }> = {
  CATEGORY_BLOCKED_FOR_AGENT: {
    label: 'Category Forbidden by Mandate',
    description: 'Agent attempted transaction in an unauthorized category explicitly blocked by sovereign policy.',
    tone: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
  },
  EXCEEDS_DAILY_LIMIT: {
    label: 'Daily Ceiling Exceeded',
    description: 'Transaction exceeds remaining Asia/Kolkata daily budget limit allocated to this agent pool.',
    tone: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  },
  MERCHANT_BLOCKED_BY_POLICY: {
    label: 'Blacklisted Merchant / MCC Mismatch',
    description: 'Counterparty was intercepted by Merchant Intelligence: sanctioned entity or fraudulent MCC.',
    tone: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  },
  EXCEEDS_AGENT_PER_TRANSACTION_LIMIT: {
    label: 'Per-Transaction Cap Exceeded',
    description: 'Requested payment amount is larger than the single-transaction ceiling allowed for this sub-agent.',
    tone: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  },
  MANUAL_ONLY_RESTRICTION: {
    label: 'Autonomous Payments Prohibited',
    description: 'Category pool is set to MANUAL_ONLY standing; agent autonomous actions are strictly blocked.',
    tone: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
}

export function AgentBlockHistoryView() {
  const [search, setSearch] = useState('')
  const [agentFilter, setAgentFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedBlock, setSelectedBlock] = useState<AgentBlockHistoryItem | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery<{ block_history: AgentBlockHistoryItem[] }>({
    queryKey: ['agents-block-history'],
    queryFn: async () => {
      const res = await fetch('/api/bank-gate/agents/block-history')
      if (!res.ok) throw new Error('Failed to fetch block history')
      return res.json()
    },
    refetchInterval: 5000,
  })

  const history = data?.block_history || []

  // Extract distinct agents & categories for filter dropdowns
  const distinctAgents = useMemo(() => {
    const set = new Set<string>()
    history.forEach((h) => set.add(h.agent_id))
    return Array.from(set)
  }, [history])

  const distinctCategories = useMemo(() => {
    const set = new Set<string>()
    history.forEach((h) => set.add(h.category_id))
    return Array.from(set)
  }, [history])

  // Summary Metrics
  const metrics = useMemo(() => {
    let categoryBlocks = 0
    let dailyLimitBlocks = 0
    let merchantBlocks = 0
    let perTxBlocks = 0
    let totalValuePaise = 0

    history.forEach((h) => {
      totalValuePaise += h.amount_paise || 0
      if (h.reason === 'CATEGORY_BLOCKED_FOR_AGENT') categoryBlocks++
      else if (h.reason === 'EXCEEDS_DAILY_LIMIT') dailyLimitBlocks++
      else if (h.reason === 'MERCHANT_BLOCKED_BY_POLICY') merchantBlocks++
      else if (h.reason === 'EXCEEDS_AGENT_PER_TRANSACTION_LIMIT') perTxBlocks++
    })

    return {
      total: history.length,
      categoryBlocks,
      dailyLimitBlocks,
      merchantBlocks,
      perTxBlocks,
      totalValuePaise,
    }
  }, [history])

  // Filtered rows
  const filteredRows = useMemo(() => {
    return history.filter((item) => {
      if (agentFilter !== 'all' && item.agent_id !== agentFilter) return false
      if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const matchAgent = item.agent_id.toLowerCase().includes(q)
        const matchMerchant = (item.merchant_name || '').toLowerCase().includes(q)
        const matchReason = item.reason.toLowerCase().includes(q)
        const matchViolations = item.violations.toLowerCase().includes(q)
        const matchCategory = item.category_id.toLowerCase().includes(q)
        if (!matchAgent && !matchMerchant && !matchReason && !matchViolations && !matchCategory) {
          return false
        }
      }
      return true
    })
  }, [history, agentFilter, categoryFilter, search])

  return (
    <div className="space-y-6 text-foreground">
      {/* ── METRICS TILES ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Interceptions */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Interceptions</span>
            <Ban className="h-4 w-4 text-rose-500" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums">
              {metrics.total}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              ({formatPaiseToInr(metrics.totalValuePaise)} protected)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Persisted in separate tamper-evident audit ledger (<code className="font-mono text-emerald-400">audit_ledger.db</code>).
          </p>
        </div>

        {/* Category Violations */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Category Forbidden</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-rose-500 tabular-nums">
              {metrics.categoryBlocks}
            </span>
            <span className="text-xs text-muted-foreground font-mono">attempts</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Blocked before behavioral LLM analysis under strict Invariant I2.
          </p>
        </div>

        {/* Daily Exposure Ceilings */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Budget Ceiling Exceeded</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-amber-500 tabular-nums">
              {metrics.dailyLimitBlocks + metrics.perTxBlocks}
            </span>
            <span className="text-xs text-muted-foreground font-mono">events</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Enforces multi-period capacity reservation limits across daily &amp; per-tx rules.
          </p>
        </div>

        {/* Merchant Blacklist */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Merchant Sanctions</span>
            <Building2 className="h-4 w-4 text-purple-400" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-purple-400 tabular-nums">
              {metrics.merchantBlocks}
            </span>
            <span className="text-xs text-muted-foreground font-mono">intercepted</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Tier-1 MCC classification verification with fraud blacklist protection.
          </p>
        </div>
      </div>

      {/* ── FILTER & SEARCH BAR ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2.5 rounded-xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by agent, merchant, category, or violation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>

          {/* Filter: Agent */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Agents ({distinctAgents.length})</option>
            {distinctAgents.map((ag) => (
              <option key={ag} value={ag}>
                {friendlyAgent(ag)} ({ag})
              </option>
            ))}
          </select>

          {/* Filter: Category */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Categories ({distinctCategories.length})</option>
            {distinctCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-colors inline-flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          <span>Refresh Audit Trail</span>
        </button>
      </div>

      {/* ── TABLE / LIST ── */}
      {isLoading ? (
        <div className="h-48 rounded-xl animate-pulse bg-secondary/40 border border-border" />
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-border py-14 text-center bg-card">
          <FileCheck2 className="mx-auto h-8 w-8 text-muted-foreground opacity-40" />
          <p className="mt-2 text-sm font-semibold text-foreground">No Block Events Found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search || agentFilter !== 'all' || categoryFilter !== 'all'
              ? 'Try adjusting your search criteria or filter selections.'
              : 'All autonomous agent transactions are operating within authorized limits.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-border">
              <thead className="bg-secondary/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10.5px]">
                <tr>
                  <th className="py-3 px-4">Timestamp (IST)</th>
                  <th className="py-3 px-4">Agent Identity</th>
                  <th className="py-3 px-4 text-right">Attempted Amount</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Target Counterparty</th>
                  <th className="py-3 px-4">Block Reason</th>
                  <th className="py-3 px-4">Policy Enforcement Violations</th>
                  <th className="py-3 px-4 text-right">Audit Block ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {filteredRows.map((item) => {
                  let parsedViolations: string[] = []
                  try {
                    parsedViolations = JSON.parse(item.violations)
                  } catch {
                    parsedViolations = [item.violations]
                  }

                  const reasonInfo = REASON_LABELS[item.reason] || {
                    label: item.reason,
                    description: 'Policy invariant violation.',
                    tone: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
                  }

                  return (
                    <tr
                      key={item.block_id}
                      className="hover:bg-secondary/30 transition-colors cursor-pointer group"
                      onClick={() => setSelectedBlock(item)}
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>{formatTimestamp(item.timestamp)}</span>
                        </div>
                      </td>

                      {/* Agent */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
                            <Bot className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="font-sans font-bold text-foreground block leading-tight group-hover:text-indigo-400 transition-colors">
                              {friendlyAgent(item.agent_id)}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono block">
                              {item.agent_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <span className="font-bold text-rose-500 text-[13px] tabular-nums">
                          {formatPaiseToInr(item.amount_paise)}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-secondary text-foreground border border-border">
                          {item.category_id}
                        </span>
                      </td>

                      {/* Merchant */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-sans font-medium text-foreground text-[12px]">
                          {item.merchant_name || 'Direct / P2P'}
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10.5px] font-semibold border inline-flex items-center gap-1',
                            reasonInfo.tone
                          )}
                        >
                          <Ban className="h-3 w-3 shrink-0" />
                          <span>{reasonInfo.label}</span>
                        </span>
                      </td>

                      {/* Violations */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-sans text-[11px] text-muted-foreground truncate" title={parsedViolations.join('; ')}>
                          {parsedViolations.join('; ') || item.reason}
                        </div>
                      </td>

                      {/* Audit Block ID */}
                      <td className="py-3 px-4 whitespace-nowrap text-right text-muted-foreground text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-secondary/80 border border-border">
                          {item.block_id}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl p-5 space-y-4 bg-card border border-border shadow-2xl text-foreground">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500">
                  <ShieldX className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Security Interception Record</h3>
                  <p className="text-[11px] text-muted-foreground font-mono">{selectedBlock.block_id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-secondary/40 border border-border">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Attempted Amount</span>
                  <span className="text-base font-bold text-rose-500 font-mono">
                    {formatPaiseToInr(selectedBlock.amount_paise)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Time of Interception</span>
                  <span className="font-medium text-foreground">
                    {formatTimestamp(selectedBlock.timestamp)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Agent</span>
                  <span className="font-bold text-foreground">
                    {friendlyAgent(selectedBlock.agent_id)} ({selectedBlock.agent_id})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Category</span>
                  <span className="font-semibold text-foreground">{selectedBlock.category_id}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Target Merchant</span>
                  <span className="font-medium text-foreground">{selectedBlock.merchant_name}</span>
                </div>
              </div>

              <div className="space-y-1.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
                <span className="font-bold block text-xs text-rose-400">Enforcement Policy Violation:</span>
                <p className="text-xs leading-relaxed">
                  {(() => {
                    try {
                      return JSON.parse(selectedBlock.violations).join('; ')
                    } catch {
                      return selectedBlock.violations
                    }
                  })()}
                </p>
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30 border border-border text-[11px] text-muted-foreground font-mono">
                <Database className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Persisted in isolated audit ledger: <code className="text-emerald-400">audit_ledger.db</code></span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-xs px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
