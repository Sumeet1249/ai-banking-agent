'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  Wallet, ShoppingBag, Car, Zap, Utensils, HeartPulse, TrendingUp,
  AlertTriangle, Lock, Unlock, Sparkles, Sliders, Plus, Edit3, ArrowRight,
  ShieldCheck, RefreshCw, CheckCircle2, XCircle, ShieldAlert, Users, Layers,
  Activity, GitBranch, Search, ExternalLink, Hash, CheckCheck, Eye, Clock,
  FileCheck, Shield, ChevronDown, Filter, Info, Fingerprint, Ban, AlertCircle,
  FileText
} from 'lucide-react'
import { toast } from 'sonner'
import {
  SpendingCategory,
  CanonicalAutonomyMode,
} from '@agentguard/core-schema'

// ── TYPES & CONTRACTS ────────────────────────────────────────────────────────

export interface DashboardSummary {
  total_budget_paise: number
  total_settled_paise: number
  total_reserved_paise: number
  available_budget_paise: number
  active_agents_count: number
  active_delegations_count: number
  pending_customer_approvals_count: number
  pools_count: number
  category_breakdown: Array<{
    pool_id: string
    category: SpendingCategory
    name: string
    limit_paise: number
    settled_paise: number
    reserved_paise: number
    available_paise: number
    utilization_pct: number
    autonomy_mode: CanonicalAutonomyMode
    status: string
  }>
}

export interface UIBudgetPool {
  pool_id: string
  tenant_id: string
  customer_ref: string
  category_id: SpendingCategory
  category_name: string
  currency: string
  monthly_limit_paise: number
  weekly_limit_paise: number | null
  daily_limit_paise: number | null
  per_transaction_limit_paise: number
  autonomy_mode: CanonicalAutonomyMode
  status: 'ACTIVE' | 'EXHAUSTED' | 'FROZEN' | 'EXPIRED' | 'REVOKED'
  policy_version: number
  timezone: string
}

export interface UIAgentAllocation {
  allocation_id: string
  pool_id: string
  agent_id: string
  tenant_id: string
  customer_ref: string
  agent_limit_paise: number
  monthly_limit_paise: number | null
  weekly_limit_paise: number | null
  daily_limit_paise: number
  per_transaction_limit_paise: number
  allowed_categories: string
  blocked_categories: string
  spent_amount_paise: number
  reserved_amount_paise: number
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
  valid_from: number
  valid_until: number
  version: number
}

export interface UIMerchant {
  merchant_id: string
  merchant_name: string
  mcc_code: string
  category_id: SpendingCategory
  verification_source: string
  verification_reference?: string
  classification_method: string
  evidence_tier: 'AUTHORITATIVE_RAIL' | 'REGULATORY_REGISTRY' | 'CUSTOMER_OVERRIDE' | 'DETERMINISTIC_HEURISTIC' | 'ADVISORY_HEURISTIC'
  confidence_basis: string
  verified_at: number
  status: 'VERIFIED' | 'PROVISIONAL' | 'FLAGGED' | 'BLOCKED'
}

export interface UIPendingApproval {
  reservation_id: string
  pool_id: string
  tenant_id: string
  customer_ref: string
  agent_id: string
  workflow_id: string
  request_id: string
  transaction_digest: string
  category_id: SpendingCategory
  amount_paise: number
  currency: string
  status: string
  saga_state: string
  violations: string
  created_at: number
  expires_at: number
}

export interface UIMerkleBatch {
  batch_id: string
  merkle_root: string
  start_sequence: number
  end_sequence: number
  leaf_count: number
  algorithm_version: string
  witness_checkpoint_id: string | null
  witness_signature: string | null
  witness_epoch: number | null
  created_at: number
}

// ── UTILITIES ────────────────────────────────────────────────────────────────

export function formatPaise(paise: number): string {
  if (isNaN(paise) || paise === null || paise === undefined) return '₹0.00'
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(rupees)
}

const BANK_GATE_URL = process.env.NEXT_PUBLIC_BANK_GATE_URL || 'http://localhost:4000'

