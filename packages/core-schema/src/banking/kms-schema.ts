/**
 * Enterprise Key Management (KMS / HSM) Schemas & Interfaces
 *
 * Implements Phase 7.4:
 *   - Provider-neutral cryptographic key metadata & lifecycle states
 *   - Key rotation FSM (ACTIVE -> RETIRED with grace window -> REVOKED)
 *   - RFC 7517 JWKS discovery schemas
 *   - HSM / PKCS#11 key custody specifications
 */

import { z } from 'zod';

export const KeyStatusSchema = z.enum([
  'ACTIVE',              // Authoritative key; permitted to sign and verify
  'RETIRED',             // Historical key; cannot sign new permits, verifies in-flight within grace period
  'REVOKED',             // Compromised key; all signatures immediately rejected
  'PENDING_DESTRUCTION', // Key scheduled for cryptographic zeroization following retention/legal check
  'DESTROYED',           // Key memory wiped and hardware handles zeroized
]);
export type KeyStatus = z.infer<typeof KeyStatusSchema>;

export const KeyPurposeSchema = z.enum([
  'PERMIT_SIGNING',     // Gateway Ed25519 permit signing
  'WITNESS_CHECKPOINT',  // Witness independent checkpoint cosigning
  'AGENT_IDENTITY',      // Agent Ed25519 identity signing
  'SESSION_ENCRYPTION',  // Internal token & state encryption (AES-256-GCM)
]);
export type KeyPurpose = z.infer<typeof KeyPurposeSchema>;

export const KeyAlgorithmSchema = z.enum([
  'ed25519',
  'ecdsa_p256',
  'rsa_pss_2048',
]);
export type KeyAlgorithm = z.infer<typeof KeyAlgorithmSchema>;

export const KmsProviderTypeSchema = z.enum([
  'LOCAL_SOFTWARE',  // In-memory or software-backed (development / testing)
  'LOCAL_ENCRYPTED', // AES-256-GCM envelope-encrypted keystore file
  'PKCS11_HSM',      // Hardware Security Module (Thales, Nitrokey, CloudHSM)
  'AWS_KMS',         // AWS Key Management Service (asymmetric Ed25519 / ECC)
  'GCP_KMS',         // Google Cloud Key Management Service
  'AZURE_KEYVAULT',  // Azure Key Vault Premium HSM
  'HASHICORP_VAULT', // HashiCorp Vault Transit Engine
]);
export type KmsProviderType = z.infer<typeof KmsProviderTypeSchema>;

/**
 * Enterprise Key Metadata Record
 */
export const KeyMetadataSchema = z.object({
  key_id: z.string().min(1),
  purpose: KeyPurposeSchema,
  algorithm: KeyAlgorithmSchema.default('ed25519'),
  public_key_pem: z.string().min(1),
  status: KeyStatusSchema.default('ACTIVE'),
  created_at: z.number().int().positive(),
  activated_at: z.number().int().positive(),
  retired_at: z.number().int().nullable().default(null),
  revoked_at: z.number().int().nullable().default(null),
  destruction_at: z.number().int().nullable().default(null),
  legal_hold: z.boolean().default(false),
  retention_until: z.number().int().nullable().default(null),
  grace_period_ms: z.number().int().nonnegative().default(180000), // 3 minutes grace (comfortably > 90s permit TTL)
  provider_type: KmsProviderTypeSchema.default('LOCAL_SOFTWARE'),
  hsm_label: z.string().nullable().default(null),
  rotation_reason: z.string().nullable().default(null),
  revocation_reason: z.string().nullable().default(null),
});
export type KeyMetadata = z.infer<typeof KeyMetadataSchema>;

/**
 * Key Rotation Event
 */
export const KeyRotationEventSchema = z.object({
  event_id: z.string().uuid(),
  purpose: KeyPurposeSchema,
  previous_key_id: z.string().min(1),
  new_key_id: z.string().min(1),
  rotated_at: z.number().int().positive(),
  grace_period_expires_at: z.number().int().positive(),
  operator: z.string().min(1),
  reason: z.string().min(1),
});
export type KeyRotationEvent = z.infer<typeof KeyRotationEventSchema>;

/**
 * Key Revocation Event
 */
export const KeyRevocationEventSchema = z.object({
  event_id: z.string().uuid(),
  key_id: z.string().min(1),
  purpose: KeyPurposeSchema,
  revoked_at: z.number().int().positive(),
  operator: z.string().min(1),
  reason: z.string().min(1),
});
export type KeyRevocationEvent = z.infer<typeof KeyRevocationEventSchema>;

/**
 * Authoritative Key Revocation List (CRL equivalent for Bank Gate sync)
 */
export const KeyRevocationListSchema = z.object({
  revocations: z.array(KeyRevocationEventSchema),
  sequence_number: z.number().int().nonnegative(),
  published_at: z.number().int().positive(),
});
export type KeyRevocationList = z.infer<typeof KeyRevocationListSchema>;

/**
 * Key Destruction Event (Audit Record for Zeroization)
 */
export const KeyDestructionEventSchema = z.object({
  event_id: z.string().uuid(),
  key_id: z.string().min(1),
  purpose: KeyPurposeSchema,
  destroyed_at: z.number().int().positive(),
  operator: z.string().min(1),
  reason: z.string().min(1),
  legal_hold_verified: z.boolean(),
  retention_satisfied: z.boolean(),
  zeroization_method: z.enum(['MEMORY_BUFFER_ZEROIZATION', 'HSM_OBJECT_DESTROY', 'CRYPTO_SHRED_KEYSTORE']),
  destruction_digest: z.string().min(1),
});
export type KeyDestructionEvent = z.infer<typeof KeyDestructionEventSchema>;

/**
 * RFC 7517 JWK Representation for Ed25519 Public Keys
 */
export const JwkKeySchema = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  kid: z.string(),
  x: z.string(), // Base64url raw public key coordinate
  use: z.literal('sig').default('sig'),
  key_ops: z.array(z.string()).default(['verify']),
  alg: z.literal('EdDSA').default('EdDSA'),
  status: KeyStatusSchema.optional(),
  activated_at: z.number().int().optional(),
  retired_at: z.number().int().nullable().optional(),
});
export type JwkKey = z.infer<typeof JwkKeySchema>;

export const JwksResponseSchema = z.object({
  keys: z.array(JwkKeySchema),
  updated_at: z.number().int(),
});
export type JwksResponse = z.infer<typeof JwksResponseSchema>;
