import { NextRequest } from 'next/server'
import { serverAgentStore, StoreEvent } from '@/lib/server-agent-store'

const GATEWAY = process.env['GATEWAY_URL'] || 'http://localhost:8080'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()
  const { searchParams } = new URL(request.url)
  let lastTimestamp: string | null = null
  // Client passes its last-seen alert timestamp so we don't replay on refresh
  let lastEventTimestamp: string | null = searchParams.get('alertSince') ?? new Date().toISOString()
  let closed = false
  let unsubscribeStore: (() => void) | null = null

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'))

      // Real-time agent & mandate event propagation across all connected clients
      unsubscribeStore = serverAgentStore.subscribe((event: StoreEvent) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`event: agent_update\ndata: ${JSON.stringify(event)}\n\n`)
          )
        } catch {
          // Stream controller may be closed
        }
      })

      const poll = async () => {
        if (closed) return

        // ── Trace feed ─────────────────────────────────────────────────────
        try {
          const url = lastTimestamp
            ? `${GATEWAY}/api/v1/traces?limit=20&since=${encodeURIComponent(lastTimestamp)}`
            : `${GATEWAY}/api/v1/traces?limit=20`

          const res = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(1500),
          })
          if (res.ok) {
            const data = await res.json()
            const traces: any[] = data.traces || []
            if (traces.length > 0) {
              const newest = traces[0]
              if (newest?.timestamp) lastTimestamp = newest.timestamp
              controller.enqueue(
                encoder.encode(`event: traces\ndata: ${JSON.stringify({ traces })}\n\n`)
              )
            }
          }
      } catch {
        /* gateway unavailable — local store active */
      }

      // ── Block/pending alert feed ────────────────────────────────────────
      try {
        const alertUrl = lastEventTimestamp
          ? `${GATEWAY}/api/v1/check/events?since=${encodeURIComponent(lastEventTimestamp)}`
          : `${GATEWAY}/api/v1/check/events`

        const res = await fetch(alertUrl, {
          cache: 'no-store',
          signal: AbortSignal.timeout(1500),
        })
        if (res.ok) {
          const data = await res.json()
          const events: any[] = data.events || []
          if (events.length > 0) {
            lastEventTimestamp = events[events.length - 1].timestamp
            for (const evt of events) {
              controller.enqueue(
                encoder.encode(`event: alert\ndata: ${JSON.stringify(evt)}\n\n`)
              )
            }
          }
        }
    } catch {
      /* gateway unavailable */
    }

        // Periodic heartbeat
        if(!closed) {
      try {
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      } catch { }
      setTimeout(poll, 2500)
    }
  }

      setTimeout(poll, 400)
    },
cancel() {
  closed = true
  if (unsubscribeStore) {
    unsubscribeStore()
    unsubscribeStore = null
  }
},
  })

return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  },
})
}
