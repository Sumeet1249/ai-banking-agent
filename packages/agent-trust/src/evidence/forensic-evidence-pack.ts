import crypto from 'crypto';
import { ForensicIncidentRecord } from '@agentguard/core-schema';

export class ForensicEvidencePack {
  public static createEvidencePack(
    incident: ForensicIncidentRecord,
    logs: Array<Record<string, unknown>>
  ): {
    evidence_pack_id: string;
    incident: ForensicIncidentRecord;
    logs: Array<Record<string, unknown>>;
    tamper_evident_root_hash: string;
    generated_at: number;
  } {
    const now = Date.now();
    const evidence_pack_id = `PACK_${incident.incident_id}_${now}`;

    const leafHashes = logs.map((log) => {
      return crypto.createHash('sha256').update(JSON.stringify(log)).digest('hex');
    });

    const incidentHash = crypto.createHash('sha256').update(JSON.stringify(incident)).digest('hex');
    leafHashes.unshift(incidentHash);

    const rootHash = crypto.createHash('sha256').update(leafHashes.join(':')).digest('hex');

    return {
      evidence_pack_id,
      incident,
      logs,
      tamper_evident_root_hash: rootHash,
      generated_at: now,
    };
  }

  public static verifyEvidencePack(pack: {
    incident: ForensicIncidentRecord;
    logs: Array<Record<string, unknown>>;
    tamper_evident_root_hash: string;
  }): boolean {
    const leafHashes = pack.logs.map((log) => {
      return crypto.createHash('sha256').update(JSON.stringify(log)).digest('hex');
    });
    const incidentHash = crypto.createHash('sha256').update(JSON.stringify(pack.incident)).digest('hex');
    leafHashes.unshift(incidentHash);

    const recomputed = crypto.createHash('sha256').update(leafHashes.join(':')).digest('hex');
    return recomputed === pack.tamper_evident_root_hash;
  }
}
