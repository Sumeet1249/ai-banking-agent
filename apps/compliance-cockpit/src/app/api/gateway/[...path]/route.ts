import { NextRequest, NextResponse } from 'next/server'
import { serverAgentStore } from '@/lib/server-agent-store'
import { mockTraces } from '@/lib/mock-traces'

const BASE = process.env['GATEWAY_URL'] || 'http://localhost:8080'

// Demo mode: when this is a public-facing demo build without a real
// gateway behind it, short-circuit gateway-proxy calls with sensible
// empty responses so the UI renders "no data" states cleanly instead
// of red banners + toasts. Set by build env in the Vercel demo deploy.
const DEMO_MODE =
  process.env['NEXT_PUBLIC_DEMO_MODE'] === 'true' ||
  process.env['DEMO_MODE'] === 'true';

/**
 * Best-effort empty-shape reply for known gateway endpoints.
 */
function demoEmptyShape(path: string): unknown {
  if (path === 'traces' || path.startsWith('traces?')) return { traces: mockTraces(), total: mockTraces().length };
  if (path === 'agents' || path.startsWith('agents?')) return { items: serverAgentStore.listAgents() };
  if (path.startsWith('policies')) return [];
  if (path.startsWith('violations')) return { violations: [] };
  if (path.startsWith('approvals')) return { approvals: [] };
  if (path.startsWith('stats')) return {};
  if (path.startsWith('sessions')) return { sessions: [] };
  if (path.startsWith('audit-log')) return { items: [] };
  if (path.startsWith('compliance')) return { rows: [], mappings: [] };
  if (path.startsWith('rollbacks')) return { items: [] };
  if (path.startsWith('coverage')) return { agents: [], rules: [] };
  if (path === 'config/templates') return { templates: [] };
  if (path === 'config' || path.startsWith('config?')) return {
    deploymentMode: 'demo',
    layers: {
      l1: { enabled: true, threshold: 0.3 },
      l2: { enabled: true, threshold: 0.5 },
      l3: { enabled: false, threshold: 0.7 },
    },
    retention: { days: 30, enforcePII: true },
    thresholds: { anomalyScore: 0.6, pendingTimeoutSec: 600 },
  };
  if (path === 'health' || path.startsWith('health?')) return { ok: true, uptime_seconds: 0 };
  if (path === 'auth/key') return { api_key: 'demo-mode-no-real-key' };
  return {};
}

// Server-side key cache — resolved once, reused for all requests
let _cachedKey: string | null = null
let _lastGatewayCheck = 0
let _isGatewayAlive = false

async function checkGatewayAlive(): Promise<boolean> {
  const now = Date.now()
  if (now - _lastGatewayCheck < 10000) {
    return _isGatewayAlive
  }
  _lastGatewayCheck = now
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(300),
      cache: 'no-store',
    })
    _isGatewayAlive = res.ok
  } catch {
    _isGatewayAlive = false
  }
  return _isGatewayAlive
}

async function getGatewayKey(): Promise<string> {
  if (process.env['GATEWAY_API_KEY']) return process.env['GATEWAY_API_KEY']
  if (_cachedKey) return _cachedKey
  try {
    const res = await fetch(`${BASE}/api/v1/auth/key`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(400),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.api_key) { _cachedKey = data.api_key; return _cachedKey! }
    }
  } catch { }
  return ''
}

async function gatewayHeaders(request: NextRequest): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const bearer = request.headers.get('authorization')
  if (bearer && bearer.startsWith('Bearer ')) {
    headers['authorization'] = bearer
  }
  const clientKey = request.headers.get('x-api-key')
  const key = clientKey || await getGatewayKey()
  if (key) headers['x-api-key'] = key
  return headers
}

