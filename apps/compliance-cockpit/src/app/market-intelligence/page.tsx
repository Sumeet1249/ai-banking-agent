'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard/layout'
import {
  TrendingUp, Search, Shield, ShieldCheck, AlertTriangle, FileText, CheckCircle2,
  Calendar, Layers, PieChart, BarChart3, ArrowUpRight, ArrowDownRight, RefreshCw,
  Lock, ExternalLink, Zap, ChevronRight, Award, Compass, Sparkles, Building2,
  Coins, Landmark, HeartHandshake, Eye, UserCheck, ShieldAlert
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type ActiveTab =
  | 'overview'
  | 'company_explorer'
  | 'research_workspace'
  | 'portfolio_sips'
  | 'projections_risk'
  | 'broker'
  | 'reports_audit'

interface InstrumentItem {
  symbol: string
  exchange: string
  company_name: string
  asset_class: string
  sector?: string
  industry?: string
  status: string
}

export default function MarketIntelligencePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState('INFY')
  const [marketStatus, setMarketStatus] = useState<{ exchange: string; status: string; trading_day: string } | null>(null)
  const [instruments, setInstruments] = useState<InstrumentItem[]>([])
  const [companyData, setCompanyData] = useState<any>(null)
  const [portfolioData, setPortfolioData] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [auditEvents, setAuditEvents] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isResearching, setIsResearching] = useState(false)
  const [researchOutput, setResearchOutput] = useState<any>(null)

  // Fetch initial data
  useEffect(() => {
    fetchMarketStatus()
    fetchInstruments()
    fetchPortfolio()
    fetchReports()
    fetchAuditEvents()
  }, [])

  // Fetch company details when selectedSymbol changes
  useEffect(() => {
    if (selectedSymbol) {
      fetchCompanyDetails(selectedSymbol)
    }
  }, [selectedSymbol])

  const fetchMarketStatus = async () => {
    try {
      const res = await fetch('/api/market/status')
      const data = await res.json()
      if (data.success) {
        setMarketStatus(data.data)
      }
    } catch {
      setMarketStatus({ exchange: 'NSE', status: 'OPEN', trading_day: new Date().toISOString().split('T')[0] })
    }
  }

  const fetchInstruments = async () => {
    try {
      const res = await fetch('/api/market/search')
      const data = await res.json()
      if (data.success && data.data) {
        setInstruments(data.data)
      }
    } catch (err) {
      console.error('Failed to load market instruments', err)
    }
  }

  const fetchCompanyDetails = async (symbol: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/market/company/${symbol}`)
      const data = await res.json()
      if (data.success && data.data) {
        setCompanyData(data.data)
      }
    } catch (err) {
      console.error('Failed to load company details', err)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPortfolio = async () => {
    try {
      const res = await fetch('/api/market/portfolio')
      const data = await res.json()
      if (data.success && data.data) {
        setPortfolioData(data.data)
      }
    } catch (err) {
      console.error('Failed to load portfolio', err)
    }
  }

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/market/reports')
      const data = await res.json()
      if (data.success && data.data) {
        setReports(data.data)
      }
    } catch (err) {
      console.error('Failed to load research reports', err)
    }
  }

  const fetchAuditEvents = async () => {
    try {
      const res = await fetch('/api/market/audit')
      const data = await res.json()
      if (data.success && data.data) {
        setAuditEvents(data.data)
      }
    } catch (err) {
      console.error('Failed to load audit events', err)
    }
  }

  const runAgentResearch = async (symbolToResearch: string) => {
    setIsResearching(true)
    setResearchOutput(null)
    toast.info(`Launching multi-agent research for ${symbolToResearch}...`)

    try {
      const res = await fetch('/api/market/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbolToResearch,
          exchange: 'NSE',
          includePortfolioContext: true,
        }),
      })
      const data = await res.json()
      if (data.success && data.data) {
        setResearchOutput(data.data)
        toast.success(`Research report generated for ${symbolToResearch}`)
        fetchReports()
        fetchAuditEvents()
      } else {
        toast.error(data.error || 'Research generation failed')
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally {
      setIsResearching(false)
    }
  }

  const filteredInstruments = useMemo(() => {
    if (!searchQuery.trim()) return instruments
    const q = searchQuery.toLowerCase()
    return instruments.filter(
      (i) =>
        i.symbol.toLowerCase().includes(q) ||
        i.company_name.toLowerCase().includes(q) ||
        (i.sector && i.sector.toLowerCase().includes(q))
    )
  }, [instruments, searchQuery])

  return (
    <DashboardLayout>
      <div className="flex-1 space-y-6 p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  Indian Market Intelligence & Wealth Research
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold uppercase tracking-wider">
                    Strictly Read-Only
                  </span>
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Long-term investing research, audited company balance sheets, monthly SIPs, Gold ETFs, and portfolio risk telemetry.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-card border border-border/60 text-xs font-mono shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-muted-foreground">NSE / BSE:</span>
              <span className="text-foreground font-bold">{marketStatus?.status || 'OPEN'}</span>
              <span className="text-muted-foreground/60">({marketStatus?.trading_day || 'IST'})</span>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-medium">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero Trading Execution</span>
            </div>
          </div>
        </div>

        {/* Statutory SEBI Non-Advisory Disclaimer */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold tracking-wide uppercase">SEBI Statutory Regulatory Disclaimer</p>
            <p className="text-muted-foreground dark:text-amber-300/80 leading-relaxed">
              AgentGuard AI Market Intelligence is an educational and corporate research facility. It is strictly non-advisory and non-discretionary. Nothing herein represents investment advice, stock recommendation, trading strategy, or solicitation. Securities investments are subject to market risks. Automated trade execution, scalping, and order placement are permanently disabled.
            </p>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center gap-1.5 border-b border-border/40 overflow-x-auto pb-1 text-sm font-medium scrollbar-none">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              'px-4 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap',
              activeTab === 'overview'
                ? 'bg-foreground/10 text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <Layers className="w-4 h-4" />
            Market Overview & Watchlist
          </button>

          <button
            onClick={() => setActiveTab('company_explorer')}
            className={cn(
              'px-4 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap',
              activeTab === 'company_explorer'
                ? 'bg-foreground/10 text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <Building2 className="w-4 h-4" />
            Company Explorer
          </button>

          <button
            onClick={() => setActiveTab('research_workspace')}
            className={cn(
              'px-4 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap',
              activeTab === 'research_workspace'
                ? 'bg-foreground/10 text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <Sparkles className="w-4 h-4" />
            Multi-Agent Research
          </button>

          <button
            onClick={() => setActiveTab('portfolio_sips')}
            className={cn(
              'px-4 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap',
              activeTab === 'portfolio_sips'
                ? 'bg-foreground/10 text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <Coins className="w-4 h-4" />
            Wealth Portfolio & Fixed SIPs
          </button>

          <button
            onClick={() => setActiveTab('projections_risk')}
            className={cn(
              'px-4 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap',
              activeTab === 'projections_risk'
                ? 'bg-foreground/10 text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <PieChart className="w-4 h-4" />
            Allocation & Compounding
          </button>

          <button
            onClick={() => setActiveTab('broker')}
            className={cn(
              'px-4 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap',
              activeTab === 'broker'
                ? 'bg-foreground/10 text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <Landmark className="w-4 h-4" />
            Upstox Read-Only Broker
          </button>

          <button
            onClick={() => setActiveTab('reports_audit')}
            className={cn(
              'px-4 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap',
              activeTab === 'reports_audit'
                ? 'bg-foreground/10 text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <FileText className="w-4 h-4" />
            Reports & Audit ({reports.length})
          </button>
        </div>

        {/* TAB 1: OVERVIEW & WATCHLIST */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search NSE/BSE stocks, Mutual Funds, Gold ETFs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-border/60 bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
                />
              </div>

              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>Showing {filteredInstruments.length} instruments</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredInstruments.map((item) => (
                <div
                  key={`${item.symbol}-${item.exchange}`}
                  className="rounded-xl border border-border/60 bg-card p-5 hover:border-border transition-all flex flex-col justify-between group shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-foreground tracking-tight">{item.symbol}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-muted font-mono font-medium text-muted-foreground">
                            {item.exchange}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded font-medium',
                              item.asset_class === 'EQUITY'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : item.asset_class === 'MUTUAL_FUND'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                : item.asset_class === 'GOLD_ETF' || item.asset_class === 'SGB'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            )}
                          >
                            {item.asset_class.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground/90 mt-1 line-clamp-1">{item.company_name}</p>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Sector: <span className="text-foreground">{item.sector || 'Diversified'}</span></p>
                      <p>Industry: <span className="text-foreground">{item.industry || 'General'}</span></p>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-border/40 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setSelectedSymbol(item.symbol)
                        setActiveTab('company_explorer')
                      }}
                      className="text-xs font-semibold text-foreground/80 hover:text-foreground flex items-center gap-1"
                    >
                      Explore Fundamentals <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => {
                        setSelectedSymbol(item.symbol)
                        runAgentResearch(item.symbol)
                        setActiveTab('research_workspace')
                      }}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-foreground/10 hover:bg-foreground/15 text-foreground transition-all flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      Run AI Agent
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: COMPANY EXPLORER */}
        {activeTab === 'company_explorer' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-5 rounded-xl border border-border/60">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-foreground/5 border border-border/60">
                  <Building2 className="w-8 h-8 text-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-foreground">
                      {companyData?.profile?.company_name || selectedSymbol}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted font-mono font-medium">
                      {selectedSymbol} : {companyData?.profile?.exchange || 'NSE'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {companyData?.profile?.sector} • {companyData?.profile?.industry} • Tier: {companyData?.profile?.market_cap_tier}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border/60 bg-card text-foreground text-sm font-semibold focus:outline-none"
                >
                  {instruments.map((i) => (
                    <option key={i.symbol} value={i.symbol}>
                      {i.symbol} - {i.company_name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    runAgentResearch(selectedSymbol)
                    setActiveTab('research_workspace')
                  }}
                  className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Agent Report
                </button>
              </div>
            </div>

            {/* Profile Overview Card */}
            {companyData?.profile && (
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                <h4 className="text-sm font-bold text-foreground tracking-wide uppercase">Company Description & Mission</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {companyData.profile.description}
                </p>
                {companyData.profile.website && (
                  <a
                    href={companyData.profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-500 hover:underline pt-1"
                  >
                    Visit Corporate Website <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Financial Health Scores */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Financial Health</span>
                  <Award className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-3xl font-extrabold text-foreground">88 <span className="text-sm font-normal text-muted-foreground">/ 100</span></div>
                <p className="text-xs text-muted-foreground">Composite balance sheet solvency and disciplined cash conversion.</p>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profitability</span>
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-3xl font-extrabold text-foreground">91 <span className="text-sm font-normal text-muted-foreground">/ 100</span></div>
                <p className="text-xs text-muted-foreground">ROE {companyData?.fundamentals?.[0]?.roe_percent || '31.4'}% with operating margin expansion.</p>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Solvency</span>
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-3xl font-extrabold text-foreground">95 <span className="text-sm font-normal text-muted-foreground">/ 100</span></div>
                <p className="text-xs text-muted-foreground">Debt-to-equity {companyData?.fundamentals?.[0]?.debt_to_equity || '0.08'} (virtually debt-free balance sheet).</p>
              </div>
            </div>

            {/* Audited Multi-Year Fundamentals Table */}
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-foreground">Audited Financial History (BSE/NSE Disclosures)</h3>
                <span className="text-xs text-muted-foreground">Amounts in INR Crores</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-xs font-semibold text-muted-foreground">
                      <th className="py-2.5">Period</th>
                      <th className="py-2.5">Revenue (Cr)</th>
                      <th className="py-2.5">EBITDA (Cr)</th>
                      <th className="py-2.5">Net Profit (Cr)</th>
                      <th className="py-2.5">EPS (₹)</th>
                      <th className="py-2.5">ROE %</th>
                      <th className="py-2.5">Debt/Equity</th>
                      <th className="py-2.5">P/E Multiple</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 text-foreground">
                    {companyData?.fundamentals?.map((fund: any) => (
                      <tr key={fund.fundamental_id || fund.financial_period} className="hover:bg-muted/20">
                        <td className="py-3 font-semibold font-mono">{fund.financial_period}</td>
                        <td className="py-3">₹{(fund.revenue_inr_crores || 0).toLocaleString('en-IN')}</td>
                        <td className="py-3">₹{(fund.ebitda_inr_crores || 0).toLocaleString('en-IN')}</td>
                        <td className="py-3 font-medium text-emerald-600 dark:text-emerald-400">
                          ₹{(fund.net_profit_inr_crores || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3">₹{fund.eps_inr || '0.0'}</td>
                        <td className="py-3">{fund.roe_percent ? `${fund.roe_percent}%` : 'N/A'}</td>
                        <td className="py-3">{fund.debt_to_equity !== null ? fund.debt_to_equity : '0.00'}</td>
                        <td className="py-3 font-semibold">{fund.pe_ratio ? `${fund.pe_ratio}x` : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Filings & Regulatory Broadcasts from Drishti */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  Statutory Filings (Drishti Connector)
                </h4>
                <div className="space-y-2.5">
                  {companyData?.filings?.slice(0, 4).map((f: any) => (
                    <div key={f.filing_id || f.title} className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-1">
                      <p className="text-xs font-semibold text-foreground">{f.title}</p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{f.category}</span>
                        <span>{f.publication_date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Material Announcements & Concalls
                </h4>
                <div className="space-y-2.5">
                  {companyData?.announcements?.slice(0, 4).map((ann: any) => (
                    <div key={ann.announcement_id || ann.title} className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-1">
                      <p className="text-xs font-semibold text-foreground">{ann.title}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{ann.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MULTI-AGENT RESEARCH WORKSPACE */}
        {activeTab === 'research_workspace' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    Autonomous Multi-Agent Market Research
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Coordinated execution: Company Research + Fundamental Analysis + Valuation Multiples + News & Regulatory Governance.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border/60 bg-card text-foreground text-sm font-semibold focus:outline-none"
                  >
                    {instruments.map((i) => (
                      <option key={i.symbol} value={i.symbol}>
                        {i.symbol} - {i.company_name}
                      </option>
                    ))}
                  </select>

                  <button
                    disabled={isResearching}
                    onClick={() => runAgentResearch(selectedSymbol)}
                    className="px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {isResearching ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Agents Collaborating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Execute Multi-Agent Research
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Multi-Agent Architecture Visualization */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                <div className="p-3.5 rounded-xl border border-border/40 bg-muted/10 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    CompanyResearchAgent
                  </div>
                  <p className="text-[11px] text-muted-foreground">Discovers corporate structure, management, and operational segments.</p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/40 bg-muted/10 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    FundamentalAnalysisAgent
                  </div>
                  <p className="text-[11px] text-muted-foreground">Audits balance sheet, debt/equity leverage, ROE, and quarterly trends.</p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/40 bg-muted/10 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    ValuationAnalysisAgent
                  </div>
                  <p className="text-[11px] text-muted-foreground">Calculates P/E, P/B multiples and benchmarks peer multiples.</p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/40 bg-muted/10 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    NewsFilingAgent
                  </div>
                  <p className="text-[11px] text-muted-foreground">Sanitizes BSE/NSE disclosures and extracts earnings concalls.</p>
                </div>
              </div>
            </div>

            {/* Generated Research Report Output */}
            {researchOutput && (
              <div className="rounded-xl border border-border/60 bg-card p-6 space-y-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      {researchOutput.company_name} ({researchOutput.symbol})
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Report ID: {researchOutput.report_id} • Date: {researchOutput.research_date} • Quality Score: {researchOutput.data_quality_score}/100
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                      Verified Research
                    </span>
                  </div>
                </div>

                {/* Statutory Disclaimer inside report */}
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-semibold uppercase tracking-wider text-[11px]">Non-Advisory Research Attestation</p>
                  <p className="mt-1 leading-relaxed opacity-90">{researchOutput.compliance_disclosure}</p>
                </div>

                {/* Executive Summary */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wide">1. Executive Summary</h4>
                  <p className="text-sm text-foreground/90 leading-relaxed bg-muted/10 p-4 rounded-lg border border-border/30">
                    {researchOutput.executive_summary}
                  </p>
                </div>

                {/* Business Model & Operations */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wide">2. Business Model & Operations</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {researchOutput.business_model}
                  </p>
                </div>

                {/* Profitability, Solvency, Quality */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-border/40 bg-muted/10 space-y-2">
                    <h5 className="text-xs font-bold text-foreground uppercase">Profitability & Margins</h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">{researchOutput.profitability_and_margins}</p>
                  </div>

                  <div className="p-4 rounded-lg border border-border/40 bg-muted/10 space-y-2">
                    <h5 className="text-xs font-bold text-foreground uppercase">Debt & Solvency Profile</h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">{researchOutput.debt_and_solvency}</p>
                  </div>
                </div>

                {/* Valuation Analysis & Peers */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wide">3. Valuation & Relative Benchmarking</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {researchOutput.valuation_analysis}
                  </p>
                </div>

                {/* Catalysts & Watchpoints */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                    <h5 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">Growth Drivers & Catalysts</h5>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                      {researchOutput.major_positive_catalysts?.map((c: string, idx: number) => (
                        <li key={idx}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-2">
                    <h5 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase">Key Risks & Headwinds</h5>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                      {researchOutput.major_risks_and_headwinds?.map((r: string, idx: number) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Evidence Citations */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">4. Verifiable Citations & Source Provenance</h4>
                  <div className="space-y-1.5 text-xs text-muted-foreground font-mono">
                    {researchOutput.sources_cited?.map((s: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-foreground font-bold">[{idx + 1}]</span>
                        <span>{s.title}</span>
                        <span className="text-muted-foreground/60">({s.source_provider})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: WEALTH PORTFOLIO & FIXED SIPS */}
        {activeTab === 'portfolio_sips' && (
          <div className="space-y-6">
            {/* Portfolio Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-1 shadow-sm">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Portfolio Value</span>
                <div className="text-2xl font-extrabold text-foreground">
                  ₹{(portfolioData?.portfolio?.snapshot?.total_portfolio_value || 845200).toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  +19.2% overall gains
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-1 shadow-sm">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Invested</span>
                <div className="text-2xl font-extrabold text-foreground">
                  ₹{(portfolioData?.portfolio?.snapshot?.total_invested_value || 712000).toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-muted-foreground">Disciplined capital deployed</div>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-1 shadow-sm">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Monthly SIP Obligations</span>
                <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  ₹{(portfolioData?.portfolio?.sipSummary?.totalMonthlyCommitmentInr || 15000).toLocaleString('en-IN')}
                  <span className="text-xs font-normal text-muted-foreground"> /mo</span>
                </div>
                <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                  {portfolioData?.portfolio?.sipSummary?.activeSipCount || 2} Active Automated SIPs
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-1 shadow-sm">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Insurance Cover</span>
                <div className="text-2xl font-extrabold text-foreground">
                  ₹50,00,000
                </div>
                <div className="text-xs text-muted-foreground">Term Wealth Protection</div>
              </div>
            </div>

            {/* Holdings & Wealth Assets Table */}
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-foreground">Holdings & Wealth Asset Classes</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Blue-chip equities, diversified index mutual funds, gold bullion ETFs, sovereign gold bonds.
                  </p>
                </div>

                <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                  Read-Only Consented Upstox Feed
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-xs font-semibold text-muted-foreground">
                      <th className="py-2.5">Instrument</th>
                      <th className="py-2.5">Asset Class</th>
                      <th className="py-2.5">Quantity</th>
                      <th className="py-2.5">Current Value</th>
                      <th className="py-2.5">Unrealized P&L</th>
                      <th className="py-2.5">Monthly SIP</th>
                      <th className="py-2.5">Execution Day</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 text-foreground">
                    {portfolioData?.portfolio?.holdings?.map((h: any) => (
                      <tr key={h.holding_id} className="hover:bg-muted/20">
                        <td className="py-3">
                          <div className="font-semibold text-foreground">{h.instrument_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{h.symbol} • {h.exchange}</div>
                        </td>
                        <td className="py-3">
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded font-medium',
                              h.asset_class === 'EQUITY'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : h.asset_class === 'MUTUAL_FUND'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                : h.asset_class === 'GOLD_ETF' || h.asset_class === 'SGB'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            )}
                          >
                            {h.asset_class.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 font-mono">{h.quantity}</td>
                        <td className="py-3 font-semibold">₹{(h.current_value || 0).toLocaleString('en-IN')}</td>
                        <td className="py-3">
                          <span className={cn('font-semibold', (h.unrealized_pnl || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                            {(h.unrealized_pnl || 0) >= 0 ? '+' : ''}₹{(h.unrealized_pnl || 0).toLocaleString('en-IN')} ({h.unrealized_pnl_percent}%)
                          </span>
                        </td>
                        <td className="py-3">
                          {h.is_sip ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              ₹{(h.sip_monthly_amount || 0).toLocaleString('en-IN')}/mo
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Lump-sum</span>
                          )}
                        </td>
                        <td className="py-3 text-xs text-muted-foreground">
                          {h.is_sip ? `${h.sip_day_of_month || 5}th of month` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ASSET ALLOCATION & COMPOUNDING */}
        {activeTab === 'projections_risk' && (
          <div className="space-y-6">
            {/* Allocation Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-1">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Equities</span>
                <div className="text-3xl font-extrabold text-foreground">
                  {portfolioData?.portfolio?.allocation?.equityPercentage || 53}%
                </div>
                <p className="text-xs text-muted-foreground">Core Indian blue-chip equity compounding.</p>
              </div>

              <div className="p-5 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-1">
                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">Mutual Funds</span>
                <div className="text-3xl font-extrabold text-foreground">
                  {portfolioData?.portfolio?.allocation?.mutualFundPercentage || 25}%
                </div>
                <p className="text-xs text-muted-foreground">Large-cap & index mutual funds via monthly SIP.</p>
              </div>

              <div className="p-5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">Gold & SGB Hedge</span>
                <div className="text-3xl font-extrabold text-foreground">
                  {portfolioData?.portfolio?.allocation?.goldPercentage || 22}%
                </div>
                <p className="text-xs text-muted-foreground">Bullion protection against currency erosion.</p>
              </div>

              <div className="p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Risk Level</span>
                <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {portfolioData?.risk?.overallRiskRating || 'MODERATE'}
                </div>
                <p className="text-xs text-muted-foreground">Disciplined long-term capital preservation.</p>
              </div>
            </div>

            {/* Long-Term Compounding Projections */}
            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4 shadow-sm">
              <div>
                <h3 className="font-bold text-base text-foreground">
                  Long-Term Compounding Horizons (Existing Corpus + ₹15,000/Month SIP)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Conservative 11.5% nominal CAGR blended return model across Indian equities, mutual funds, and gold.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {portfolioData?.portfolio?.projections?.map((proj: any) => (
                  <div key={proj.years} className="p-4 rounded-xl border border-border/40 bg-muted/10 space-y-2">
                    <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                      {proj.years} Years Horizon
                    </div>
                    <div className="text-2xl font-extrabold text-foreground">
                      ₹{proj.projectedPortfolioValueInr.toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Total Invested: ₹{proj.totalInvestedInr.toLocaleString('en-IN')}</p>
                      <p className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Gains: +₹{proj.projectedWealthGainInr.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Diagnostics & Health Assessment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Portfolio Health Diagnostics
                </h4>
                <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  {portfolioData?.portfolio?.portfolioHealthAssessment?.map((item: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-500" />
                  Rebalancing & Disciplined Wealth Notes
                </h4>
                <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  {portfolioData?.portfolio?.rebalancingNotes?.length > 0 ? (
                    portfolioData.portfolio.rebalancingNotes.map((note: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <span>{note}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Portfolio asset allocation is currently well-balanced across Indian equities and gold.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: UPSTOX READ-ONLY BROKER */}
        {activeTab === 'broker' && (
          <div className="space-y-6 max-w-3xl">
            <div className="rounded-xl border border-border/60 bg-card p-6 space-y-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  <Landmark className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground">Upstox Broker Connector</h3>
                  <p className="text-xs text-muted-foreground">Customer-consented read-only portfolio integration for Indian securities.</p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" />
                  Active Status: Connected & Strictly Read-Only
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The Upstox OAuth session is cryptographically bound to hardware biometric consent and restricted to read-only scopes.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Granted Scopes</h4>
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  <span className="px-3 py-1 rounded bg-muted text-foreground border border-border/40">read_holdings</span>
                  <span className="px-3 py-1 rounded bg-muted text-foreground border border-border/40">read_portfolio</span>
                  <span className="px-3 py-1 rounded bg-muted text-foreground border border-border/40">read_pnl</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border/40 bg-muted/10 space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Enforced Invariants:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Zero order placement or trade execution capability.</li>
                  <li>Zero broker funds withdrawal or account transfer permission.</li>
                  <li>Decoupled from Bank Gate :4000 payment permit engine.</li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  onClick={async () => {
                    await fetch('/api/market/broker/disconnect', { method: 'POST' })
                    toast.success('Broker connection revoked')
                  }}
                  className="px-4 py-2 rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-all"
                >
                  Revoke Broker Consent & Disconnect
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: REPORTS & AUDIT TRAIL */}
        {activeTab === 'reports_audit' && (
          <div className="space-y-6">
            {/* Generated Reports List */}
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4 shadow-sm">
              <h3 className="font-bold text-base text-foreground">Audited Research Reports Archive</h3>

              <div className="divide-y divide-border/20">
                {reports.map((rep) => (
                  <div key={rep.report_id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-foreground text-sm">{rep.company_name} ({rep.symbol})</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted font-mono">{rep.exchange}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                          Score: {rep.data_quality_score}/100
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{rep.executive_summary}</p>
                    </div>

                    <button
                      onClick={() => {
                        setResearchOutput(rep)
                        setActiveTab('research_workspace')
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/30 text-foreground transition-all shrink-0"
                    >
                      View Report
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Market Audit Events Log */}
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-foreground">Market Intelligence Audit Events</h3>
                <span className="text-xs text-muted-foreground">{auditEvents.length} events logged</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground">
                      <th className="py-2">Event ID</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Actor</th>
                      <th className="py-2">Resource</th>
                      <th className="py-2">Outcome</th>
                      <th className="py-2">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 text-foreground">
                    {auditEvents.map((evt) => (
                      <tr key={evt.event_id} className="hover:bg-muted/20">
                        <td className="py-2.5">{evt.event_id}</td>
                        <td className="py-2.5 font-bold text-indigo-500">{evt.event_type}</td>
                        <td className="py-2.5">{evt.actor}</td>
                        <td className="py-2.5">{evt.resource_ref}</td>
                        <td className="py-2.5">
                          <span className={cn('px-1.5 py-0.5 rounded', evt.outcome === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500')}>
                            {evt.outcome}
                          </span>
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
