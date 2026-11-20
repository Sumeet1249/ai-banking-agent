'use client'

import React, { useState } from 'react'
import {
  Wallet, ShoppingBag, Car, Zap, Utensils, HeartPulse, TrendingUp,
  Film, HelpCircle, Check, AlertTriangle, Lock, Unlock, Sparkles,
  Sliders, Plus, Edit3, ArrowRight, ShieldCheck, ChevronRight,
  RefreshCw, CheckCircle2, XCircle, ShieldAlert, Users, Layers, Activity
} from 'lucide-react'
import { toast } from 'sonner'
import {
  SpendingCategory,
  CanonicalAutonomyMode,
} from '@agentguard/core-schema'

export interface UIBudgetPool {
  id: string
  category: SpendingCategory
  displayName: string
  monthlyCapPaise: number
  weeklyCapPaise?: number
  dailyCapPaise?: number
  singleTxCapPaise: number
  spentPaise: number
  reservedPaise: number
  policyMode: CanonicalAutonomyMode
  status: 'ACTIVE' | 'EXHAUSTED' | 'FROZEN' | 'EXPIRED'
  color: string
  iconName: string
  policyVersion: number
  timezone: string
}

const INITIAL_POOLS: UIBudgetPool[] = [
  {
    id: 'pool_shopping',
    category: 'SHOPPING',
    displayName: 'Shopping & E-Commerce',
    monthlyCapPaise: 5000000, // ₹50,000
    weeklyCapPaise: 2000000,  // ₹20,000
    dailyCapPaise: 500000,    // ₹5,000
    singleTxCapPaise: 100000, // ₹1,000
    spentPaise: 1420000,      // ₹14,200
    reservedPaise: 250000,    // ₹2,500
    policyMode: 'ASK_BEFORE_EVERY_PAYMENT',
    status: 'ACTIVE',
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    iconName: 'ShoppingBag',
    policyVersion: 1,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'pool_transport',
    category: 'TRANSPORT',
    displayName: 'Transport, Fuel & Rides',
    monthlyCapPaise: 2500000, // ₹25,000
    weeklyCapPaise: 1000000,  // ₹10,000
    dailyCapPaise: 300000,    // ₹3,000
    singleTxCapPaise: 150000, // ₹1,500
    spentPaise: 840000,       // ₹8,400
    reservedPaise: 0,
    policyMode: 'AUTO_APPROVE_WITHIN_LIMITS',
    status: 'ACTIVE',
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    iconName: 'Car',
    policyVersion: 1,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'pool_utilities',
    category: 'UTILITIES',
    displayName: 'Utilities, Cloud & SaaS',
    monthlyCapPaise: 3000000, // ₹30,000
    weeklyCapPaise: 1500000,  // ₹15,000
    dailyCapPaise: 500000,    // ₹5,000
    singleTxCapPaise: 1000000, // ₹10,000
    spentPaise: 950000,       // ₹9,500
    reservedPaise: 0,
    policyMode: 'AUTO_APPROVE_WITHIN_LIMITS',
    status: 'ACTIVE',
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    iconName: 'Zap',
    policyVersion: 1,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'pool_dining',
    category: 'FOOD_DINING',
    displayName: 'Food & Meal Procurement',
    monthlyCapPaise: 1500000, // ₹15,000
    weeklyCapPaise: 600000,   // ₹6,000
    dailyCapPaise: 200000,    // ₹2,000
    singleTxCapPaise: 100000, // ₹1,000
    spentPaise: 420000,       // ₹4,200
    reservedPaise: 80000,     // ₹800
    policyMode: 'AUTO_APPROVE_WITHIN_LIMITS',
    status: 'ACTIVE',
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    iconName: 'Utensils',
    policyVersion: 1,
    timezone: 'Asia/Kolkata',
  },
  {
    id: 'pool_invest',
    category: 'INVESTMENT_STOCK',
    displayName: 'Capital Allocation & Treasury',
    monthlyCapPaise: 10000000, // ₹1,00,000
    weeklyCapPaise: 5000000,  // ₹50,000
    dailyCapPaise: 2500000,   // ₹25,000
    singleTxCapPaise: 2500000, // ₹25,000
    spentPaise: 0,
    reservedPaise: 0,
    policyMode: 'MANUAL_ONLY',
    status: 'ACTIVE',
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    iconName: 'TrendingUp',
    policyVersion: 1,
    timezone: 'Asia/Kolkata',
  },
]

