'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RunTimeline } from './run-timeline'
import { TracesList } from './traces-list'
import { TraceDetails } from './trace-details'
import { DecisionGraph } from './decision-graph'
import { TimeTravel } from './time-travel'
import { useAlerts } from '@/hooks/useAlerts'
import { AgentCompare } from './agent-compare'
import { FileDown, RefreshCw, Zap, Play, Pause, Radio, CheckCircle2, ShieldAlert } from 'lucide-react'
import { USE_MOCK, mockTraces } from '@/lib/mock-traces'
import { TraceSearchBar } from './trace-search-bar'
import { parseMaybeJson } from '@/lib/safe-format'
import { toast } from 'sonner'

export function TracesView() {
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [isLiveStream, setIsLiveStream] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [searchResults, setSearchResults] = useState<{ traces: any[]; total: number } | null>(null)

  async function handleExport(allTraces: any[]) {
    setExporting(true)
    try {
      const { exportComplianceReport } = await import('@/lib/export-pdf')
      await exportComplianceReport({ traces: allTraces, generatedAt: new Date() })
    } finally {
      setExporting(false)
    }
  }

  function handleExportCsv(allTraces: any[]) {
    const rows = allTraces.map(t => {
      const tool = parseMaybeJson<{ tool_name?: string; name?: string }>(t.tool_call)
      const safe = parseMaybeJson<{ risk_level?: string; passed?: boolean; decision?: string }>(t.safety_validation)
      const toolName = tool?.tool_name ?? tool?.name ?? ''
      return [
        t.trace_id ?? '', t.agent_id ?? '', t.timestamp ?? '', t.environment ?? '',
        toolName, safe?.risk_level ?? '', safe?.passed ? 'pass' : 'fail',
        t.blocked ? 'blocked' : '', t.session_id ?? '', t.model ?? '',
        t.cost_usd ?? 0, t.pii_detected ? 'yes' : 'no',
        t.anomaly_score ?? 0,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })
    const csv = [
      'trace_id,agent_id,timestamp,environment,tool_name,risk_level,result,blocked,session_id,model,cost_usd,pii,anomaly_score',
      ...rows,
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `aegis-traces-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Live Gateway Query
  const { data: traces, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['traces', selectedAgent],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedAgent) params.append('agent_id', selectedAgent)
      params.append('limit', '100')

      const response = await fetch(`/api/gateway/traces?${params}`)
      if (!response.ok) throw new Error('Failed to fetch traces')
      return response.json()
    },
    refetchInterval: isLiveStream ? 3500 : false,
    refetchOnWindowFocus: true,
  })

  async function handleGenerateActivity() {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/gateway/seed', { method: 'POST' })
      if (!res.ok) throw new Error(`Gateway returned status ${res.status}`)
      const data = await res.json()
      toast.success('Live Activity Seeded', {
        description: `Ingested ${data.traces_created || 80} verified agent actions into Gateway telemetry store.`,
      })
      await refetch()
    } catch (err: any) {
      toast.error('Failed to generate activity', { description: err.message })
    } finally {
      setIsGenerating(false)
    }
  }

  // Determine whether we have live data from the Gateway
  const hasLiveTraces = Boolean(traces?.traces && traces.traces.length > 0)
  
  // Real traces take priority; fall back to mockTraces only if Gateway is unreachable / empty
  const defaultTraces = hasLiveTraces
    ? traces
    : { traces: selectedAgent ? mockTraces().filter((t: any) => t.agent_id === selectedAgent) : mockTraces() }

  const effectiveTraces = searchResults ?? defaultTraces
  const totalCount = effectiveTraces?.total ?? effectiveTraces?.traces?.length ?? 0
  const latestTrace = effectiveTraces?.traces?.[0]

  useAlerts(effectiveTraces?.traces || [])

  return (
    <div className="space-y-6">
      {/* Header and Live Status Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Activity Traces</h1>
            {hasLiveTraces ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE GATEWAY FEED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                SIMULATED DATA
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[14.5px] max-w-[68ch] text-muted-foreground">
            Cryptographically sealed event stream from Gateway (:8081). Real-time telemetry, SHA-256 integrity chains, and policy decisions.
          </p>
        </div>

        {/* Live Controls & Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Live Stream Polling Toggle */}
          <button
            onClick={() => setIsLiveStream(!isLiveStream)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-all ${
              isLiveStream
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-card border-border text-muted-foreground hover:bg-secondary'
            }`}
            title={isLiveStream ? 'Auto-refresh active (every 3.5s)' : 'Auto-refresh paused'}
          >
            {isLiveStream ? <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" /> : <Pause className="h-3.5 w-3.5" />}
            {isLiveStream ? 'Live Stream: 3.5s' : 'Live Stream: Paused'}
          </button>

          {/* Instant Refresh */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-secondary font-medium transition-colors"
            title="Force refresh now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>

          {/* Seed Real Activity */}
          <button
            onClick={handleGenerateActivity}
            disabled={isGenerating}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-sm hover:shadow disabled:opacity-50"
            title="Inject real agent telemetry events into Gateway DB"
          >
            <Zap className={`h-3.5 w-3.5 ${isGenerating ? 'animate-bounce' : ''}`} />
            {isGenerating ? 'Injecting…' : 'Generate Activity'}
          </button>

          {/* Export Buttons */}
          <button
            onClick={() => handleExportCsv(effectiveTraces?.traces || [])}
            disabled={!effectiveTraces?.traces?.length}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-secondary font-medium transition-colors disabled:opacity-40"
          >
            <FileDown className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={() => handleExport(effectiveTraces?.traces || [])}
            disabled={exporting || !effectiveTraces?.traces?.length}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-secondary font-medium transition-colors disabled:opacity-40"
          >
            <FileDown className="h-3.5 w-3.5" />
            {exporting ? 'Exporting…' : 'PDF Report'}
          </button>
        </div>
      </div>

      {/* Real-time Telemetry Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-border bg-card/60 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Gateway Target:</span>
            <span className="font-mono font-medium text-foreground">http://localhost:8081</span>
          </div>
          <div className="h-3 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total Ingested:</span>
            <span className="font-semibold text-foreground">{totalCount} Traces</span>
          </div>
          <div className="h-3 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Status:</span>
            <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Synchronized
            </span>
          </div>
        </div>
        {latestTrace && (
          <div className="text-muted-foreground font-mono truncate max-w-xs">
            Latest: {new Date(latestTrace.timestamp).toLocaleTimeString()} · {latestTrace.tool_call?.tool_name || 'action'}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="list">All actions ({totalCount})</TabsTrigger>
          <TabsTrigger value="graph">Decision Graph</TabsTrigger>
          <TabsTrigger value="timetravel">Time Travel</TabsTrigger>
          <TabsTrigger value="compare">Agent Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-4">
          <RunTimeline />
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          <TraceSearchBar onResults={setSearchResults} />
          <div className="grid gap-4 md:grid-cols-12">
            {/* Mobile: hide the list while a trace is selected — the
                details panel takes the whole width. On md+ they sit
                side-by-side. */}
            <div className={`md:col-span-5 ${selectedTrace ? 'hidden md:block' : ''}`}>
              <TracesList
                traces={effectiveTraces?.traces || []}
                selectedTrace={selectedTrace}
                onSelectTrace={setSelectedTrace}
                onSelectAgent={setSelectedAgent}
              />
            </div>
            <div className={`md:col-span-7 ${selectedTrace ? '' : 'hidden md:block'}`}>
              {selectedTrace && (
                <div className="md:hidden mb-2">
                  <button
                    onClick={() => setSelectedTrace(null)}
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground"
                  >
                    ← Back to list
                  </button>
                </div>
              )}
              {selectedTrace && (
                <TraceDetails
                  traceId={selectedTrace}
                  onExport={() => handleExport([effectiveTraces?.traces?.find((t: any) => t.trace_id === selectedTrace)])}
                  onSelectTrace={setSelectedTrace}
                />
              )}
              {!selectedTrace && (
                <div
                  className="hidden md:flex h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed text-center px-8"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  <div className="max-w-xs space-y-1">
                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Select a trace</p>
                    <p className="text-xs">
                      The decision, the facts each layer produced, the arguments as the agent emitted them, and the session context open here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="graph" className="space-y-4">
          <DecisionGraph
            agentId={selectedAgent}
            traces={effectiveTraces?.traces || []}
          />
        </TabsContent>

        <TabsContent value="timetravel" className="space-y-4">
          <TimeTravel
            traces={effectiveTraces?.traces || []}
            selectedAgent={selectedAgent}
          />
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <AgentCompare traces={effectiveTraces?.traces || []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
