'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard/layout'
import { CoverageView } from '@/components/coverage/coverage-view'
import { Security360 } from '@/components/coverage/security-360'
import { TierGate } from '@/components/pro-features/tier-gate'
import { Security3DTopology } from '@/components/topology/security-3d-topology'
import { Layers, ShieldCheck, Box, Network, Eye } from 'lucide-react'

export default function CoveragePage() {
  const [viewMode, setViewMode] = useState<'3d_mesh' | '360_surfaces' | 'ontology'>('3d_mesh')

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-foreground flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-indigo-500" />
              Security 360 &amp; Threat Visualizer
            </h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-[70ch]">
              Every way an autonomous agent can be turned against you, mapped across 3D security mesh nodes and active policy coverage.
            </p>
          </div>

          {/* 3D vs 2D vs Matrix Switcher */}
          <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg border border-border text-xs font-medium self-start sm:self-auto">
            <button
              onClick={() => setViewMode('3d_mesh')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
                viewMode === '3d_mesh'
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Box className="h-3.5 w-3.5" />
              <span>3D Security Mesh</span>
            </button>
            <button
              onClick={() => setViewMode('360_surfaces')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
                viewMode === '360_surfaces'
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Surfaces Ring</span>
            </button>
            <button
              onClick={() => setViewMode('ontology')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
                viewMode === 'ontology'
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              <span>Threat Matrix</span>
            </button>
          </div>
        </header>

        {/* 3D Mesh Interactive Visualization Mode */}
        {viewMode === '3d_mesh' && (
          <div className="space-y-6">
            <Security3DTopology />
            <Security360 />
          </div>
        )}

        {/* Surfaces Ring View */}
        {viewMode === '360_surfaces' && (
          <div className="space-y-6">
            <Security360 />
            <TierGate
              requires="team"
              feature="The policy coverage report"
              description="Threat-ontology map of which attack tactics your active policies actually catch — auditors love this."
            >
              <CoverageView />
            </TierGate>
          </div>
        )}

        {/* Threat Matrix Ontology Mode */}
        {viewMode === 'ontology' && (
          <TierGate
            requires="team"
            feature="The policy coverage report"
            description="Threat-ontology map of which attack tactics your active policies actually catch — auditors love this."
          >
            <CoverageView />
          </TierGate>
        )}
      </div>
    </DashboardLayout>
  )
}
