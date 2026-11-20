/**
 * Independent Witness Express HTTP Server (Port 5000)
 *
 * Implements docs/api/openapi-witness.yaml:
 *   - GET /health
 *   - GET /api/v1/public-key & GET /public-key (Legacy Alias)
 *   - POST /api/v1/checkpoints
 *   - GET /checkpoints (GET /checkpoints?epoch=<n>)
 *   - GET /api/v1/checkpoints/:checkpoint_id
 *   - POST /api/v1/checkpoints/verify
 */

import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';
import Database from 'better-sqlite3';
import pino, { Logger } from 'pino';
import { z } from 'zod';
import { WitnessStore } from './db/witness-store';
import { WitnessCoSigningService } from './services/witness-service';
import { EvidencePackService } from './services/evidence-service';

const SubmitCheckpointSchema = z.object({
  epoch: z.number().int().positive(),
  sequence_number: z.number().int().positive(),
  tree_size: z.number().int().positive(),
  root_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  gateway_signature: z.string().min(1),
}).required();

const VerifyProofSchema = z.object({
  checkpoint_id: z.string().uuid(),
  leaf_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  leaf_index: z.number().int().nonnegative(),
  audit_path: z.array(z.string().regex(/^[a-f0-9]{64}$/i)),
});

export class WitnessApp {
  public app: express.Express;
  public server?: Server;
  public store: WitnessStore;
  public witnessService: WitnessCoSigningService;
  public evidenceService: EvidencePackService;

  constructor(
    private db: Database.Database,
    private port: number = 5000,
    private gatewayPublicKeyPem?: string,
    private logger: Logger = pino({ level: 'info' }),
  ) {
    this.app = express();
    this.store = new WitnessStore(this.db, this.logger);
    this.witnessService = new WitnessCoSigningService(
      this.store,
      this.gatewayPublicKeyPem,
      this.logger,
    );
    this.evidenceService = new EvidencePackService(this.logger);

    this.configureMiddleware();
    this.registerRoutes();
  }

  private configureMiddleware(): void {
    this.app.use(express.json());
  }

  private registerRoutes(): void {
    // ── Health ───────────────────────────────────────────────────────────────
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'UP',
        service: 'independent-witness',
        port: this.port,
        witness_id: 'wit_primary_01',
        active_key_id: this.witnessService.getKeyId(),
        checkpoints_recorded: this.store.countCheckpoints(),
      });
    });

    // ── Public Key ───────────────────────────────────────────────────────────
    const handlePublicKey = (_req: Request, res: Response) => {
      res.status(200).json({
        key_id: this.witnessService.getKeyId(),
        algorithm: 'ed25519',
        public_key_pem: this.witnessService.getPublicKeyPem(),
      });
    };
    this.app.get('/api/v1/public-key', handlePublicKey);
    this.app.get('/public-key', handlePublicKey); // Legacy alias (CONTRACTS.md)

    // ── Checkpoints Co-Signing & Listing ─────────────────────────────────────
    this.app.post('/api/v1/checkpoints', (req: Request, res: Response) => {
      const parsed = SubmitCheckpointSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid checkpoint submission', details: parsed.error.issues });
        return;
      }

      const result = this.witnessService.submitAndCoSign(parsed.data as any);
      if (!result.success) {
        res.status(409).json({ error: result.reason, reason_code: result.reason });
        return;
      }

      res.status(200).json(result.checkpoint);
    });

    this.app.get('/checkpoints', (req: Request, res: Response) => {
      const epoch = req.query.epoch ? Number(req.query.epoch) : 1;
      const list = this.store.listCheckpointsByEpoch(epoch);
      res.status(200).json({ epoch, checkpoints: list });
    });

    this.app.get('/api/v1/checkpoints/:checkpoint_id', (req: Request, res: Response) => {
      const cp = this.store.getCheckpoint(req.params.checkpoint_id);
      if (!cp) {
        res.status(404).json({ error: 'Checkpoint not found', checkpoint_id: req.params.checkpoint_id });
        return;
      }
      res.status(200).json(cp);
    });

    // ── RFC 6962 Proof Verification ──────────────────────────────────────────
    this.app.post('/api/v1/checkpoints/verify', (req: Request, res: Response) => {
      const parsed = VerifyProofSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid proof request', details: parsed.error.issues });
        return;
      }

      const result = this.witnessService.verifyProof({
        checkpointId: parsed.data.checkpoint_id,
        leafHash: parsed.data.leaf_hash,
        index: parsed.data.leaf_index,
        auditPath: parsed.data.audit_path,
      });

      if (!result.valid) {
        res.status(403).json(result);
        return;
      }

      res.status(200).json(result);
    });

    // ── Compliance Evidence Pack Verification ─────────────────────────────────
    this.app.post('/api/v1/compliance/evidence/verify', (req: Request, res: Response) => {
      const result = this.evidenceService.verifyEvidencePack(req.body, {
        gatewayPublicKeyPem: this.gatewayPublicKeyPem,
        trustedWitnessPublicKeyPem: this.witnessService.getPublicKeyPem(),
      });
      if (!result.verified) {
        res.status(422).json(result);
        return;
      }
      res.status(200).json(result);
    });
  }

  public listen(port: number = this.port): Promise<number> {
    return new Promise((resolve) => {
      this.server = createServer(this.app);
      this.server.listen(port, () => {
        const addr = this.server!.address() as any;
        this.logger.info({ port: addr.port }, 'Independent Witness server listening');
        resolve(addr.port);
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

if (require.main === module) {
  const dbPath = process.env.WITNESS_DB_PATH || 'witness.db';
  const db = new Database(dbPath);
  const port = Number(process.env.WITNESS_PORT || 5000);
  const app = new WitnessApp(db, port);
  app.listen(port).catch((err) => {
    console.error('Failed to start Witness', err);
    process.exit(1);
  });
}
