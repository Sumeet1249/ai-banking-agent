# AgentGuard Trust Intelligence — Security Threat Model

## 1. Trust Boundaries & Threat Actors
1. **Compromised Autonomous Agent**: An LLM agent compromised via indirect prompt injection (e.g. malformed invoice text, untrusted emails, or malicious web search snippets).
2. **Malicious Sub-Agent**: A downstream child agent attempting privilege escalation beyond its delegated scope.
3. **Network Adversary**: An attacker attempting signature forgery, replay attacks, or timestamp manipulation.
4. **Insider / Unauthorized Caller**: An actor attempting to bypass human-in-the-loop controls or clear quarantine without authorization.

## 2. Mitigation Strategies
- **Indirect Prompt Injection**: Neutralized deterministically. Even if an agent's reasoning is subverted, the Trust Policy Engine validates payee, amount, account reference, and allowed tools against the immutable CustomerIntent. Wording: *"limits the financial damage of a successful prompt injection to what the customer authorized"*.
- **Privilege Escalation**: Strict capability narrowing prevents sub-agents from acquiring tools or limits not held by the parent.
- **Replay Attacks**: Prevented by atomic single-use nonce persistence in SQLite WAL mode.
- **Fail-Closed Operations (Rule I8)**: Any unhandled exception, DB lock, or validation timeout defaults to `DEFER` and issues zero permits.
