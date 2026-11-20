'use client'

import React, { useState } from 'react'
import {
  Wallet, ShoppingBag, Car, Zap, Utensils, HeartPulse, TrendingUp,
  Film, HelpCircle, Check, AlertTriangle, Lock, Unlock, Sparkles,
  Sliders, Plus, Edit3, ArrowRight, ShieldCheck, ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { CategoryBudgetPool } from '@agentguard/core-schema'

const INITIAL_POOLS: CategoryBudgetPool[] = [
  {
    id: 'pool_shopping',
    category: 'SHOPPING',
    displayName: 'Shopping & E-Commerce',
    monthlyCapPaise: 2500000, // ₹25,000
    spentPaise: 840000,      // ₹8,400
    singleTxCapPaise: 500000, // ₹5,000
    policyMode: 'ALWAYS_ASK',
    status: 'ACTIVE',
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    iconName: 'ShoppingBag',
  },
  {
    id: 'pool_transport',
    category: 'TRANSPORT_PETROL',
    displayName: 'Transport, Fuel & Uber/Ola',
    monthlyCapPaise: 1500000, // ₹15,000
    spentPaise: 420000,      // ₹4,200
    singleTxCapPaise: 250000, // ₹2,500
    policyMode: 'PAY_WITHOUT_RESTRICTION',
    status: 'ACTIVE',
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    iconName: 'Car',
  },
  {
    id: 'pool_utilities',
    category: 'UTILITIES_BILL',
    displayName: 'Utilities & Subscriptions',
    monthlyCapPaise: 1000000, // ₹10,000
    spentPaise: 245000,      // ₹2,450
    singleTxCapPaise: 500000, // ₹5,000
    policyMode: 'PAY_WITHOUT_RESTRICTION',
    status: 'ACTIVE',
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    iconName: 'Zap',
  },
  {
    id: 'pool_dining',
    category: 'FOOD_DINING',
    displayName: 'Food & Dining (Zomato/Swiggy)',
    monthlyCapPaise: 1200000, // ₹12,000
    spentPaise: 310000,      // ₹3,100
    singleTxCapPaise: 200000, // ₹2,000
    policyMode: 'PAY_WITHOUT_RESTRICTION',
    status: 'ACTIVE',
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    iconName: 'Utensils',
  },
  {
    id: 'pool_invest',
    category: 'INVESTMENT_STOCK',
    displayName: 'Stock Market & Investments',
    monthlyCapPaise: 5000000, // ₹50,000
    spentPaise: 0,
    singleTxCapPaise: 2500000, // ₹25,000
    policyMode: 'ALWAYS_ASK',
    status: 'ACTIVE',
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    iconName: 'TrendingUp',
  },
]

export function AnonymousBudgetPoolsView() {
  const [pools, setPools] = useState<CategoryBudgetPool[]>(INITIAL_POOLS)
  const [selectedPool, setSelectedPool] = useState<CategoryBudgetPool>(INITIAL_POOLS[0])
  const [editingCap, setEditingCap] = useState<boolean>(false)
  const [tempCapRupees, setTempCapRupees] = useState<number>(25000)

  const togglePolicyMode = (poolId: string) => {
    setPools(prev => prev.map(p => {
      if (p.id === poolId) {
        const nextMode = p.policyMode === 'ALWAYS_ASK' ? 'PAY_WITHOUT_RESTRICTION' : 'ALWAYS_ASK'
        toast.success(`Updated ${p.displayName}`, {
          description: nextMode === 'ALWAYS_ASK'
            ? 'Agent will always hold for human biometric passkey before execution.'
            : 'Agent can pay autonomously within limits without interruption.'
        })
        const updated = { ...p, policyMode: nextMode }
        if (selectedPool.id === poolId) setSelectedPool(updated)
        return updated
      }
      return p
    }))
  }

  const handleUpdateCap = (poolId: string) => {
    setPools(prev => prev.map(p => {
      if (p.id === poolId) {
        const updated = {
          ...p,
          monthlyCapPaise: tempCapRupees * 100,
          singleTxCapPaise: Math.round((tempCapRupees * 100) / 4)
        }
        setSelectedPool(updated)
        toast.success('Budget Cap Updated', {
          description: `Monthly cap set to ₹${tempCapRupees.toLocaleString('en-IN')}`
        })
        return updated
      }
      return p
    }))
    setEditingCap(false)
  }

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              Autonomous Category Budget Pools &amp; Limits
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">
              Startup Enterprise Feature
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Allocate scoped money pools for unscheduled agent spending across Shopping, Transport, Utilities, and Investments with granular autonomy controls.
          </p>
        </div>

        {/* Global summary badge */}
        <div className="flex items-center gap-3 bg-secondary/40 px-3.5 py-2 rounded-xl border border-border text-xs font-mono">
          <span className="text-muted-foreground">Total Budget Allocated:</span>
          <span className="text-foreground font-bold font-mono">
            ₹{(pools.reduce((acc, p) => acc + p.monthlyCapPaise, 0) / 100).toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Pools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pools.map((pool) => {
          const spentRupees = pool.spentPaise / 100
          const capRupees = pool.monthlyCapPaise / 100
          const percentUsed = Math.min(100, Math.round((spentRupees / capRupees) * 100))
          const isSelected = selectedPool.id === pool.id
          const isAsk = pool.policyMode === 'ALWAYS_ASK'

          return (
            <div
              key={pool.id}
              onClick={() => {
                setSelectedPool(pool)
                setTempCapRupees(pool.monthlyCapPaise / 100)
              }}
              className={`p-4 rounded-xl border cursor-pointer transition-all relative flex flex-col justify-between ${
                isSelected ? 'ring-2 ring-primary border-primary shadow-md bg-secondary/30' : 'border-border bg-card hover:bg-secondary/20'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${pool.color}`}>
                    {pool.displayName}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                    isAsk ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-500'
                  }`}>
                    {isAsk ? 'Step-Up Required' : 'Auto-Pay Cap'}
                  </span>
                </div>

                {/* Amount Progress */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Spent: ₹{spentRupees.toLocaleString('en-IN')}</span>
                    <span className="text-foreground font-bold">Cap: ₹{capRupees.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        percentUsed > 80 ? 'bg-rose-500' : percentUsed > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{percentUsed}% utilized</span>
                    <span>Single Tx Cap: ₹{(pool.singleTxCapPaise / 100).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Toggle Control */}
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-medium">Autonomy Policy:</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePolicyMode(pool.id)
                  }}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold font-mono transition flex items-center gap-1 border ${
                    isAsk
                      ? 'bg-amber-500/20 text-amber-500 border-amber-500/30 hover:bg-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/30'
                  }`}
                >
                  {isAsk ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  <span>{isAsk ? 'Ask Before Pay' : 'Pay Without Restriction'}</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected Pool Inspector & Cap Customizer */}
      <div className="p-5 rounded-xl border border-border bg-secondary/20 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-bold text-foreground">
              Configuring Pool: {selectedPool.displayName}
            </h4>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            Category ID: {selectedPool.category}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Autonomy Setting</span>
            <div className="text-xs text-foreground font-bold">
              {selectedPool.policyMode === 'ALWAYS_ASK'
                ? 'Option A: Ask Before Payment (FIDO2 Passkey Step-Up)'
                : 'Option B: Pay Without Restriction (Within Cap)'}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selectedPool.policyMode === 'ALWAYS_ASK'
                ? 'Unscheduled payments in this category will immediately pause at Agent 5 and request biometric confirmation.'
                : 'Agent is granted autonomous authority to complete payments as long as each transfer is under ₹' + (selectedPool.singleTxCapPaise / 100).toLocaleString('en-IN') + '.'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Monthly Limit</span>
            {editingCap ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={tempCapRupees}
                  onChange={(e) => setTempCapRupees(Number(e.target.value))}
                  className="bg-card border border-border rounded px-2 py-1 text-xs font-mono w-28 text-foreground"
                />
                <button
                  onClick={() => handleUpdateCap(selectedPool.id)}
                  className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-bold"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-mono text-foreground">
                  ₹{(selectedPool.monthlyCapPaise / 100).toLocaleString('en-IN')}
                </span>
                <button
                  onClick={() => setEditingCap(true)}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Integer paise balance enforced directly against Bank Gate :4000.
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">Switch Autonomy Option</span>
            <div>
              <button
                onClick={() => togglePolicyMode(selectedPool.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-card hover:bg-secondary transition flex items-center gap-2 text-foreground"
              >
                <span>Toggle to: {selectedPool.policyMode === 'ALWAYS_ASK' ? 'Pay Without Restriction' : 'Ask Before Pay'}</span>
                <ChevronRight className="h-3.5 w-3.5 text-primary" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
