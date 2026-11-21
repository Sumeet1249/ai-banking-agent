export interface ServerPendingCheck {
  check_id: string
  agent_id: string
  agent_name: string
  tool_name: string
  category: string
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  workflow_id?: string
  reservation_id?: string
  source?: string
  arguments: Record<string, any>
  violations: string[]
  created_at: string
}

class ServerApprovalStore {
  private checks: ServerPendingCheck[] = [
    {
      check_id: 'chk-9F2KqRxN-001',
      agent_id: 'agent-data-pipeline',
      agent_name: 'Data Pipeline',
      tool_name: 'http_post',
      category: 'network',
      risk_level: 'HIGH',
      risk: 'HIGH',
      arguments: {
        url: 'https://api.razorpay.com/v1/payouts',
        amount: 24500000,
        currency: 'inr',
        destination: 'hdfc_payout_vpa',
        payee: 'HDFC Payout VPA',
      },
      violations: ['Transfer ≥ ₹1,00,000 requires customer Step-Up Passkey per `rbi-master-direction-payments` policy.'],
      created_at: new Date(Date.now() - 38000).toISOString(),
      source: 'gateway',
    },
    {
      check_id: 'chk-3M8tPzY7-002',
      agent_id: 'agent-coding-asst',
      agent_name: 'Coding Asst',
      tool_name: 'shell',
      category: 'shell',
      risk_level: 'CRITICAL',
      risk: 'CRITICAL',
      arguments: { command: 'kubectl delete deployment payments-api -n prod' },
      violations: ['`kubectl delete` on `payments-api` (prod) blocked — last-known revenue path. Requires SRE on-call approval.'],
      created_at: new Date(Date.now() - 124000).toISOString(),
      source: 'gateway',
    },
    {
      check_id: 'chk-K7nQwL2X-003',
      agent_id: 'agent-customer-support',
      agent_name: 'Customer Support Bot',
      tool_name: 'send_email',
      category: 'communication',
      risk_level: 'MEDIUM',
      risk: 'MEDIUM',
      arguments: {
        to: 'all-customers@acme.io',
        subject: 'Service maintenance window',
        body: '…broadcast to 14,210 recipients…',
      },
      violations: ['Bulk-send (≥1k recipients) triggers human review per `broadcast-blast` policy.'],
      created_at: new Date(Date.now() - 287000).toISOString(),
      source: 'gateway',
    },
    {
      check_id: 'chk-D1vBhJ5R-004',
      agent_id: 'agent-data-pipeline',
      agent_name: 'Data Pipeline',
      tool_name: 'http_post',
      category: 'network',
      risk_level: 'HIGH',
      risk: 'HIGH',
      arguments: {
        url: 'https://api.openai.com/v1/files',
        method: 'POST',
        filename: 'customer_export_2026q2.jsonl',
        size_mb: 84,
      },
      violations: ['Bulk export (84 MB) outbound to external LLM provider API violates Data Sovereign Rule DS-2.'],
      created_at: new Date(Date.now() - 410000).toISOString(),
      source: 'gateway',
    },
    {
      check_id: 'chk-5X9mNp8L-005',
      agent_id: 'agent-security-bot',
      agent_name: 'Security Admin Bot',
      tool_name: 'sql_execute',
      category: 'database',
      risk_level: 'CRITICAL',
      risk: 'CRITICAL',
      arguments: { query: "UPDATE users SET role = 'admin' WHERE email = 'contractor@external-vendor.com'" },
      violations: ['Privilege escalation query directly modifying `role` column requires dual-authorization.'],
      created_at: new Date(Date.now() - 560000).toISOString(),
      source: 'gateway',
    },
  ]

  listChecks(): ServerPendingCheck[] {
    return [...this.checks]
  }

  addCheck(check: Partial<ServerPendingCheck>): ServerPendingCheck {
    const id = check.check_id || `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const newCheck: ServerPendingCheck = {
      check_id: id,
      agent_id: check.agent_id || 'agent-unknown',
      agent_name: check.agent_name || 'Autonomous Agent',
      tool_name: check.tool_name || 'action',
      category: check.category || 'network',
      risk_level: (check.risk_level || check.risk || 'HIGH') as any,
      risk: (check.risk || check.risk_level || 'HIGH') as any,
      workflow_id: check.workflow_id,
      reservation_id: check.reservation_id,
      source: check.source || 'cockpit',
      arguments: check.arguments || {},
      violations: check.violations || ['Held for customer approval.'],
      created_at: check.created_at || new Date().toISOString(),
    }
    // Deduplicate by check_id or reservation_id
    this.checks = [
      newCheck,
      ...this.checks.filter(c => c.check_id !== id && (!newCheck.reservation_id || c.reservation_id !== newCheck.reservation_id))
    ]
    return newCheck
  }

  resolveCheck(identifier: string, _decision?: string): boolean {
    const prevLen = this.checks.length
    this.checks = this.checks.filter(
      c => c.check_id !== identifier && c.reservation_id !== identifier
    )
    return this.checks.length !== prevLen
  }

  count(): number {
    return this.checks.length
  }
}

// Global singleton across Next.js API route invocations
const globalStore = globalThis as unknown as { __aegis_approval_store?: ServerApprovalStore }
export const serverApprovalStore = globalStore.__aegis_approval_store || (globalStore.__aegis_approval_store = new ServerApprovalStore())
