import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ServiceCheck {
  id: string;
  name: string;
  port: number;
  url: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  latencyMs: number;
  version?: string;
}

export async function GET() {
  const gatewayUrl = process.env['GATEWAY_URL'] || 'http://localhost:8081';
  const trustEngineUrl = process.env['TRUST_ENGINE_URL'] || 'http://localhost:4006';
  const bankGateUrl = process.env['BANK_GATE_URL'] || 'http://localhost:4000';
  const witnessUrl = process.env['WITNESS_URL'] || 'http://localhost:5000';
  const marketMcpUrl = process.env['MARKET_MCP_URL'] || 'http://localhost:4004';

  const targets = [
    { id: 'gateway', name: 'Gateway MCP', port: 8081, url: `${gatewayUrl}/health` },
    { id: 'trust-engine', name: 'Trust Engine', port: 4006, url: `${trustEngineUrl}/health` },
    { id: 'bank-gate', name: 'Bank Gate', port: 4000, url: `${bankGateUrl}/health` },
    { id: 'witness', name: 'Witness Ledger', port: 5000, url: `${witnessUrl}/health` },
    { id: 'market-mcp', name: 'Market Data MCP', port: 4004, url: `${marketMcpUrl}/health` },
  ];

  const checks: ServiceCheck[] = await Promise.all(
    targets.map(async (target) => {
      const start = performance.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(target.url, {
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeout);
        const latency = Math.round(performance.now() - start);

        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          return {
            id: target.id,
            name: target.name,
            port: target.port,
            url: target.url,
            status: 'ONLINE',
            latencyMs: latency,
            version: body?.version || '1.0.0',
          };
        }
        return {
          id: target.id,
          name: target.name,
          port: target.port,
          url: target.url,
          status: 'DEGRADED',
          latencyMs: latency,
        };
      } catch {
        return {
          id: target.id,
          name: target.name,
          port: target.port,
          url: target.url,
          status: 'OFFLINE',
          latencyMs: Math.round(performance.now() - start),
        };
      }
    })
  );

  // Self check (Cockpit UI)
  checks.push({
    id: 'cockpit-ui',
    name: 'Compliance Cockpit',
    port: 13003,
    url: 'http://localhost:13003/',
    status: 'ONLINE',
    latencyMs: 1,
    version: '1.0.0',
  });

  const onlineCount = checks.filter((c) => c.status === 'ONLINE').length;
  const overall = onlineCount === checks.length ? 'HEALTHY' : onlineCount > 3 ? 'DEGRADED' : 'CRITICAL';

  return NextResponse.json({
    overall_status: overall,
    services_online: onlineCount,
    services_total: checks.length,
    timestamp: Date.now(),
    services: checks,
  });
}
