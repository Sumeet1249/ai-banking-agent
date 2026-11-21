import { NextRequest, NextResponse } from 'next/server'

const BANK_GATE_URL = process.env['BANK_GATE_URL'] || 'http://localhost:4000'

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/')
  const search = request.nextUrl.search
  try {
    const res = await fetch(`${BANK_GATE_URL}/api/v1/${path}${search}`, {
      headers: {
        'x-tenant-id': request.headers.get('x-tenant-id') || 'tenant-default',
        'x-customer-ref': request.headers.get('x-customer-ref') || 'cust-101',
      },
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/')
  try {
    const body = await request.json().catch(() => ({}))
    const res = await fetch(`${BANK_GATE_URL}/api/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': request.headers.get('x-tenant-id') || 'tenant-default',
        'x-customer-ref': request.headers.get('x-customer-ref') || 'cust-101',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
