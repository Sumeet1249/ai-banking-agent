'use client'

import React from 'react'
import { AnonymousBudgetPoolsView } from '@/components/banking/anonymous-budget-pools-view'
import { Wallet, Sparkles, ArrowRight, ShieldCheck, Compass } from 'lucide-react'
import Link from 'next/link'

export default function BudgetPoolsPage() {
  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider">
              Autonomous Financial Governance
            </span>
            <span className="text-muted-foreground text-xs">/</span>
            <span className="text-xs font-semibold text-foreground">Anonymous Budget Pools</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mt-1 tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Category Budget Pools &amp; Autonomy Controls
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure scoped money pools for unscheduled agent spending across Shopping, Petrol, Transport, Utilities, and Investments.
          </p>
        </div>

        {/* Quick Cross-Nav */}
        <div className="flex items-center gap-2">
          <Link
            href="/workflow-studio"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border flex items-center gap-1.5 transition"
          >
            <span>Launch Workflow Studio</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/approvals"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition"
          >
            <span>Approvals Queue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Main Budget Pools View */}
      <AnonymousBudgetPoolsView />
    </div>
  )
}
