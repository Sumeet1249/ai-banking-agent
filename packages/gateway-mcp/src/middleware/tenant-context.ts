/**
 * Tenant Context Middleware & Execution Boundary
 *
 * Implements Phase 7.2 Multi-Tenancy & Tenant Isolation:
 *   - Extracts and verifies tenant identifier (`X-Tenant-Id` or `X-Org-Id`)
 *   - Anti-spoofing defense: rejects cross-tenant spoofing when authenticated session belongs to a different tenant
 *   - Propagates tenant context across async call chains via AsyncLocalStorage
 *   - Enforces valid tenant formatting to prevent SQL injection or header manipulation
 */

import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import type { Logger } from 'pino';

export const DEFAULT_TENANT_ID = 'org_default';

const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export interface TenantContext {
  tenantId: string;
  source: 'HEADER' | 'SESSION' | 'DEFAULT';
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Returns the current ambient tenant ID for the executing async context,
 * falling back to DEFAULT_TENANT_ID if outside a scoped context.
 */
export function getCurrentTenantId(): string {
  const ctx = tenantStorage.getStore();
  return ctx ? ctx.tenantId : DEFAULT_TENANT_ID;
}

/**
 * Executes a function within an explicit tenant isolation context.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T | Promise<T>): Promise<T> {
  const normalized = normalizeTenantId(tenantId);
  return Promise.resolve(
    tenantStorage.run({ tenantId: normalized, source: 'SESSION' }, () => fn()),
  );
}

/**
 * Validates and normalizes tenant identifier.
 */
export function normalizeTenantId(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return DEFAULT_TENANT_ID;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_TENANT_ID;
  if (!TENANT_ID_PATTERN.test(trimmed)) {
    throw new Error(`Invalid tenant ID format: "${trimmed}". Must match ${TENANT_ID_PATTERN}`);
  }
  return trimmed;
}

/**
 * Express middleware that resolves and verifies tenant boundary for inbound requests.
 */
export function tenantContextMiddleware(logger?: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const headerTenantRaw = (req.headers['x-tenant-id'] || req.headers['x-org-id']) as string | undefined;

      // Validate header format if provided
      let headerTenant: string | null = null;
      if (headerTenantRaw) {
        if (!TENANT_ID_PATTERN.test(headerTenantRaw.trim())) {
          res.status(400).json({
            error: 'Invalid tenant identifier in request headers',
            reason_code: 'INVALID_TENANT_ID',
            provided: headerTenantRaw,
            pattern: '^[a-zA-Z0-9_-]{1,64}$',
            timestamp: Date.now(),
          });
          return;
        }
        headerTenant = headerTenantRaw.trim();
      }

      // Check for authenticated customer session or user session
      const sessionTenant = (req as any).customerSession?.org_id || (req as any).sessionUser?.org_id;

      // Anti-spoofing check: If an authenticated session exists with an org_id,
      // and caller passed a conflicting X-Tenant-Id header, reject immediately.
      if (sessionTenant && headerTenant && sessionTenant !== headerTenant) {
        logger?.warn({
          event: 'CROSS_TENANT_SPOOF_DETECTED',
          session_tenant: sessionTenant,
          header_tenant: headerTenant,
          ip: req.ip,
          path: req.path,
        }, 'Cross-tenant spoofing attempt rejected');

        res.status(403).json({
          error: 'Cross-tenant access violation: session tenant does not match requested tenant',
          reason_code: 'TENANT_MISMATCH',
          session_tenant: sessionTenant,
          requested_tenant: headerTenant,
          timestamp: Date.now(),
        });
        return;
      }

      // Resolved tenant priority: explicit session tenant > explicit header tenant > default
      const resolvedTenant = sessionTenant || headerTenant || DEFAULT_TENANT_ID;
      const source: TenantContext['source'] = sessionTenant ? 'SESSION' : headerTenant ? 'HEADER' : 'DEFAULT';

      req.orgId = resolvedTenant;
      res.setHeader('X-Tenant-ID', resolvedTenant);

      // Run remainder of request inside AsyncLocalStorage
      tenantStorage.run({ tenantId: resolvedTenant, source }, () => {
        next();
      });
    } catch (err: any) {
      logger?.error({ err, path: req.path }, 'Error in tenant context middleware');
      res.status(500).json({
        error: 'Tenant resolution error',
        message: err.message,
        timestamp: Date.now(),
      });
    }
  };
}