/** Local gateway fallback providing real state persistence and mutations when external gateway is down */
function handleLocalFallback(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  searchParams: URLSearchParams,
  bodyText?: string
): NextResponse {
  try {
    if (method === 'GET') {
      if (path === 'agents' || path.startsWith('agents?')) {
        const status = searchParams.get('status') || undefined
        const includeDeprecated = searchParams.get('include_deprecated') === '1'
        const items = serverAgentStore.listAgents({ status, includeDeprecated })
        return NextResponse.json({ items, total: items.length })
      }
      if (path.startsWith('agents/')) {
        const id = path.replace('agents/', '')
        const agent = serverAgentStore.getAgent(id)
        if (agent) return NextResponse.json({ agent })
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }
      if (path === 'mandates' || path.startsWith('mandates?')) {
        return NextResponse.json({ mandates: serverAgentStore.listMandates() })
      }
      if (path.startsWith('mandates/')) {
        const id = path.replace('mandates/', '')
        const mandate = serverAgentStore.getMandate(id)
        if (mandate) return NextResponse.json({ mandate })
        return NextResponse.json({ error: 'Mandate not found' }, { status: 404 })
      }
      if (path === 'traces' || path.startsWith('traces?')) {
        const traces = mockTraces()
        return NextResponse.json({ traces, total: traces.length })
      }
      if (path === 'sessions' || path.startsWith('sessions?')) {
        return NextResponse.json({ sessions: [] })
      }
      if (path === 'health') {
        return NextResponse.json({ ok: true, local_fallback: true, uptime_seconds: process.uptime() })
      }
    }

    if (method === 'POST') {
      const parsed = bodyText ? JSON.parse(bodyText) : {}
      if (path === 'agents') {
        const res = serverAgentStore.createAgent(parsed)
        return NextResponse.json(
          { ok: true, agent: res.agent, secret: res.secret, mandate: res.mandate },
          { status: 201 }
        )
      }
      if (path.match(/^agents\/([^/]+)\/rotate-secret$/)) {
        const id = path.split('/')[1]
        const res = serverAgentStore.rotateSecret(id)
        if (res) return NextResponse.json({ ok: true, secret: res.secret })
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }
      if (path === 'mandates' || path.startsWith('mandates/')) {
        const id = path.replace('mandates/', '').replace('mandates', '') || parsed.agentId
        const updated = serverAgentStore.saveMandate(id, parsed)
        return NextResponse.json({ ok: true, mandate: updated })
      }
    }

    if (method === 'PATCH') {
      if (path.startsWith('agents/')) {
        const id = path.replace('agents/', '')
        const parsed = bodyText ? JSON.parse(bodyText) : {}
        const updated = serverAgentStore.updateAgent(id, parsed)
        if (updated) return NextResponse.json({ ok: true, agent: updated })
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }
    }

    if (method === 'PUT') {
      if (path.startsWith('mandates/')) {
        const id = path.replace('mandates/', '')
        const parsed = bodyText ? JSON.parse(bodyText) : {}
        const updated = serverAgentStore.saveMandate(id, parsed)
        return NextResponse.json({ ok: true, mandate: updated })
      }
    }

    if (method === 'DELETE') {
      if (path.startsWith('agents/')) {
        const id = path.replace('agents/', '')
        const ok = serverAgentStore.deleteAgent(id)
        if (ok) return NextResponse.json({ ok: true, id })
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json(demoEmptyShape(path), { status: 200 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const isAlive = await checkGatewayAlive()
  if (!isAlive) {
    return handleLocalFallback('GET', path, request.nextUrl.searchParams)
  }

  const search = request.nextUrl.search
  const url = `${BASE}/api/v1/${path}${search}`
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: await gatewayHeaders(request),
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok && response.status >= 500) {
      return handleLocalFallback('GET', path, request.nextUrl.searchParams)
    }
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return handleLocalFallback('GET', path, request.nextUrl.searchParams)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const body = await request.text()
  const isAlive = await checkGatewayAlive()
  if (!isAlive) {
    return handleLocalFallback('POST', path, request.nextUrl.searchParams, body)
  }

  const url = `${BASE}/api/v1/${path}`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: await gatewayHeaders(request),
      body,
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok && response.status >= 500) {
      return handleLocalFallback('POST', path, request.nextUrl.searchParams, body)
    }
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return handleLocalFallback('POST', path, request.nextUrl.searchParams, body)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const body = await request.text()
  const isAlive = await checkGatewayAlive()
  if (!isAlive) {
    return handleLocalFallback('PATCH', path, request.nextUrl.searchParams, body)
  }

  const url = `${BASE}/api/v1/${path}`
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: await gatewayHeaders(request),
      body,
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok && response.status >= 500) {
      return handleLocalFallback('PATCH', path, request.nextUrl.searchParams, body)
    }
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return handleLocalFallback('PATCH', path, request.nextUrl.searchParams, body)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const body = await request.text()
  const isAlive = await checkGatewayAlive()
  if (!isAlive) {
    return handleLocalFallback('PUT', path, request.nextUrl.searchParams, body)
  }

  const url = `${BASE}/api/v1/${path}`
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: await gatewayHeaders(request),
      body,
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok && response.status >= 500) {
      return handleLocalFallback('PUT', path, request.nextUrl.searchParams, body)
    }
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return handleLocalFallback('PUT', path, request.nextUrl.searchParams, body)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const isAlive = await checkGatewayAlive()
  if (!isAlive) {
    return handleLocalFallback('DELETE', path, request.nextUrl.searchParams)
  }

  const url = `${BASE}/api/v1/${path}`
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: await gatewayHeaders(request),
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok && response.status >= 500) {
      return handleLocalFallback('DELETE', path, request.nextUrl.searchParams)
    }
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return handleLocalFallback('DELETE', path, request.nextUrl.searchParams)
  }
}
