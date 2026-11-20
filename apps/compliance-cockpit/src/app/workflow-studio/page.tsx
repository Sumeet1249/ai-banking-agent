'use client'

import React from 'react'
import { AutonomousWorkflowStudio } from '@/components/banking/autonomous-workflow-studio'
import { Sparkles, ArrowRight, ShieldCheck, Cpu } from 'lucide-react'
import Link from 'next/link'

export default function WorkflowStudioPage() {
  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Status Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider">
              Autonomous Operations Plane
            </span>
            <span className="text-muted-foreground text-xs">/</span>
            <span className="text-xs font-semibold text-foreground">Multi-Agent Workflow Studio</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mt-1 tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Agent Banking Workflow & Orchestration
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full 8-agent sequential pipeline from natural-language task intake to Bank Gate Ed25519 execution and Merkle proof.
          </p>
        </div>

        {/* Quick Cross-Nav to Defense & Approvals */}
        <div className="flex items-center gap-2">
          <Link
            href="/banking"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border flex items-center gap-1.5 transition"
          >
            <span>Banking Command & Attack Lab</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/approvals"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 transition"
          >
            <span>Pending Approvals</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Main Studio Component */}
      <AutonomousWorkflowStudio />
    </div>
  )
}
