/**
 * Customer Authentication & Session Middleware
 *
 * Implements Rule E5 (Namespace Isolation) and Rule E6 (Demo Fixture Isolation):
 *   - /api/customer/* requires a valid Customer PIN Session + CSRF token
 *   - Agent credentials explicitly return HTTP 401
 *   - CSRF protection on all state-mutating requests
 */

import { Request, Response, NextFunction } from 'express';
import { BankingStores, CustomerRow, CustomerSessionRow } from '../db/banking-stores';
import type { Logger } from 'pino';

export interface AuthenticatedCustomerRequest extends Request {
  customer?: CustomerRow;
  customerSession?: CustomerSessionRow;
}

export class CustomerAuthService {
  constructor(
    private stores: BankingStores,
    private logger?: Logger,
  ) {}

  /**
   * Express middleware enforcing customer session authentication and CSRF protection.
   */
  public requireCustomerAuth = (req: AuthenticatedCustomerRequest, res: Response, next: NextFunction): void => {
    // Rule E5: Reject agent signatures or API keys attempting to access customer namespace
    if (req.headers['x-agent-signature'] || req.headers['x-api-key']) {
      res.status(401).json({
        error: 'Cross-namespace credentials rejected on customer endpoint',
        reason_code: 'CROSS_NAMESPACE_AUTH_REJECTED',
        timestamp: Date.now(),
      });
      return;
    }

    const token = this.extractSessionToken(req);
    if (!token) {
      res.status(401).json({
        error: 'Customer session required. Please authenticate at /api/customer/login',
        reason_code: 'CUSTOMER_SESSION_REQUIRED',
        timestamp: Date.now(),
      });
      return;
    }

    const sessionData = this.stores.getCustomerSession(token);
    if (!sessionData) {
      res.status(401).json({
        error: 'Invalid or expired customer session',
        reason_code: 'CUSTOMER_SESSION_EXPIRED',
        timestamp: Date.now(),
      });
      return;
    }

    // CSRF check on state-mutating methods (POST, PUT, PATCH, DELETE)
    const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    if (mutatingMethods.has(req.method.toUpperCase())) {
      const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
      if (!csrfHeader || csrfHeader !== sessionData.session.csrf_token) {
        res.status(403).json({
          error: 'CSRF token missing or mismatched',
          reason_code: 'CSRF_VALIDATION_FAILED',
          timestamp: Date.now(),
        });
        return;
      }
    }

    req.customer = sessionData.customer;
    req.customerSession = sessionData.session;
    next();
  };

  /**
   * Extracts session token from Cookie header or Authorization Bearer header.
   */
  public extractSessionToken(req: Request): string | null {
    // 1. Try Cookie header
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)session_token=([^;]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    // 2. Try Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }

    return null;
  }
}