export function AnonymousBudgetPoolsView() {
  const [pools, setPools] = useState<UIBudgetPool[]>(INITIAL_POOLS)
  const [selectedPool, setSelectedPool] = useState<UIBudgetPool>(INITIAL_POOLS[0])
  const [editingCap, setEditingCap] = useState<boolean>(false)
  const [tempCapRupees, setTempCapRupees] = useState<number>(50000)
  const [tempSingleTxRupees, setTempSingleTxRupees] = useState<number>(1000)
  const [activeTab, setActiveTab] = useState<'pools' | 'allocations'>('pools')

  // Calculate aggregates
  const totalAllocatedPaise = pools.reduce((acc, p) => acc + p.monthlyCapPaise, 0)
  const totalSpentPaise = pools.reduce((acc, p) => acc + p.spentPaise, 0)
  const totalReservedPaise = pools.reduce((acc, p) => acc + p.reservedPaise, 0)
  const availableBudgetPaise = totalAllocatedPaise - (totalSpentPaise + totalReservedPaise)

  const setAutonomyMode = (poolId: string, mode: CanonicalAutonomyMode) => {
    setPools(prev => prev.map(p => {
      if (p.id === poolId) {
        const updated: UIBudgetPool = {
          ...p,
          policyMode: mode,
          policyVersion: p.policyVersion + 1
        }
        if (selectedPool.id === poolId) setSelectedPool(updated)
        toast.success(`Updated ${p.displayName}`, {
          description: mode === 'AUTO_APPROVE_WITHIN_LIMITS'
            ? 'Autonomous spending active within limits without human disruption.'
            : mode === 'ASK_BEFORE_EVERY_PAYMENT'
              ? 'Agent will request customer passkey authorization for every payment.'
              : 'Autonomous payment execution prohibited (Draft & Review Only).'
        })
        return updated
      }
      return p
    }))
  }

  const handleUpdateCap = (poolId: string) => {
    const newMonthlyPaise = tempCapRupees * 100
    const newSingleTxPaise = tempSingleTxRupees * 100

    if (newSingleTxPaise > newMonthlyPaise) {
      toast.error('Validation Error', {
        description: 'Single transaction limit cannot exceed monthly budget limit (Rule I2).'
      })
      return
    }

    setPools(prev => prev.map(p => {
      if (p.id === poolId) {
        const updated: UIBudgetPool = {
          ...p,
          monthlyCapPaise: newMonthlyPaise,
          singleTxCapPaise: newSingleTxPaise,
          policyVersion: p.policyVersion + 1
        }
        setSelectedPool(updated)
        toast.success('Budget Policy Updated', {
          description: `Monthly cap: ₹${tempCapRupees.toLocaleString('en-IN')}, Single Tx: ₹${tempSingleTxRupees.toLocaleString('en-IN')} (Policy v${updated.policyVersion})`
        })
        return updated
      }
      return p
    }))
    setEditingCap(false)
  }

  return (
    <div className="space-y-6">
      {/* Top Metric Cards - Executive Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-md shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-mono">
            <span>TOTAL ALLOCATED BUDGET</span>
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
            ₹{(totalAllocatedPaise / 100).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
            <span>5 Active Categories</span>
            <span className="text-emerald-500 font-semibold">• Monthly Asia/Kolkata</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-md shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-mono">
            <span>AVAILABLE CAPACITY</span>
            <Unlock className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-emerald-400">
            ₹{(availableBudgetPaise / 100).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {Math.round((availableBudgetPaise / totalAllocatedPaise) * 100)}% uncommitted headroom
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-md shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-mono">
            <span>ACTIVE RESERVATIONS</span>
            <Activity className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-amber-400">
            ₹{(totalReservedPaise / 100).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Atomic 90s TTL bank locks
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-md shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-mono">
            <span>SETTLED SPEND (MTD)</span>
            <CheckCircle2 className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-purple-400">
            ₹{(totalSpentPaise / 100).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {Math.round((totalSpentPaise / totalAllocatedPaise) * 100)}% utilization
          </div>
        </div>
      </div>

      {/* Main Budget Pools Workspace */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
        {/* Navigation & Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">
                Autonomous Category Budget Pools &amp; Governance
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary font-bold border border-primary/20">
                Authoritative Bank Gate :4000
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Autonomous spending authority segregated across MCC-bound categories. Strict fail-closed limits, atomic reservations, and human approval gates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('pools')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'pools'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              Category Pools
            </button>
            <button
              onClick={() => setActiveTab('allocations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'allocations'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              Agent Allocations
            </button>
          </div>
        </div>

        {activeTab === 'pools' ? (
          <>
            {/* Pools Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pools.map((pool) => {
                const spentRupees = pool.spentPaise / 100
                const reservedRupees = pool.reservedPaise / 100
                const capRupees = pool.monthlyCapPaise / 100
                const percentUsed = Math.min(100, Math.round(((spentRupees + reservedRupees) / capRupees) * 100))
                const isSelected = selectedPool.id === pool.id

                return (
                  <div
                    key={pool.id}
                    onClick={() => {
                      setSelectedPool(pool)
                      setTempCapRupees(pool.monthlyCapPaise / 100)
                      setTempSingleTxRupees(pool.singleTxCapPaise / 100)
                    }}
                    className={`cursor-pointer rounded-xl border p-4.5 transition-all duration-200 ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/30'
                        : 'border-border bg-card/40 hover:border-border/80 hover:bg-card/70'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-lg border ${pool.color}`}>
                          {pool.category === 'SHOPPING' && <ShoppingBag className="h-4 w-4" />}
                          {pool.category === 'TRANSPORT' && <Car className="h-4 w-4" />}
                          {pool.category === 'UTILITIES' && <Zap className="h-4 w-4" />}
                          {pool.category === 'FOOD_DINING' && <Utensils className="h-4 w-4" />}
                          {pool.category === 'INVESTMENT_STOCK' && <TrendingUp className="h-4 w-4" />}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground leading-tight">
                            {pool.displayName}
                          </h4>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {pool.category} • v{pool.policyVersion}
                          </span>
                        </div>
                      </div>

                      {/* Autonomy Badge */}
                      <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                        pool.policyMode === 'AUTO_APPROVE_WITHIN_LIMITS'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : pool.policyMode === 'ASK_BEFORE_EVERY_PAYMENT'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {pool.policyMode === 'AUTO_APPROVE_WITHIN_LIMITS' ? 'AUTO-APPROVE' : pool.policyMode === 'ASK_BEFORE_EVERY_PAYMENT' ? 'ASK PASSKEY' : 'MANUAL ONLY'}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">Monthly Utilization</span>
                        <span className="font-bold text-foreground">{percentUsed}%</span>
                      </div>
                      <div className="h-2 w-full bg-secondary/80 rounded-full overflow-hidden flex">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${Math.round((spentRupees / capRupees) * 100)}%` }}
                        />
                        {reservedRupees > 0 && (
                          <div
                            className="bg-amber-500 h-full transition-all duration-300 opacity-80"
                            style={{ width: `${Math.round((reservedRupees / capRupees) * 100)}%` }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Metrics Footer */}
                    <div className="mt-3.5 pt-3 border-t border-border/60 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="text-muted-foreground text-[10px] block">COMMITTED / RESERVED</span>
                        <span className="font-semibold text-foreground">
                          ₹{spentRupees.toLocaleString('en-IN')}
                          {reservedRupees > 0 && <span className="text-amber-400 text-[10px]"> (+₹{reservedRupees.toLocaleString('en-IN')})</span>}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground text-[10px] block">MONTHLY CEILING</span>
                        <span className="font-bold text-foreground">₹{capRupees.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Selected Pool Inspector & Policy Controls */}
            {selectedPool && (
              <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-primary/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl border ${selectedPool.color}`}>
                      <Sliders className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-foreground">
                        {selectedPool.displayName} — Governance Controls
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono">
                        Pool ID: {selectedPool.id} • Policy v{selectedPool.policyVersion} • ISO 18245 Enforced
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingCap(!editingCap)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-card border border-border hover:bg-secondary/60 text-foreground transition-colors shadow-sm"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      {editingCap ? 'Cancel' : 'Edit Spending Limits'}
                    </button>
                  </div>
                </div>

                {/* Edit Limits Form */}
                {editingCap ? (
                  <div className="mt-4 p-4 rounded-xl bg-card border border-border space-y-4">
                    <h5 className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
                      Amend Category Limits (Integer Paise Standard - Rule E1)
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground font-mono block mb-1">
                          Monthly Limit (₹ INR)
                        </label>
                        <input
                          type="number"
                          value={tempCapRupees}
                          onChange={(e) => setTempCapRupees(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground font-mono block mb-1">
                          Single Transaction Cap (₹ INR)
                        </label>
                        <input
                          type="number"
                          value={tempSingleTxRupees}
                          onChange={(e) => setTempSingleTxRupees(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-secondary/50 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingCap(false)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdateCap(selectedPool.id)}
                        className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                      >
                        Commit Limits (Bumps Policy Version)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Mode 1 */}
                    <div
                      onClick={() => setAutonomyMode(selectedPool.id, 'AUTO_APPROVE_WITHIN_LIMITS')}
                      className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                        selectedPool.policyMode === 'AUTO_APPROVE_WITHIN_LIMITS'
                          ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                          : 'border-border bg-card/50 hover:bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Unlock className="h-4 w-4 text-emerald-400" />
                        <span className="text-xs font-bold text-foreground">Auto-Approve</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Agent executes payments automatically within per-transaction ceiling (₹{(selectedPool.singleTxCapPaise / 100).toLocaleString('en-IN')}) without customer prompt.
                      </p>
                    </div>

                    {/* Mode 2 */}
                    <div
                      onClick={() => setAutonomyMode(selectedPool.id, 'ASK_BEFORE_EVERY_PAYMENT')}
                      className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                        selectedPool.policyMode === 'ASK_BEFORE_EVERY_PAYMENT'
                          ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                          : 'border-border bg-card/50 hover:bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-amber-400" />
                        <span className="text-xs font-bold text-foreground">Ask Every Payment</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Every single payment initiates an ASK verdict requiring customer biometric passkey confirmation before issuance.
                      </p>
                    </div>

                    {/* Mode 3 */}
                    <div
                      onClick={() => setAutonomyMode(selectedPool.id, 'MANUAL_ONLY')}
                      className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                        selectedPool.policyMode === 'MANUAL_ONLY'
                          ? 'border-rose-500 bg-rose-500/10 shadow-sm'
                          : 'border-border bg-card/50 hover:bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-rose-400" />
                        <span className="text-xs font-bold text-foreground">Manual Only</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Autonomous payment execution strictly prohibited. Agent restricted to drafting purchase orders for human review.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Agent Allocations Tab */
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border bg-card/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-bold text-foreground">Multi-Agent Subordinated Allocations (Invariant I7)</h4>
                </div>
                <span className="text-xs font-mono text-muted-foreground">3 Registered Sub-Agents</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2">AGENT IDENTIFIER</th>
                      <th className="pb-2">BOUND CATEGORY</th>
                      <th className="pb-2">DAILY CEILING</th>
                      <th className="pb-2">PER-TX LIMIT</th>
                      <th className="pb-2">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="py-2.5 font-semibold text-foreground">agent_procurement_99</td>
                      <td className="py-2.5">SHOPPING, UTILITIES</td>
                      <td className="py-2.5">₹5,000</td>
                      <td className="py-2.5">₹1,000</td>
                      <td className="py-2.5 text-emerald-400 font-bold">ACTIVE</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-semibold text-foreground">agent_travel_desk_02</td>
                      <td className="py-2.5">TRANSPORT, FOOD_DINING</td>
                      <td className="py-2.5">₹3,000</td>
                      <td className="py-2.5">₹1,500</td>
                      <td className="py-2.5 text-emerald-400 font-bold">ACTIVE</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-semibold text-foreground">agent_treasury_invest</td>
                      <td className="py-2.5">INVESTMENT_STOCK</td>
                      <td className="py-2.5">₹25,000</td>
                      <td className="py-2.5">₹25,000</td>
                      <td className="py-2.5 text-amber-400 font-bold">MANUAL_ONLY</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
