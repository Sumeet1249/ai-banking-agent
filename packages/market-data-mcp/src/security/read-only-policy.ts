/**
 * AgentGuard Market Intelligence Security & Read-Only Policy (Phase MI-9/MI-10)
 *
 * Enforces:
 *   - Strict Positive Allowlist for all Market MCP Tools
 *   - Instant Denial for any trading, scalping, order placement or broker write attempt
 *   - Quarantined sanitization of corporate filings and concall transcripts against Prompt Injection
 *   - Zero leakage of broker access tokens or customer private keys
 */

import {
  ALLOWED_MARKET_TOOLS,
  PROHIBITED_TRADE_PATTERNS,
} from '@agentguard/core-schema';

export class MarketReadOnlyPolicy {
  private static readonly allowedToolSet = new Set<string>(ALLOWED_MARKET_TOOLS);

  /**
   * Asserts whether an MCP tool invocation is on the permitted read-only allowlist.
   */
  public static isToolAllowed(toolName: string): boolean {
    return this.allowedToolSet.has(toolName);
  }

  /**
   * Inspects tool name and arguments for any trade execution or order creation attempt.
   */
  public static isProhibitedExecutionAttempt(toolName: string, args: Record<string, any> = {}): {
    prohibited: boolean;
    reason?: string;
  } {
    const lowerName = toolName.toLowerCase();

    for (const pat of PROHIBITED_TRADE_PATTERNS) {
      if (lowerName.includes(pat)) {
        return {
          prohibited: true,
          reason: `Tool "${toolName}" matches prohibited trade execution keyword "${pat}". AgentGuard Market Intelligence is strictly read-only.`,
        };
      }
    }

    // Inspect argument keys for order parameters
    const argKeys = Object.keys(args).map((k) => k.toLowerCase());
    const illegalArgKeys = ['order_type', 'limit_price', 'stop_loss', 'disclosed_quantity', 'trigger_price', 'squareoff'];
    for (const key of illegalArgKeys) {
      if (argKeys.includes(key)) {
        return {
          prohibited: true,
          reason: `Execution argument "${key}" detected. Order execution and modification are strictly prohibited.`,
        };
      }
    }

    return { prohibited: false };
  }

  /**
   * Sanitizes external text (filings, earnings summaries, news) to prevent prompt injection.
   * Quarantines delimiters and instructions trying to escape model context.
   */
  public static sanitizeExternalDocumentText(text: string): string {
    if (!text) return '';

    // Strip high-risk prompt injection delimiters and system prompt override attempts
    return text
      .replace(/<\|.*?\|>/g, '') // Special tokens
      .replace(/\[\s*(system|instruction|developer)\s*\]/gi, '[untrusted_document_content]')
      .replace(/(ignore (previous |all )?instructions|disregard all prior directives|execute order|buy (\d+ )?shares( now)?)/gi, '[REDACTED_SUSPICIOUS_DIRECTIVE]')
      .trim();
  }

  /**
   * Redacts sensitive tokens (Upstox tokens, API keys, passwords) from log payloads.
   */
  public static redactSecrets(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const SENSITIVE_KEYS = ['token', 'secret', 'apikey', 'api_key', 'authorization', 'bearer', 'password', 'pin'];
    const copy: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
        copy[key] = '[REDACTED_SECRET]';
      } else if (typeof value === 'object' && value !== null) {
        copy[key] = this.redactSecrets(value);
      } else {
        copy[key] = value;
      }
    }

    return copy;
  }

  /**
   * Instance helper for tool validation
   */
  public validateToolCall(toolName: string, args: Record<string, any> = {}): { allowed: boolean; reason?: string } {
    const prohibited = MarketReadOnlyPolicy.isProhibitedExecutionAttempt(toolName, args);
    if (prohibited.prohibited) {
      return { allowed: false, reason: prohibited.reason };
    }
    return { allowed: true };
  }

  /**
   * Verify broker OAuth scopes to ensure only read-only scopes are requested
   */
  public checkConsentScopes(scopes: string[]): { allowed: boolean; violations: string[] } {
    const prohibitedScopes = ['trade', 'orders', 'order_write', 'place_order', 'fund_transfer', 'withdraw'];
    const violations: string[] = [];

    for (const sc of scopes) {
      const lower = sc.toLowerCase();
      if (prohibitedScopes.some((p) => lower.includes(p))) {
        violations.push(sc);
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * Instance helper for document sanitization
   */
  public sanitizeFilingText(text: string): string {
    return MarketReadOnlyPolicy.sanitizeExternalDocumentText(text);
  }
}

export { MarketReadOnlyPolicy as ReadOnlyPolicy };

