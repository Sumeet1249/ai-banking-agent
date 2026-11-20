# OIDC-INTEGRATION-GUIDE.md — Enterprise OpenID Connect Integration Guide
**Document:** `docs/OIDC-INTEGRATION-GUIDE.md`  
**Version:** 1.0.0 (Phase 7.1 Production Standard)  
**Status:** PRODUCTION INTEGRATION GUIDE  
**Target Git Branch:** `feat/agentguard-banking`  

---

## 1. Overview

AgentGuard AI supports provider-neutral OpenID Connect (OIDC) authentication using the **Authorization Code Flow with Proof Key for Code Exchange (PKCE S256)**.

This guide provides configuration specifications and reference implementations for integrating enterprise Identity Providers (IdPs), with particular focus on **Microsoft Entra ID (formerly Azure Active Directory)** and **Okta**.

---

## 2. Security Requirements & Invariants

Every OIDC provider integrated into AgentGuard AI must satisfy the following security controls:
1. **PKCE S256 Required**: Public clients and server-side redirects must supply an RFC 7636 code challenge calculated with SHA-256 (`code_challenge_method=S256`). Plain PKCE is prohibited.
2. **Cryptographic ID Token Signature Verification**: ID tokens must be cryptographically verified using the provider's official JSON Web Key Set (JWKS) via `jose`. Tokens signed with symmetric algorithms (e.g. `HS256`) or untrusted keys are rejected.
3. **Claims Enforcement**:
   - `iss`: Must match the exact configured provider issuer URL.
   - `aud`: Must match the AgentGuard `client_id`.
   - `exp`: Token must not be expired (maximum clock skew tolerance: 30 seconds).
   - `nbf`: Token must be active.
   - `nonce`: Must match the single-use cryptographic nonce generated during the authorization initiation request.
4. **Stable Identity Mapping**:
   Customer accounts are bound to `(idp_issuer, idp_subject)`. Raw email addresses are retained for notifications but are **never used as the primary authentication lookup key**.

---

## 3. Configuration Contract

Provider configuration is validated via Zod (`OidcProviderConfigSchema` in `@agentguard/core-schema`):

```typescript
export interface OidcProviderConfig {
  provider_id: string;              // e.g. "enterprise-entra"
  issuer: string;                   // e.g. "https://login.microsoftonline.com/{tenant_id}/v2.0"
  client_id: string;                // Application (Client) ID
  client_secret?: string;           // Optional for confidential clients
  authorization_endpoint?: string;  // Explicit or auto-derived from issuer
  token_endpoint?: string;          // Explicit or auto-derived from issuer
  userinfo_endpoint?: string;       // Optional UserInfo endpoint
  jwks_uri?: string;                // Explicit or auto-derived from issuer
  scopes: string[];                 // ["openid", "profile", "email"]
  allowed_redirect_uris: string[];  // Strict whitelist of callback URLs
}
```

### Environment Variables

| Variable | Description | Example Value |
|:---|:---|:---|
| `OIDC_PROVIDER_ID` | Internal identifier for IdP | `enterprise-entra` |
| `OIDC_ISSUER` | OIDC Issuer URI | `https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47/v2.0` |
| `OIDC_CLIENT_ID` | Registered App ID | `3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `OIDC_CLIENT_SECRET` | Secret for confidential flow | `_K8Q~mockClientSecretValue` |
| `OIDC_REDIRECT_URI` | Whitelisted callback URL | `http://localhost:3000/api/auth/callback/oidc` |
| `OIDC_SCOPES` | Space-delimited scopes | `openid profile email` |

---

## 4. Microsoft Entra ID (Azure AD) Reference Setup

### 4.1 Azure Portal Configuration
1. Navigate to **Microsoft Entra ID** > **App registrations** > **New registration**.
2. **Name**: `AgentGuard AI Banking Gateway`.
3. **Supported account types**: `Accounts in this organizational directory only (Single tenant)`.
4. **Redirect URI**:
   - Platform: `Web` (or `Single-page application` if initiated in Cockpit).
   - URI: `https://cockpit.internal.bank.com/api/auth/callback/oidc`.
5. Under **Certificates & secrets**, generate a new Client Secret if running in confidential mode.
6. Under **API permissions**, ensure `openid`, `profile`, and `email` delegated permissions are granted.

### 4.2 Endpoint Resolution
- **Issuer**: `https://login.microsoftonline.com/{tenant-id}/v2.0`
- **Authorization Endpoint**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize`
- **Token Endpoint**: `https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token`
- **JWKS URI**: `https://login.microsoftonline.com/{tenant-id}/discovery/v2.0/keys`

---

## 5. End-to-End Authorization Code + PKCE Flow

### Step 1: Client Initiates Flow
The client sends a request to the Gateway:
```http
POST /api/customer/auth/oidc/init HTTP/1.1
Content-Type: application/json

{
  "provider_id": "enterprise-entra",
  "redirect_uri": "http://localhost:3000/api/auth/callback/oidc"
}
```

The Gateway generates a 32-byte cryptographically secure `code_verifier`, computes `code_challenge = Base64URL(SHA256(code_verifier))`, generates a random `state` and `nonce`, persists them in `oidc_auth_states` with a 10-minute TTL, and responds:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "authorization_url": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?response_type=code&client_id=...&redirect_uri=...&scope=openid+profile+email&state=abc123...&nonce=xyz789...&code_challenge=...&code_challenge_method=S256",
  "state": "abc123stateValue...",
  "expires_at": 1774000000000
}
```

### Step 2: Customer Authenticates at IdP
The user authenticates with Entra ID. Upon successful MFA and authentication, Entra ID redirects the user's browser to the whitelisted `redirect_uri` with query parameters:
```
https://cockpit.internal.bank.com/api/auth/callback/oidc?code=0.AVMA...&state=abc123stateValue...
```

### Step 3: Code Exchange and Token Verification
The client forwards `code` and `state` to the Gateway:
```http
POST /api/customer/auth/oidc/callback HTTP/1.1
Content-Type: application/json

{
  "code": "0.AVMA...",
  "state": "abc123stateValue..."
}
```

The Gateway:
1. Atomically consumes and removes `state` from `oidc_auth_states` (single-use guarantee).
2. Sends a POST request to Entra ID's `token_endpoint` with `code` and `code_verifier`.
3. Verifies the received `id_token` against Entra ID's JWKS using `jose.jwtVerify`.
4. Checks that `claims.nonce === authState.nonce`.
5. Queries `customer_idp_identities` for `(claims.iss, claims.sub)`.
6. Creates an authenticated session in `customer_sessions` and returns an `HttpOnly`, `SameSite=Lax` session cookie.

---

## 6. Error Codes Reference

| Error Code | HTTP Status | Root Cause |
|:---|:---|:---|
| `INVALID_REDIRECT_URI` | 400 | The requested redirect URI is not present in `allowed_redirect_uris`. |
| `INVALID_OR_EXPIRED_OIDC_STATE` | 401 | The state parameter was not found in `oidc_auth_states` or has expired (> 10 min). |
| `OIDC_TOKEN_EXCHANGE_FAILED` | 401 | IdP rejected the authorization code or `code_verifier`. |
| `OIDC_TOKEN_VERIFICATION_FAILED` | 401 | ID token signature, issuer, audience, expiry, or nonce verification failed. |
| `CUSTOMER_IDP_MAPPING_NOT_FOUND` | 401 | The authenticated IdP user has no linked `customer_ref` in `customer_idp_identities`. |

---
*AgentGuard AI Integration Engineering — Enterprise Identity Specification*
