/**
 * Bank Gate Configuration
 */

export interface BankGateConfig {
  port: number;
  dbPath: string;
  gatewayPublicKeyPem: string;
  gatewayKeyId: string;
  ledgerAdapterUrl: string;
  environment: string;
}

export const bankGateConfig: BankGateConfig = {
  port: Number(process.env.BANK_GATE_PORT || 4000),
  dbPath: process.env.BANK_GATE_DB_PATH || 'bank_gate.db',
  gatewayPublicKeyPem: process.env.GATEWAY_PUBLIC_KEY_PEM || '',
  gatewayKeyId: process.env.GATEWAY_KEY_ID || '',
  ledgerAdapterUrl: process.env.LEDGER_ADAPTER_URL || 'http://127.0.0.1:4001',
  environment: process.env.NODE_ENV || 'development',
};