export function AnonymousBudgetPoolsView() {
  const [activeTab, setActiveTab] = useState<'overview' | 'pools' | 'agents' | 'merchants' | 'approvals' | 'merkle'>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Real Backend State
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [pools, setPools] = useState<UIBudgetPool[]>([])
  const [agents, setAgents] = useState<UIAgentAllocation[]>([])
  const [merchants, setMerchants] = useState<UIMerchant[]>([])
  const [approvals, setApprovals] = useState<UIPendingApproval[]>([])
  const [batches, setBatches] = useState<UIMerkleBatch[]>([])

  // Search & Filters
  const [merchantSearch, setMerchantSearch] = useState('')
  const [merchantCategoryFilter, setMerchantCategoryFilter] = useState<string>('ALL')
  const [agentSearch, setAgentSearch] = useState('')

  // Modals & Action States
  const [showCreatePoolModal, setShowCreatePoolModal] = useState(false)
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false)
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState<UIPendingApproval | null>(null)
  const [selectedMerchantForOverride, setSelectedMerchantForOverride] = useState<UIMerchant | null>(null)
  const [actionInProgress, setActionInProgress] = useState(false)

  // Merkle Proof State
  const [proofBatchId, setProofBatchId] = useState('')
  const [proofEventId, setProofEventId] = useState('')
  const [proofResult, setProofResult] = useState<any>(null)
  const [verifyingProof, setVerifyingProof] = useState(false)

  // New Pool Form State
  const [newPoolCategory, setNewPoolCategory] = useState<SpendingCategory>('SHOPPING')
  const [newPoolName, setNewPoolName] = useState('')
  const [newPoolMonthlyRupees, setNewPoolMonthlyRupees] = useState(25000)
  const [newPoolDailyRupees, setNewPoolDailyRupees] = useState(5000)
  const [newPoolPerTxRupees, setNewPoolPerTxRupees] = useState(1000)
  const [newPoolMode, setNewPoolMode] = useState<CanonicalAutonomyMode>('AUTO_APPROVE_WITHIN_LIMITS')

  // New Agent Allocation Form State
  const [newAgentId, setNewAgentId] = useState('agent-shopping-bot-01')
  const [newAgentPoolId, setNewAgentPoolId] = useState('')
  const [newAgentMonthlyRupees, setNewAgentMonthlyRupees] = useState(10000)
  const [newAgentDailyRupees, setNewAgentDailyRupees] = useState(2000)
  const [newAgentPerTxRupees, setNewAgentPerTxRupees] = useState(500)
  const [newAgentAllowedCats, setNewAgentAllowedCats] = useState<string[]>(['SHOPPING'])
  const [newAgentBlockedCats, setNewAgentBlockedCats] = useState<string[]>([])

  // Merchant Override Form State
  const [overrideCategory, setOverrideCategory] = useState<SpendingCategory>('SHOPPING')
  const [overrideReason, setOverrideReason] = useState('Verified corporate vendor agreement')

  // Biometric Token State
  const [biometricToken, setBiometricToken] = useState('passkey_sig_' + Date.now() + '_valid_sha256_approved')

  // ── FETCH DATA FROM AUTHORITATIVE BANK GATE ────────────────────────────────

  const fetchAllData = async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = {
        'x-tenant-id': 'tenant-default',
        'x-customer-ref': 'cust-101',
      }

      // 1. Summary
      const summaryRes = await fetch(`${BANK_GATE_URL}/api/v1/dashboard/summary`, { headers }).catch(() => null)
      if (summaryRes && summaryRes.ok) {
        const sumData = await summaryRes.json()
        setSummary(sumData)
      }

      // 2. Pools
      const poolsRes = await fetch(`${BANK_GATE_URL}/api/v1/category-pools`, { headers }).catch(() => null)
      if (poolsRes && poolsRes.ok) {
        const poolsData = await poolsRes.json()
        setPools(poolsData.pools || [])
        if (poolsData.pools && poolsData.pools.length > 0 && !newAgentPoolId) {
          setNewAgentPoolId(poolsData.pools[0].pool_id)
        }
      }

      // 3. Agent Allocations
      const agentsRes = await fetch(`${BANK_GATE_URL}/api/v1/agents/allocations`, { headers }).catch(() => null)
      if (agentsRes && agentsRes.ok) {
        const agentsData = await agentsRes.json()
        setAgents(agentsData.allocations || [])
      }

      // 4. Merchants
      const merchRes = await fetch(`${BANK_GATE_URL}/api/v1/merchants`).catch(() => null)
      if (merchRes && merchRes.ok) {
        const merchData = await merchRes.json()
        setMerchants(merchData.merchants || [])
      }

      // 5. Approvals Queue
      const appRes = await fetch(`${BANK_GATE_URL}/api/v1/approvals/pending`, { headers }).catch(() => null)
      if (appRes && appRes.ok) {
        const appData = await appRes.json()
        setApprovals(appData.approvals || [])
      }

      // 6. Merkle Batches
      const batchesRes = await fetch(`${BANK_GATE_URL}/api/v1/audit/merkle/batches`).catch(() => null)
      if (batchesRes && batchesRes.ok) {
        const batchData = await batchesRes.json()
        setBatches(batchData.batches || [])
        if (batchData.batches && batchData.batches.length > 0 && !proofBatchId) {
          setProofBatchId(batchData.batches[0].batch_id)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to Bank Gate (:4000)')
      toast.error('Unable to fetch live banking data from Bank Gate')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // ── ACTION HANDLERS ────────────────────────────────────────────────────────

  const handleCreatePool = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionInProgress(true)
    try {
      const res = await fetch(`${BANK_GATE_URL}/api/v1/category-pools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-default',
          'x-customer-ref': 'cust-101',
        },
        body: JSON.stringify({
          category_id: newPoolCategory,
          category_name: newPoolName || `${newPoolCategory.charAt(0) + newPoolCategory.slice(1).toLowerCase()} Pool`,
          monthly_limit_paise: newPoolMonthlyRupees * 100,
          daily_limit_paise: newPoolDailyRupees * 100,
          per_transaction_limit_paise: newPoolPerTxRupees * 100,
          autonomy_mode: newPoolMode,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create budget pool')
      }

      toast.success('Category Budget Pool established successfully')
      setShowCreatePoolModal(false)
      fetchAllData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleTogglePoolStatus = async (pool: UIBudgetPool) => {
    setActionInProgress(true)
    const nextStatus = pool.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE'
    try {
      const res = await fetch(`${BANK_GATE_URL}/api/v1/category-pools/${pool.pool_id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-default',
          'x-customer-ref': 'cust-101',
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) throw new Error('Status update failed')
      toast.success(`Pool ${pool.category_name} is now ${nextStatus}`)
      fetchAllData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleUpdatePoolMode = async (pool: UIBudgetPool, mode: CanonicalAutonomyMode) => {
    setActionInProgress(true)
    try {
      const res = await fetch(`${BANK_GATE_URL}/api/v1/category-pools/${pool.pool_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-default',
          'x-customer-ref': 'cust-101',
        },
        body: JSON.stringify({ autonomy_mode: mode }),
      })
      if (!res.ok) throw new Error('Failed to update autonomy mode')
      toast.success(`Autonomy mode updated to ${mode}`)
      fetchAllData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleCreateAgentAllocation = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionInProgress(true)
    try {
      const res = await fetch(`${BANK_GATE_URL}/api/v1/category-pools/${newAgentPoolId}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-default',
          'x-customer-ref': 'cust-101',
        },
        body: JSON.stringify({
          agent_id: newAgentId,
          agent_limit_paise: newAgentMonthlyRupees * 100,
          monthly_limit_paise: newAgentMonthlyRupees * 100,
          daily_limit_paise: newAgentDailyRupees * 100,
          per_transaction_limit_paise: newAgentPerTxRupees * 100,
          allowed_categories: newAgentAllowedCats,
          blocked_categories: newAgentBlockedCats,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create agent allocation')
      }

      toast.success(`Sub-agent ${newAgentId} quota allocated`)
      setShowCreateAgentModal(false)
      fetchAllData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleSetAgentStatus = async (alloc: UIAgentAllocation, nextStatus: 'ACTIVE' | 'SUSPENDED' | 'REVOKED') => {
    if (nextStatus === 'REVOKED' && !confirm(`Permanently revoke ${alloc.agent_id}? This is a terminal state and cannot be undone.`)) {
      return
    }
    setActionInProgress(true)
    try {
      const res = await fetch(`${BANK_GATE_URL}/api/v1/category-pools/${alloc.pool_id}/agents/${alloc.agent_id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-default',
          'x-customer-ref': 'cust-101',
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Status change failed')
      }
      toast.success(`Agent ${alloc.agent_id} status changed to ${nextStatus}`)
      fetchAllData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleCustomerOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMerchantForOverride) return
    setActionInProgress(true)
    try {
      const res = await fetch(`${BANK_GATE_URL}/api/v1/merchants/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-default',
          'x-customer-ref': 'cust-101',
        },
        body: JSON.stringify({
          merchant_id: selectedMerchantForOverride.merchant_id,
          merchant_name: selectedMerchantForOverride.merchant_name,
          assigned_category: overrideCategory,
          reason: overrideReason,
        }),
      })
      if (!res.ok) throw new Error('Override failed')
      toast.success(`Customer override applied for ${selectedMerchantForOverride.merchant_name}`)
      setShowOverrideModal(false)
      fetchAllData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleServerSideApprove = async () => {
    if (!showApproveModal) return
    setActionInProgress(true)
    try {
      const res = await fetch(`${BANK_GATE_URL}/api/v1/category-reservations/${showApproveModal.reservation_id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-ref': 'cust-101',
        },
        body: JSON.stringify({
          transaction_digest: showApproveModal.transaction_digest,
          biometric_signature: biometricToken,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Biometric server-side verification failed')
      }

      toast.success(`Transaction ${showApproveModal.reservation_id} approved via Passkey signature`)
      setShowApproveModal(null)
      fetchAllData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleVerifyMerkleProof = async () => {
    setVerifyingProof(true)
    setProofResult(null)
    try {
      // 1. Fetch proof
      const proofRes = await fetch(`${BANK_GATE_URL}/api/v1/audit/merkle/proofs/${proofEventId || 'audit_sample'}?batch_id=${proofBatchId}`)
      if (!proofRes.ok) {
        const err = await proofRes.json()
        throw new Error(err.error || 'Failed to fetch Merkle proof')
      }
      const proof = await proofRes.json()

      // 2. Verify proof server-side
      const verifyRes = await fetch(`${BANK_GATE_URL}/api/v1/audit/merkle/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: proof.batch_id,
          event_id: proof.event_id,
          leaf_hash: proof.leaf_hash,
          merkle_proof: proof.audit_path,
          merkle_root: proof.merkle_root,
          leaf_index: proof.leaf_index,
        }),
      })

      const verifyData = await verifyRes.json()
      setProofResult(verifyData)
      if (verifyData.valid) {
        toast.success('Merkle inclusion proof verified cryptographically!')
      } else {
        toast.error(`Verification rejected: ${verifyData.verification_status}`)
      }
    } catch (err: any) {
      toast.error(err.message)
      setProofResult({ valid: false, details: err.message, verification_status: 'ERROR' })
    } finally {
      setVerifyingProof(false)
    }
  }

  // ── FILTERED DATA ──────────────────────────────────────────────────────────

  const filteredMerchants = useMemo(() => {
    return merchants.filter((m) => {
      const matchesSearch =
        m.merchant_name.toLowerCase().includes(merchantSearch.toLowerCase()) ||
        m.merchant_id.toLowerCase().includes(merchantSearch.toLowerCase()) ||
        m.mcc_code.includes(merchantSearch)
      const matchesCat = merchantCategoryFilter === 'ALL' || m.category_id === merchantCategoryFilter
      return matchesSearch && matchesCat
    })
  }, [merchants, merchantSearch, merchantCategoryFilter])

  const filteredAgents = useMemo(() => {
    return agents.filter((a) => a.agent_id.toLowerCase().includes(agentSearch.toLowerCase()))
  }, [agents, agentSearch])

  // ── RENDER COMPONENT ───────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── TOP HEADER & NAVIGATION TABS ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground tracking-tight">AgentGuard Sovereign Budget Console</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-semibold uppercase">
                Bank Gate :4000 Connected
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Multi-Agent Quota Governance, Merchant Intelligence, Invariant I1 Enforcement &amp; Merkle Inclusion Audits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border flex items-center gap-1.5 transition active:scale-95"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh State</span>
          </button>
          <button
            onClick={() => setShowCreatePoolModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition shadow-sm active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Budget Pool</span>
          </button>
        </div>
      </div>

      {/* ── ERROR BANNER (IF ANY) ────────────────────────────────────────── */}
      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Bank Gate Connection Warning</p>
              <p className="text-xs opacity-90">{error}</p>
            </div>
          </div>
          <button
            onClick={fetchAllData}
            className="px-3 py-1 rounded text-xs font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── 6-TAB NAVIGATION BAR ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-1 text-sm">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-t-lg font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === 'overview'
              ? 'border-primary text-primary bg-primary/5 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Executive Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('pools')}
          className={`px-4 py-2 rounded-t-lg font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === 'pools'
              ? 'border-primary text-primary bg-primary/5 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wallet className="h-4 w-4" />
          <span>Category Pools ({pools.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('agents')}
          className={`px-4 py-2 rounded-t-lg font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === 'agents'
              ? 'border-primary text-primary bg-primary/5 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Multi-Agent Quotas ({agents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('merchants')}
          className={`px-4 py-2 rounded-t-lg font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === 'merchants'
              ? 'border-primary text-primary bg-primary/5 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Merchant Intelligence ({merchants.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2 rounded-t-lg font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === 'approvals'
              ? 'border-primary text-primary bg-primary/5 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Approvals &amp; Exceptions ({approvals.length})</span>
          {approvals.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('merkle')}
          className={`px-4 py-2 rounded-t-lg font-medium transition flex items-center gap-2 border-b-2 ${
            activeTab === 'merkle'
              ? 'border-primary text-primary bg-primary/5 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <GitBranch className="h-4 w-4" />
          <span>Merkle Explorer &amp; Notary</span>
        </button>
      </div>

      {/* ── TAB 1: EXECUTIVE OVERVIEW ────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Customer Budget</span>
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2 font-mono">
                {formatPaise(summary?.total_budget_paise ?? 0)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Aggregated across {summary?.pools_count ?? pools.length} active pools</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Settled Spend</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2 font-mono text-emerald-500">
                {formatPaise(summary?.total_settled_paise ?? 0)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Confirmed on TigerBeetle ledger</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Reserved Capacity</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2 font-mono text-amber-500">
                {formatPaise(summary?.total_reserved_paise ?? 0)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Held for pending agent permits (TTL 90s)</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available Budget</span>
                <ShieldCheck className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-2 font-mono text-blue-500">
                {formatPaise(summary?.available_budget_paise ?? 0)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 font-mono">Limit - Settled - Reserved</p>
            </div>
          </div>

          {/* Operational Status Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold">
                {summary?.active_agents_count ?? agents.filter((a) => a.status === 'ACTIVE').length}
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Active Autonomous Agents</div>
                <div className="text-sm font-bold text-foreground">
                  {summary?.active_delegations_count ?? agents.length} Delegations Configured
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
                {summary?.pending_customer_approvals_count ?? approvals.length}
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Escalated Approvals (ASK)</div>
                <div className="text-sm font-bold text-foreground">
                  {approvals.length === 0 ? 'No pending exceptions' : 'Human-in-the-loop review required'}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                <Hash className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Merkle Audit &amp; Witness</div>
                <div className="text-sm font-bold text-foreground">
                  {batches.length} Batches Anchored (:5000)
                </div>
              </div>
            </div>
          </div>

          {/* Category Breakdown Progress Grid */}
          <div className="p-5 rounded-xl bg-card border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Category Spending &amp; Capacity Breakdown</h3>
                <p className="text-xs text-muted-foreground">Real-time authoritative multi-period budget utilization</p>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                Formula: Available = Limit - Settled - Reserved
              </span>
            </div>

            {pools.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No category pools configured yet. Click "New Budget Pool" above to establish your first sovereign allocation.
              </div>
            ) : (
              <div className="space-y-4">
                {pools.map((p) => {
                  const monthlyPaise = p.monthly_limit_paise
                  const spentPaise = summary?.category_breakdown?.find((c) => c.pool_id === p.pool_id)?.settled_paise ?? 0
                  const reservedPaise = summary?.category_breakdown?.find((c) => c.pool_id === p.pool_id)?.reserved_paise ?? 0
                  const availablePaise = Math.max(0, monthlyPaise - spentPaise - reservedPaise)
                  const pct = monthlyPaise > 0 ? Math.min(100, Math.round(((spentPaise + reservedPaise) / monthlyPaise) * 100)) : 0

                  return (
                    <div key={p.pool_id} className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{p.category_name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary">
                            {p.autonomy_mode}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${p.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                            {p.status}
                          </span>
                        </div>
                        <div className="font-mono text-muted-foreground">
                          {formatPaise(spentPaise + reservedPaise)} / {formatPaise(monthlyPaise)} ({pct}%)
                        </div>
                      </div>

                      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden flex">
                        <div
                          className="bg-emerald-500 transition-all duration-300"
                          style={{ width: `${(spentPaise / monthlyPaise) * 100}%` }}
                          title={`Settled: ${formatPaise(spentPaise)}`}
                        />
                        <div
                          className="bg-amber-500 transition-all duration-300"
                          style={{ width: `${(reservedPaise / monthlyPaise) * 100}%` }}
                          title={`Reserved: ${formatPaise(reservedPaise)}`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span>Settled: {formatPaise(spentPaise)}</span>
                        <span>Reserved: {formatPaise(reservedPaise)}</span>
                        <span className="font-bold text-foreground">Available: {formatPaise(availablePaise)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: CATEGORY POOLS MANAGEMENT ─────────────────────────────── */}
      {activeTab === 'pools' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">Category Budget Pools</h3>
              <p className="text-xs text-muted-foreground">Authoritative limits enforced at Bank Gate (:4000) before permit signing</p>
            </div>
            <button
              onClick={() => setShowCreatePoolModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Pool</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pools.map((pool) => (
              <div key={pool.pool_id} className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-sm flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      {pool.category_name}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      pool.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
                    }`}>
                      {pool.status}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground font-mono">
                    ID: {pool.pool_id} | Policy v{pool.policy_version}
                  </div>

                  <div className="pt-2 border-t border-border space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monthly Cap:</span>
                      <span className="font-mono font-bold text-foreground">{formatPaise(pool.monthly_limit_paise)}</span>
                    </div>
                    {pool.daily_limit_paise && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Daily Cap:</span>
                        <span className="font-mono text-foreground">{formatPaise(pool.daily_limit_paise)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Per-Tx Cap:</span>
                      <span className="font-mono text-foreground">{formatPaise(pool.per_transaction_limit_paise)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="text-xs font-semibold text-muted-foreground">Autonomy Mode:</div>
                  <select
                    value={pool.autonomy_mode}
                    onChange={(e) => handleUpdatePoolMode(pool, e.target.value as CanonicalAutonomyMode)}
                    disabled={actionInProgress}
                    className="w-full text-xs p-1.5 rounded-lg bg-background border border-border text-foreground font-medium focus:ring-1 focus:ring-primary"
                  >
                    <option value="AUTO_APPROVE_WITHIN_LIMITS">AUTO_APPROVE_WITHIN_LIMITS</option>
                    <option value="ASK_BEFORE_EVERY_PAYMENT">ASK_BEFORE_EVERY_PAYMENT</option>
                    <option value="MANUAL_ONLY">MANUAL_ONLY</option>
                  </select>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleTogglePoolStatus(pool)}
                      disabled={actionInProgress}
                      className={`w-full py-1.5 rounded-lg text-xs font-semibold transition border flex items-center justify-center gap-1.5 ${
                        pool.status === 'ACTIVE'
                          ? 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20'
                          : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                    >
                      {pool.status === 'ACTIVE' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      <span>{pool.status === 'ACTIVE' ? 'Freeze Pool' : 'Reactivate Pool'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: MULTI-AGENT QUOTAS ────────────────────────────────────── */}
      {activeTab === 'agents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-foreground">Multi-Agent Quotas &amp; Delegations</h3>
              <p className="text-xs text-muted-foreground">
                Sub-agent limits validated against parent category pool ceilings. Deny-first precedence on blocked categories.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search agent ID..."
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                className="text-xs p-1.5 rounded-lg bg-background border border-border text-foreground w-48"
              />
              <button
                onClick={() => setShowCreateAgentModal(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Assign Agent Quota</span>
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Agent ID</th>
                    <th className="p-3">Parent Pool</th>
                    <th className="p-3">Monthly Limit</th>
                    <th className="p-3">Daily Limit</th>
                    <th className="p-3">Per-Tx Limit</th>
                    <th className="p-3">Usage (Spent / Reserved)</th>
                    <th className="p-3">Allowed Categories</th>
                    <th className="p-3">Blocked Categories</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-muted-foreground">
                        No sub-agent quotas configured. Click "Assign Agent Quota" to delegate controlled spending.
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map((agent) => (
                      <tr key={agent.allocation_id} className="hover:bg-muted/30 transition">
                        <td className="p-3 font-mono font-bold text-foreground">{agent.agent_id}</td>
                        <td className="p-3 font-mono text-muted-foreground">{agent.pool_id}</td>
                        <td className="p-3 font-mono font-bold text-foreground">{formatPaise(agent.agent_limit_paise)}</td>
                        <td className="p-3 font-mono text-foreground">{formatPaise(agent.daily_limit_paise)}</td>
                        <td className="p-3 font-mono text-foreground">{formatPaise(agent.per_transaction_limit_paise)}</td>
                        <td className="p-3 font-mono">
                          <span className="text-emerald-500">{formatPaise(agent.spent_amount_paise)}</span> /{' '}
                          <span className="text-amber-500">{formatPaise(agent.reserved_amount_paise)}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {JSON.parse(agent.allowed_categories || '[]').map((cat: string) => (
                              <span key={cat} className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary">
                                {cat}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {JSON.parse(agent.blocked_categories || '[]').map((cat: string) => (
                              <span key={cat} className="px-1.5 py-0.5 rounded text-[10px] bg-destructive/10 text-destructive">
                                {cat}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              agent.status === 'ACTIVE'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : agent.status === 'SUSPENDED'
                                ? 'bg-amber-500/10 text-amber-500'
                                : 'bg-destructive/10 text-destructive'
                            }`}
                          >
                            {agent.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {agent.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleSetAgentStatus(agent, 'SUSPENDED')}
                                disabled={actionInProgress}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                              >
                                Suspend
                              </button>
                            )}
                            {agent.status === 'SUSPENDED' && (
                              <button
                                onClick={() => handleSetAgentStatus(agent, 'ACTIVE')}
                                disabled={actionInProgress}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                              >
                                Resume
                              </button>
                            )}
                            {agent.status !== 'REVOKED' && (
                              <button
                                onClick={() => handleSetAgentStatus(agent, 'REVOKED')}
                                disabled={actionInProgress}
                                className="px-2 py-1 rounded text-[10px] font-bold bg-destructive/10 text-destructive hover:bg-destructive/20"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: MERCHANT INTELLIGENCE ─────────────────────────────────── */}
      {activeTab === 'merchants' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-foreground">Authoritative Merchant Intelligence Registry</h3>
              <p className="text-xs text-muted-foreground">
                ISO 18245 MCC Normalization, 5-Tier Evidence Hierarchy &amp; Non-Authoritative AI Advisory Boundary
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search merchant, MCC..."
                value={merchantSearch}
                onChange={(e) => setMerchantSearch(e.target.value)}
                className="text-xs p-1.5 rounded-lg bg-background border border-border text-foreground w-48"
              />
              <select
                value={merchantCategoryFilter}
                onChange={(e) => setMerchantCategoryFilter(e.target.value)}
                className="text-xs p-1.5 rounded-lg bg-background border border-border text-foreground"
              >
                <option value="ALL">All Categories</option>
                <option value="SHOPPING">SHOPPING</option>
                <option value="TRANSPORT">TRANSPORT</option>
                <option value="UTILITIES">UTILITIES</option>
                <option value="FOOD_DINING">FOOD_DINING</option>
                <option value="HEALTHCARE">HEALTHCARE</option>
              </select>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Merchant Name</th>
                    <th className="p-3">MCC</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Evidence Tier</th>
                    <th className="p-3">Verification Source</th>
                    <th className="p-3">Confidence Basis</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Customer Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMerchants.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        No merchants matched search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredMerchants.map((merch) => (
                      <tr key={merch.merchant_id} className="hover:bg-muted/30 transition">
                        <td className="p-3 font-bold text-foreground">{merch.merchant_name}</td>
                        <td className="p-3 font-mono">{merch.mcc_code}</td>
                        <td className="p-3 font-mono text-primary">{merch.category_id}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                              merch.evidence_tier === 'AUTHORITATIVE_RAIL'
                                ? 'bg-purple-500/10 text-purple-500'
                                : merch.evidence_tier === 'REGULATORY_REGISTRY'
                                ? 'bg-blue-500/10 text-blue-500'
                                : merch.evidence_tier === 'CUSTOMER_OVERRIDE'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {merch.evidence_tier}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{merch.verification_source}</td>
                        <td className="p-3 text-muted-foreground max-w-xs truncate">{merch.confidence_basis}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              merch.status === 'VERIFIED'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : merch.status === 'PROVISIONAL'
                                ? 'bg-amber-500/10 text-amber-500'
                                : 'bg-destructive/10 text-destructive'
                            }`}
                          >
                            {merch.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedMerchantForOverride(merch)
                              setOverrideCategory(merch.category_id)
                              setShowOverrideModal(true)
                            }}
                            className="px-2 py-1 rounded text-[10px] font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border"
                          >
                            Override
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: APPROVALS & EXCEPTIONS CENTER ─────────────────────────── */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-bold text-foreground">Approvals &amp; Exception Center</h3>
            <p className="text-xs text-muted-foreground">
              Server-side transaction-bound approval verification with WebAuthn/Passkey signatures. A simple frontend button never self-authorizes spend.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border font-bold text-sm flex items-center justify-between">
              <span>Pending Human-in-the-Loop Reviews (ASK Escalations)</span>
              <span className="text-xs font-mono text-muted-foreground">{approvals.length} Requests</span>
            </div>

            <div className="divide-y divide-border">
              {approvals.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm space-y-1">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-foreground">Zero Pending Exceptions</p>
                  <p className="text-xs">All agent transaction permits are executing cleanly within defined budget bounds.</p>
                </div>
              ) : (
                approvals.map((app) => (
                  <div key={app.reservation_id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-muted/20 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground text-sm">{app.reservation_id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-500 font-bold">
                          {app.saga_state}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">Agent: {app.agent_id}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Category: <strong className="text-foreground">{app.category_id}</strong> | Amount:{' '}
                        <strong className="text-foreground font-mono text-sm">{formatPaise(app.amount_paise)}</strong>
                      </div>
                      <div className="text-xs text-destructive flex items-center gap-1 font-mono">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Violations: {app.violations || 'Autonomy policy mandates customer consent'}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowApproveModal(app)}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition shrink-0 shadow-sm"
                    >
                      <Fingerprint className="h-4 w-4" />
                      <span>Review &amp; Sign Passkey Approval</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 6: MERKLE EXPLORER & NOTARY ──────────────────────────────── */}
      {activeTab === 'merkle' && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">Cryptographic Merkle Tree Audit Explorer</h3>
                <p className="text-xs text-muted-foreground">
                  Versioned RFC 6962 &amp; AgentGuard V1 Merkle Proof Verification with Independent Witness Notary (:5000)
                </p>
              </div>
              <span className="px-2.5 py-1 rounded text-xs font-mono bg-purple-500/10 text-purple-500 border border-purple-500/20 font-bold">
                AGENTGUARD_MERKLE_V1
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Select Batch ID:</label>
                <select
                  value={proofBatchId}
                  onChange={(e) => setProofBatchId(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                >
                  {batches.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>
                      {b.batch_id} ({b.leaf_count} leaves)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Audit Event ID:</label>
                <input
                  type="text"
                  placeholder="e.g. audit_1795218000"
                  value={proofEventId}
                  onChange={(e) => setProofEventId(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleVerifyMerkleProof}
                  disabled={verifyingProof || !proofBatchId}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <GitBranch className="h-4 w-4" />
                  <span>{verifyingProof ? 'Verifying Math...' : 'Verify Inclusion Proof'}</span>
                </button>
              </div>
            </div>

            {proofResult && (
              <div className={`p-4 rounded-xl border space-y-2 font-mono text-xs ${
                proofResult.valid
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  : 'bg-destructive/10 border-destructive/20 text-destructive'
              }`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                  {proofResult.valid ? <CheckCheck className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <span>{proofResult.valid ? 'CRYPTOGRAPHIC INCLUSION VERIFIED' : 'VERIFICATION FAILED'}</span>
                </div>
                <div>Status: {proofResult.verification_status}</div>
                <div>Details: {proofResult.details}</div>
              </div>
            )}
          </div>

          {/* Batches Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border font-bold text-sm">Anchored Merkle Batches</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Batch ID</th>
                    <th className="p-3">Merkle Root Hash</th>
                    <th className="p-3">Sequence Range</th>
                    <th className="p-3">Leaf Count</th>
                    <th className="p-3">Witness Checkpoint</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No Merkle batches anchored yet. Complete audit events to trigger automatic batching.
                      </td>
                    </tr>
                  ) : (
                    batches.map((batch) => (
                      <tr key={batch.batch_id} className="hover:bg-muted/30 transition">
                        <td className="p-3 font-mono font-bold text-foreground">{batch.batch_id}</td>
                        <td className="p-3 font-mono text-xs text-primary max-w-xs truncate">{batch.merkle_root}</td>
                        <td className="p-3 font-mono">
                          #{batch.start_sequence} - #{batch.end_sequence}
                        </td>
                        <td className="p-3 font-mono">{batch.leaf_count} events</td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {batch.witness_checkpoint_id || 'LOCAL_ANCHOR'}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(batch.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE CATEGORY BUDGET POOL ───────────────────────────── */}
      {showCreatePoolModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-lg space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span>Establish Category Budget Pool</span>
              </h3>
              <button
                onClick={() => setShowCreatePoolModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePool} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Category:</label>
                <select
                  value={newPoolCategory}
                  onChange={(e) => setNewPoolCategory(e.target.value as SpendingCategory)}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                >
                  <option value="SHOPPING">SHOPPING</option>
                  <option value="TRANSPORT">TRANSPORT</option>
                  <option value="UTILITIES">UTILITIES</option>
                  <option value="FOOD_DINING">FOOD_DINING</option>
                  <option value="HEALTHCARE">HEALTHCARE</option>
                  <option value="TRAVEL">TRAVEL</option>
                  <option value="EDUCATION">EDUCATION</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Display Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Corporate Cloud SaaS"
                  value={newPoolName}
                  onChange={(e) => setNewPoolName(e.target.value)}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Monthly Cap (₹):</label>
                  <input
                    type="number"
                    value={newPoolMonthlyRupees}
                    onChange={(e) => setNewPoolMonthlyRupees(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Daily Cap (₹):</label>
                  <input
                    type="number"
                    value={newPoolDailyRupees}
                    onChange={(e) => setNewPoolDailyRupees(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Per-Transaction Limit (₹):</label>
                <input
                  type="number"
                  value={newPoolPerTxRupees}
                  onChange={(e) => setNewPoolPerTxRupees(Number(e.target.value))}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Autonomy Mode:</label>
                <select
                  value={newPoolMode}
                  onChange={(e) => setNewPoolMode(e.target.value as CanonicalAutonomyMode)}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground"
                >
                  <option value="AUTO_APPROVE_WITHIN_LIMITS">AUTO_APPROVE_WITHIN_LIMITS</option>
                  <option value="ASK_BEFORE_EVERY_PAYMENT">ASK_BEFORE_EVERY_PAYMENT</option>
                  <option value="MANUAL_ONLY">MANUAL_ONLY</option>
                </select>
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePoolModal(false)}
                  className="px-3 py-1.5 rounded-lg font-semibold bg-secondary text-secondary-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionInProgress}
                  className="px-4 py-1.5 rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Confirm Pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ASSIGN SUB-AGENT ALLOCATION ────────────────────────────── */}
      {showCreateAgentModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-lg space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span>Assign Sub-Agent Quota</span>
              </h3>
              <button
                onClick={() => setShowCreateAgentModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAgentAllocation} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Agent ID:</label>
                <input
                  type="text"
                  value={newAgentId}
                  onChange={(e) => setNewAgentId(e.target.value)}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Parent Category Pool:</label>
                <select
                  value={newAgentPoolId}
                  onChange={(e) => setNewAgentPoolId(e.target.value)}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                >
                  {pools.map((p) => (
                    <option key={p.pool_id} value={p.pool_id}>
                      {p.category_name} (Cap: {formatPaise(p.monthly_limit_paise)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Monthly Limit (₹):</label>
                  <input
                    type="number"
                    value={newAgentMonthlyRupees}
                    onChange={(e) => setNewAgentMonthlyRupees(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground">Daily Limit (₹):</label>
                  <input
                    type="number"
                    value={newAgentDailyRupees}
                    onChange={(e) => setNewAgentDailyRupees(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Per-Tx Limit (₹):</label>
                <input
                  type="number"
                  value={newAgentPerTxRupees}
                  onChange={(e) => setNewAgentPerTxRupees(Number(e.target.value))}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                />
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateAgentModal(false)}
                  className="px-3 py-1.5 rounded-lg font-semibold bg-secondary text-secondary-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionInProgress}
                  className="px-4 py-1.5 rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Assign Quota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CUSTOMER MERCHANT OVERRIDE ────────────────────────────── */}
      {showOverrideModal && selectedMerchantForOverride && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-lg space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Customer Merchant Override</span>
              </h3>
              <button
                onClick={() => setShowOverrideModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCustomerOverride} className="space-y-3 text-xs">
              <div>
                <span className="text-muted-foreground">Merchant: </span>
                <strong className="text-foreground">{selectedMerchantForOverride.merchant_name}</strong>{' '}
                <span className="font-mono text-muted-foreground">({selectedMerchantForOverride.mcc_code})</span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Target Category Pool:</label>
                <select
                  value={overrideCategory}
                  onChange={(e) => setOverrideCategory(e.target.value as SpendingCategory)}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono"
                >
                  <option value="SHOPPING">SHOPPING</option>
                  <option value="TRANSPORT">TRANSPORT</option>
                  <option value="UTILITIES">UTILITIES</option>
                  <option value="FOOD_DINING">FOOD_DINING</option>
                  <option value="HEALTHCARE">HEALTHCARE</option>
                  <option value="TRAVEL">TRAVEL</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Audit Reason:</label>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground"
                />
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="px-3 py-1.5 rounded-lg font-semibold bg-secondary text-secondary-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionInProgress}
                  className="px-4 py-1.5 rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Save Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PASSKEY APPROVAL REVIEW ───────────────────────────────── */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full shadow-lg space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-primary" />
                <span>Biometric Passkey Authorization</span>
              </h3>
              <button
                onClick={() => setShowApproveModal(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-muted/40 border border-border/80 space-y-1 font-mono">
                <div>Reservation ID: <strong className="text-foreground">{showApproveModal.reservation_id}</strong></div>
                <div>Amount: <strong className="text-foreground text-sm">{formatPaise(showApproveModal.amount_paise)}</strong></div>
                <div>Agent: <span className="text-foreground">{showApproveModal.agent_id}</span></div>
                <div>Category: <span className="text-foreground">{showApproveModal.category_id}</span></div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Digest: {showApproveModal.transaction_digest}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Simulated WebAuthn Signature Token:</label>
                <input
                  type="text"
                  value={biometricToken}
                  onChange={(e) => setBiometricToken(e.target.value)}
                  className="w-full p-2 rounded-lg bg-background border border-border text-foreground font-mono text-[11px]"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                In accordance with Security Invariant I3, this action verifies customer consent server-side using a transaction-bound cryptographic signature.
              </p>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowApproveModal(null)}
                  className="px-3 py-1.5 rounded-lg font-semibold bg-secondary text-secondary-foreground"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={handleServerSideApprove}
                  disabled={actionInProgress}
                  className="px-4 py-1.5 rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span>Authorize &amp; Issue Permit</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
