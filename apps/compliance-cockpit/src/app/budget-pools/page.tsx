'use client'

import React from 'react'
import { DashboardLayout } from '@/components/dashboard/layout'
import { AnonymousBudgetPoolsView } from '@/components/banking/anonymous-budget-pools-view'

export default function BudgetPoolsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 pb-16 min-w-0 w-full">
        {/* Main Sovereign Budget Pools Console */}
        <AnonymousBudgetPoolsView />
      </div>
    </DashboardLayout>
  )
}
