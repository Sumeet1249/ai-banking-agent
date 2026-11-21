'use client'

import React from 'react'
import { Globe, FileText, Database, Send, Zap, CheckCircle, AlertCircle, ArrowDown } from 'lucide-react'
import { extractNodePayloadEntries } from '@/lib/safe-format'

const TOOL_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  web_search:   { icon: Globe,     color: 'hsl(var(--brand))', label: 'Web Search'   },
  read_file:    { icon: FileText,  color: 'hsl(var(--brand))', label: 'Read File'    },
  execute_sql:  { icon: Database,  color: 'hsl(var(--brand))', label: 'SQL Query'    },
  send_request: { icon: Send,      color: 'hsl(var(--status-ok))', label: 'HTTP Request' },
}

function getToolMeta(name: string) {
  return TOOL_META[name] || { icon: Zap, color: 'hsl(var(--brand))', label: name }
}

function NodePayloadBadges({ label, payload }: { label: string; payload: unknown }) {
  const entries = extractNodePayloadEntries(payload, 3)
  if (entries.length === 0) return null

  return (
    <div className="mt-1 space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {entries.map((entry) => (
          <span
            key={entry.key}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-secondary/70 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
            title={`${entry.key}: ${entry.value}`}
          >
            <span className="text-muted-foreground">{entry.key}:</span>
            <span className="truncate max-w-[160px]">{entry.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

interface DecisionGraphProps {
  agentId: string | null
  traces: any[]
}

export function DecisionGraph({ agentId, traces }: DecisionGraphProps) {
  const sorted = [...traces].sort((a, b) => {
    const seqA = a.sequence_number ?? 0
    const seqB = b.sequence_number ?? 0
    if (seqA !== seqB) return seqA - seqB
    return String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
  })

  if (sorted.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg h-64 text-sm bg-secondary text-muted-foreground"
      >
        Select a trace session to view execution flow
      </div>
    )
  }

  return (
    <div
      className="rounded-lg border border-border bg-secondary/50 overflow-y-auto p-6"
      style={{
        maxHeight: 'calc(100vh - 280px)',
      }}
    >
      <div className="flex flex-col items-center gap-0">
        {/* Start node */}
        <div
          className="px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase mb-0 bg-secondary border border-border text-foreground"
        >
          Agent Session
        </div>

        {sorted.map((trace, i) => {
          const meta   = getToolMeta(trace.tool_call?.tool_name || '')
          const Icon   = meta.icon
          const hasErr = !!trace.observation?.error
          const dur    = trace.observation?.duration_ms
          const inputPayload = trace.input_context?.prompt ?? trace.input_context ?? trace.tool_call?.args
          const outputPayload = trace.observation?.raw_output ?? trace.observation?.result ?? trace.observation

          return (
            <div key={trace.trace_id} className="flex flex-col items-center w-full max-w-xl">
              {/* Arrow */}
              <div className="flex flex-col items-center py-1">
                <div className="w-px h-4 bg-border" />
                <ArrowDown className="h-3 w-3 -mt-0.5 text-muted-foreground/60" />
              </div>

              {/* Step card */}
              <div
                className={`w-full rounded-lg border p-4 relative bg-card ${
                  hasErr ? 'border-[hsl(var(--danger-border))]' : 'border-border'
                }`}
              >
                {/* Step number */}
                <span
                  className="absolute -top-2.5 left-4 text-[10px] font-bold px-1.5 py-0.5 rounded bg-card text-muted-foreground border border-border"
                >
                  STEP {i + 1}
                </span>

                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className="mt-0.5 p-2 rounded-md flex-shrink-0 bg-primary/10 text-primary"
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {meta.label}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {dur !== undefined && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {dur < 1 ? '<1ms' : `${Math.round(dur)}ms`}
                          </span>
                        )}
                        {hasErr
                          ? <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--status-drift))]" />
                          : <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-ok))]" />
                        }
                      </div>
                    </div>

                    {/* Input */}
                    <div>
                      <NodePayloadBadges label="Input" payload={inputPayload} />
                    </div>

                    {/* Output */}
                    <div>
                      {hasErr ? (
                        <div className="mt-1">
                          <span className="text-[10px] uppercase tracking-wider font-medium text-[hsl(var(--danger-fg))]">
                            Error
                          </span>
                          <p className="text-xs mt-0.5 break-all text-[hsl(var(--danger-fg))] bg-[hsl(var(--danger-bg))] p-2 rounded border border-[hsl(var(--danger-border))]">
                            {String(trace.observation.error)}
                          </p>
                        </div>
                      ) : (
                        <NodePayloadBadges label="Output" payload={outputPayload} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* End arrow */}
        <div className="flex flex-col items-center py-1">
          <div className="w-px h-4 bg-border" />
          <ArrowDown className="h-3 w-3 -mt-0.5 text-muted-foreground/60" />
        </div>

        {/* End node */}
        <div
          className="px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase bg-[hsl(var(--status-ok)/0.12)] text-[hsl(var(--status-ok))] border border-[hsl(var(--status-ok)/0.3)]"
        >
          Complete — {sorted.length} steps
        </div>
      </div>
    </div>
  )
}
