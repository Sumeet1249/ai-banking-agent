/**
 * Key Management & JWKS Distribution API Handler
 *
 * Implements Phase 7.4:
 *   - GET  /api/v1/keys/jwks: RFC 7517 public JWKS endpoint for dynamic key discovery
 *   - GET  /api/v1/keys/active: Public metadata for the active permit signing key
 *   - GET  /api/v1/keys/list: Lists public metadata for all active, retired, and revoked keys
 *   - POST /api/v1/keys/rotate: Zero-downtime key rotation with grace window
 *   - POST /api/v1/keys/revoke: Emergency key revocation barrier
 */

import { Router, Request, Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { PermitEngineService } from '../services/permit-engine';
import { SoftwareKmsProvider } from '../crypto/kms-provider';

const KeyRotationRequestSchema = z.object({
  reason: z.string().min(1).max(256).default('Scheduled key rotation'),
  operator: z.string().min(1).max(128).default('security_admin'),
});

const KeyRevocationRequestSchema = z.object({
  key_id: z.string().min(1).max(128),
  reason: z.string().min(1).max(256).default('Emergency key revocation'),
  operator: z.string().min(1).max(128).default('security_admin'),
});

export class KeyManagementApi {
  private router: Router;

  constructor(
    private permitEngine: PermitEngineService,
    private logger?: Logger,
  ) {
    this.router = Router();
    this.routes();
  }

  private routes(): void {
    const kms = this.permitEngine.getKms();

    // 1. GET /api/v1/keys/jwks — RFC 7517 compliant JWKS distribution
    this.router.get('/jwks', async (req: Request, res: Response) => {
      try {
        const jwks = await kms.exportJwks('PERMIT_SIGNING');
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.status(200).json(jwks);
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'Failed to export JWKS');
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
      }
    });

    // 2. GET /api/v1/keys/active — Active signing key metadata (no private keys)
    this.router.get('/active', async (req: Request, res: Response) => {
      try {
        const active = await kms.getActiveKey('PERMIT_SIGNING');
        res.status(200).json(active);
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'Failed to fetch active key');
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
      }
    });

    // 3. GET /api/v1/keys/list — List all keys with their lifecycle status
    this.router.get('/list', async (req: Request, res: Response) => {
      try {
        const keys = await kms.listKeys();
        res.status(200).json({ keys, count: keys.length });
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'Failed to list keys');
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
      }
    });

    // 4. POST /api/v1/keys/rotate — Zero-downtime key rotation
    this.router.post('/rotate', async (req: Request, res: Response) => {
      const parsed = KeyRotationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.issues });
        return;
      }

      try {
        const { reason, operator } = parsed.data;
        const result = await this.permitEngine.rotateSigningKey(reason, operator);
        res.status(200).json({
          success: true,
          new_key: result.newKey,
          old_key: result.oldKey,
          event: result.event,
        });
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'Key rotation failed');
        res.status(500).json({ error: 'ROTATION_FAILED', message: err.message });
      }
    });

    // 5. POST /api/v1/keys/revoke — Emergency key revocation
    this.router.post('/revoke', async (req: Request, res: Response) => {
      const parsed = KeyRevocationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.issues });
        return;
      }

      try {
        const { key_id, reason, operator } = parsed.data;
        const result = await this.permitEngine.revokeSigningKey(key_id, reason, operator);
        res.status(200).json({
          success: true,
          key: result.key,
          event: result.event,
        });
      } catch (err: any) {
        this.logger?.error({ err: err.message, key_id: req.body?.key_id }, 'Key revocation failed');
        res.status(500).json({ error: 'REVOCATION_FAILED', message: err.message });
      }
    });

    // 6. GET /api/v1/keys/revocations — Authoritative Revocation List for Bank Gate Synchronization
    this.router.get('/revocations', async (req: Request, res: Response) => {
      try {
        const revocations = await kms.getRevocations();
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.status(200).json(revocations);
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'Failed to fetch revocations');
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
      }
    });

    // 7. POST /api/v1/keys/legal-hold — Sets or clears legal hold on a key
    this.router.post('/legal-hold', async (req: Request, res: Response) => {
      const LegalHoldSchema = z.object({
        key_id: z.string().min(1),
        hold: z.boolean(),
      });
      const parsed = LegalHoldSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.issues });
        return;
      }
      try {
        const key = await kms.setLegalHold(parsed.data.key_id, parsed.data.hold);
        res.status(200).json({ success: true, key });
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'Legal hold update failed');
        res.status(500).json({ error: 'LEGAL_HOLD_ERROR', message: err.message });
      }
    });

    // 8. POST /api/v1/keys/destroy — Cryptographic Zeroization & Key Destruction
    this.router.post('/destroy', async (req: Request, res: Response) => {
      const KeyDestructionRequestSchema = z.object({
        key_id: z.string().min(1),
        reason: z.string().min(1).max(256).default('Scheduled end-of-lifecycle zeroization'),
        operator: z.string().min(1).max(128).default('security_officer'),
      });
      const parsed = KeyDestructionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.issues });
        return;
      }
      try {
        const { key_id, reason, operator } = parsed.data;
        const result = await kms.destroyKey(key_id, reason, operator);
        res.status(200).json({
          success: true,
          key: result.key,
          event: result.event,
        });
      } catch (err: any) {
        this.logger?.error({ err: err.message, key_id: req.body?.key_id }, 'Key destruction rejected');
        res.status(400).json({ error: 'DESTRUCTION_REJECTED', message: err.message });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}
