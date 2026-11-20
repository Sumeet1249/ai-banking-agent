/**
 * Witness Durable SQLite Database Store
 *
 * Implements isolated storage for the Witness process:
 *   - Dedicated database file: witness.db (Decision D17)
 *   - Stores co-signed checkpoints, Merkle roots, and signing keypair
 */

import Database from 'better-sqlite3';
import type { Logger } from 'pino';

export interface WitnessCheckpointRow {
  checkpoint_id: string;
  epoch: number;
  sequence_number: number;
  tree_size: number;
  root_hash: string;
  gateway_signature: string;
  witness_signature: string;
  witness_key_id: string;
  created_at: number;
}

export class WitnessStore {
  constructor(
    private db: Database.Database,
    private logger?: Logger,
  ) {
    this.init();
  }

  public init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS witness_checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        epoch INTEGER NOT NULL,
        sequence_number INTEGER NOT NULL,
        tree_size INTEGER NOT NULL,
        root_hash TEXT NOT NULL,
        gateway_signature TEXT NOT NULL,
        witness_signature TEXT NOT NULL,
        witness_key_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wchk_epoch ON witness_checkpoints(epoch, sequence_number);

      CREATE TABLE IF NOT EXISTS witness_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  public recordCheckpoint(cp: WitnessCheckpointRow): void {
    this.db.prepare(`
      INSERT INTO witness_checkpoints (
        checkpoint_id, epoch, sequence_number, tree_size, root_hash,
        gateway_signature, witness_signature, witness_key_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cp.checkpoint_id,
      cp.epoch,
      cp.sequence_number,
      cp.tree_size,
      cp.root_hash,
      cp.gateway_signature,
      cp.witness_signature,
      cp.witness_key_id,
      cp.created_at,
    );
  }

  public getCheckpoint(checkpointId: string): WitnessCheckpointRow | null {
    const row = this.db.prepare('SELECT * FROM witness_checkpoints WHERE checkpoint_id = ?').get(checkpointId) as WitnessCheckpointRow | undefined;
    return row ?? null;
  }

  public getLatestCheckpoint(): WitnessCheckpointRow | null {
    const row = this.db.prepare('SELECT * FROM witness_checkpoints ORDER BY epoch DESC, sequence_number DESC LIMIT 1').get() as WitnessCheckpointRow | undefined;
    return row ?? null;
  }

  public listCheckpointsByEpoch(epoch: number): WitnessCheckpointRow[] {
    return this.db.prepare('SELECT * FROM witness_checkpoints WHERE epoch = ? ORDER BY sequence_number ASC').all(epoch) as WitnessCheckpointRow[];
  }

  public countCheckpoints(): number {
    return (this.db.prepare('SELECT COUNT(*) as n FROM witness_checkpoints').get() as any).n;
  }

  public getConfig(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM witness_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  public setConfig(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO witness_config (key, value) VALUES (?, ?)').run(key, value);
  }
}
