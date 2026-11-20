'use client'

import { ReactNode, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, Shield, ScrollText, Sparkles,
  CheckCircle, AlertTriangle, Settings,
  ShieldHalf, ClipboardList, UserRound, Layers, FileCheck2,
  Menu, X, Undo2, Box, Wallet, Pin, PinOff,
} from 'lucide-react'
import { useTraceStream } from '@/hooks/useTraceStream'
import { BlockAlertToast } from '@/components/ui/block-alert-toast'
import { StatusBar } from '@/components/dashboard/status-bar'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { AccountWidget } from '@/components/dashboard/account-widget'
import { use3DTilt } from '@/hooks/use3DTilt'
import { SpatialStage } from '@/components/spatial/spatial-stage'

const SpatialDepthCanvas = dynamic(
  () => import('@/components/spatial/spatial-depth-canvas').then((m) => m.SpatialDepthCanvas),
  { ssr: false }
)

type NavDef = { name: string; href: string; icon: any; badge?: string }

// Grouped in logical sequence for Hackathon Bank Agent Security (100% Preserved)
const navGroups: Array<{ label: string | null; items: NavDef[] }> = [
  {
    label: 'Mission Control',
    items: [
      { name: 'AI Workflow Studio', href: '/workflow-studio', icon: Sparkles, badge: 'AUTO-AI' },
      { name: 'Banking Command', href: '/banking', icon: Layers, badge: 'DEFENSE' },
      { name: 'Overview', href: '/', icon: LayoutDashboard },
      { name: 'Activity', href: '/traces', icon: FileText },
      { name: 'Approvals', href: '/approvals', icon: CheckCircle },
    ],
  },
  {
    label: 'Defend & Protect',
    items: [
      { name: 'Security 360', href: '/coverage', icon: ShieldHalf },
      { name: 'Category Budget Pools', href: '/budget-pools', icon: Wallet, badge: 'POOLS' },
      { name: 'Policies & Mandates', href: '/policies', icon: Shield },
      { name: 'Policy Packs', href: '/dsl/packs', icon: ScrollText },
      { name: 'Violations', href: '/violations', icon: AlertTriangle },
      { name: 'Rollbacks', href: '/rollbacks', icon: Undo2 },
    ],
  },
  {
    label: 'AI Agents',
    items: [
      { name: 'Agent Registry', href: '/agents', icon: UserRound },
    ],
  },
  {
    label: 'Regulatory & Audit',
    items: [
      { name: 'Audit Log & Witness', href: '/audit-log', icon: ClipboardList },
      { name: 'Compliance Proofs', href: '/compliance', icon: FileCheck2 },
    ],
  },
  {
    label: null,
    items: [
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
]

const BG = 'hsl(var(--sidebar))'
const MAIN_BG = 'hsl(var(--background))'
const BORDER = 'hsl(var(--border))'
const TEXT = 'hsl(var(--foreground))'
const MUTED = 'hsl(var(--muted-foreground))'

function AegisLogo({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary transition-[colors,transform] duration-200">
        <Shield className="h-4 w-4" strokeWidth={2} />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 overflow-hidden">
      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0 transition-[colors,transform] duration-200">
        <Shield className="h-4 w-4" strokeWidth={2} />
      </div>
      <span
        aria-label="AgentShield"
        style={{
          fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '0.12em',
          lineHeight: 1,
          color: 'hsl(var(--foreground))',
          display: 'inline-block',
          padding: '0 2px',
        }}
        className="whitespace-nowrap"
      >
        AgentShield
      </span>
    </div>
  )
}

function NavLink({
  item,
  pathname,
  onLinkClick,
  collapsed = false,
}: {
  item: NavDef
  pathname: string
  onLinkClick?: () => void
  collapsed?: boolean
}) {
  const isActive = pathname === item.href
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onLinkClick}
      title={collapsed ? `${item.name}${item.badge ? ` (${item.badge})` : ''}` : undefined}
      className={cn(
        'group relative flex items-center rounded-lg text-sm transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]',
        collapsed
          ? 'justify-center w-10 h-10 mx-auto px-0'
          : 'gap-2.5 px-3 py-2 w-full',
        isActive
          ? 'font-medium bg-[hsl(var(--sidebar-active))] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
          : 'font-normal text-muted-foreground hover:bg-[hsl(var(--sidebar-active))] hover:text-foreground'
      )}
    >
      {/* Active Left Indicator Bar */}
      {isActive && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary"
          aria-hidden="true"
        />
      )}

      <Icon
        className={cn(
          'h-4 w-4 shrink-0 transition-opacity duration-150',
          isActive ? 'text-primary opacity-100' : 'text-muted-foreground opacity-80 group-hover:opacity-100 group-hover:text-foreground'
        )}
        strokeWidth={1.6}
      />

      {/* Expanded Title & Badge */}
      {!collapsed && (
        <span className="truncate whitespace-nowrap transition-opacity duration-200">
          {item.name}
        </span>
      )}

      {!collapsed && item.badge && (
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 whitespace-nowrap">
          {item.badge}
        </span>
      )}

      {/* Collapsed Tooltip Flyout */}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2.5 hidden group-hover:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[hsl(var(--card))] text-foreground text-xs font-medium border border-border shadow-lg z-50 whitespace-nowrap">
          <span>{item.name}</span>
          {item.badge && (
            <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              {item.badge}
            </span>
          )}
        </span>
      )}
    </Link>
  )
}

function DesktopSidebarContent({
  pathname,
  isExpanded,
  isPinned,
  onTogglePin,
  connected,
  lastUpdate,
  notifPermission,
  requestNotifPermission,
  depthEnabled,
  setDepthEnabled,
  isometricMode,
  setIsometricMode,
}: {
  pathname: string
  isExpanded: boolean
  isPinned: boolean
  onTogglePin: () => void
  connected: boolean
  lastUpdate: Date | null
  notifPermission: NotificationPermission | 'default'
  requestNotifPermission: () => void
  depthEnabled: boolean
  setDepthEnabled: React.Dispatch<React.SetStateAction<boolean>>
  isometricMode: boolean
  setIsometricMode: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <div className="flex flex-col h-full select-none overflow-hidden">
      {/* Header with Logo + Pin Toggle */}
      <div
        className={cn(
          'flex items-center h-16 px-3 border-b border-border/80 transition-all duration-200 shrink-0',
          isExpanded ? 'justify-between px-4' : 'justify-center'
        )}
      >
        <AegisLogo collapsed={!isExpanded} />

        {isExpanded && (
          <button
            type="button"
            onClick={onTogglePin}
            title={isPinned ? 'Unpin sidebar (hover-expand)' : 'Pin sidebar open'}
            className={cn(
              'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--sidebar-active))] transition-colors duration-150',
              isPinned && 'text-primary bg-primary/10'
            )}
          >
            {isPinned ? (
              <PinOff className="h-4 w-4" strokeWidth={1.6} />
            ) : (
              <Pin className="h-4 w-4" strokeWidth={1.6} />
            )}
          </button>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-2 overflow-x-hidden">
        {navGroups.map((g, gi) => (
          <div key={gi} className={gi ? 'pt-1' : ''}>
            {/* Group Label / Divider */}
            {g.label ? (
              isExpanded ? (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 whitespace-nowrap transition-opacity duration-200">
                  {g.label}
                </p>
              ) : (
                gi > 0 && <div className="my-2 border-t border-border/60 mx-1" />
              )
            ) : (
              !isExpanded && gi > 0 && <div className="my-2 border-t border-border/60 mx-1" />
            )}

            <div className="space-y-0.5">
              {g.items.map((item) => (
                <NavLink
                  key={item.name}
                  item={item}
                  pathname={pathname}
                  collapsed={!isExpanded}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Controls */}
      <div className="p-3 border-t border-border/80 shrink-0 space-y-2 bg-[hsl(var(--sidebar))]">
        {isExpanded ? (
          <>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  background: 'hsl(var(--status-ok))',
                  boxShadow: '0 0 0 2px hsl(var(--status-ok) / 0.25)',
                }}
              />
              <span className="text-[11px] font-medium text-[hsl(var(--status-ok))] truncate">
                {connected ? 'Live · Gateway Active' : 'Protected · AgentShield'}
              </span>
              {lastUpdate && (
                <span
                  className="text-[10px] ml-auto shrink-0"
                  style={{ color: MUTED, opacity: 0.7 }}
                  suppressHydrationWarning
                >
                  {lastUpdate.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              )}
            </div>

            {notifPermission !== 'granted' && notifPermission !== 'denied' && (
              <button
                onClick={requestNotifPermission}
                className="w-full text-left text-[11px] px-2 py-1 rounded-md transition-colors hover:bg-[hsl(var(--secondary))] text-muted-foreground"
                title="Get notified even when this tab is in background"
              >
                Enable notifications
              </button>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setDepthEnabled((v) => !v)}
                title="Toggle 3D Spatial Depth"
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  depthEnabled
                    ? 'border-[hsl(var(--brand)/0.4)] bg-[hsl(var(--brand)/0.12)] text-foreground'
                    : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layers className="h-3.5 w-3.5" strokeWidth={1.6} />
                <span>3D</span>
              </button>
              <button
                type="button"
                onClick={() => setIsometricMode((v) => !v)}
                title="Toggle Isometric Stage Perspective"
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  isometricMode
                    ? 'border-[hsl(var(--brand)/0.4)] bg-[hsl(var(--brand)/0.12)] text-foreground'
                    : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Box className="h-3.5 w-3.5" strokeWidth={1.6} />
                <span>Iso</span>
              </button>
            </div>
            <AccountWidget />
            <p className="text-[10px] text-muted-foreground/80">v{process.env.APP_VERSION || '1.0.0'}</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: 'hsl(var(--status-ok))',
                boxShadow: '0 0 0 2px hsl(var(--status-ok) / 0.25)',
              }}
              title={connected ? 'Live · Gateway Active' : 'Protected · AgentShield'}
            />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setDepthEnabled((v) => !v)}
              title="Toggle 3D Spatial Depth"
              className={`p-1.5 rounded-md border text-[10px] font-medium transition-colors ${
                depthEnabled
                  ? 'border-[hsl(var(--brand)/0.4)] bg-[hsl(var(--brand)/0.12)] text-foreground'
                  : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
            <button
              type="button"
              onClick={() => setIsometricMode((v) => !v)}
              title="Toggle Isometric Stage Perspective"
              className={`p-1.5 rounded-md border text-[10px] font-medium transition-colors ${
                isometricMode
                  ? 'border-[hsl(var(--brand)/0.4)] bg-[hsl(var(--brand)/0.12)] text-foreground'
                  : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Box className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MobileSidebarContent({
  pathname,
  onLinkClick,
  connected,
  lastUpdate,
  notifPermission,
  requestNotifPermission,
  depthEnabled,
  setDepthEnabled,
  isometricMode,
  setIsometricMode,
}: {
  pathname: string
  onLinkClick?: () => void
  connected: boolean
  lastUpdate: Date | null
  notifPermission: NotificationPermission | 'default'
  requestNotifPermission: () => void
  depthEnabled: boolean
  setDepthEnabled: React.Dispatch<React.SetStateAction<boolean>>
  isometricMode: boolean
  setIsometricMode: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <div className="flex flex-col h-full select-none overflow-hidden">
      <div className="flex items-center px-4 py-5 border-b border-border/80">
        <AegisLogo />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {navGroups.map((g, gi) => (
          <div key={gi} className={gi ? 'pt-2' : ''}>
            {g.label && (
              <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                {g.label}
              </p>
            )}
            {g.items.map((item) => (
              <NavLink
                key={item.name}
                item={item}
                pathname={pathname}
                onLinkClick={onLinkClick}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-border/80 space-y-2">
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: 'hsl(var(--status-ok))',
              boxShadow: '0 0 0 2px hsl(var(--status-ok) / 0.25)',
            }}
          />
          <span className="text-[11px] font-medium text-[hsl(var(--status-ok))]">
            {connected ? 'Live · Gateway Active' : 'Protected · AgentShield'}
          </span>
          {lastUpdate && (
            <span
              className="text-[10px] ml-auto"
              style={{ color: MUTED, opacity: 0.7 }}
              suppressHydrationWarning
            >
              {lastUpdate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
        </div>
        {notifPermission !== 'granted' && notifPermission !== 'denied' && (
          <button
            onClick={requestNotifPermission}
            className="w-full text-left text-[11px] px-2 py-1 rounded-md transition-colors hover:bg-[hsl(var(--secondary))]"
            style={{ background: 'transparent', color: MUTED }}
            title="Get notified even when this tab is in background"
          >
            Enable notifications
          </button>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setDepthEnabled((v) => !v)}
            title="Toggle 3D Spatial Depth"
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
              depthEnabled
                ? 'border-[hsl(var(--brand)/0.4)] bg-[hsl(var(--brand)/0.12)] text-foreground'
                : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-3.5 w-3.5" strokeWidth={1.6} />
            <span>3D</span>
          </button>
          <button
            type="button"
            onClick={() => setIsometricMode((v) => !v)}
            title="Toggle Isometric Stage Perspective"
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
              isometricMode
                ? 'border-[hsl(var(--brand)/0.4)] bg-[hsl(var(--brand)/0.12)] text-foreground'
                : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Box className="h-3.5 w-3.5" strokeWidth={1.6} />
            <span>Iso</span>
          </button>
        </div>
        <AccountWidget />
        <p className="text-[11px]" style={{ color: MUTED, opacity: 0.85 }}>
          v{process.env.APP_VERSION || '1.0.0'}
        </p>
      </div>
    </div>
  )
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [depthEnabled, setDepthEnabled] = useState(true)
  const [isometricMode, setIsometricMode] = useState(false)
  use3DTilt(depthEnabled)
  const {
    connected,
    lastUpdate,
    alerts,
    dismissAlert,
    notifPermission,
    requestNotifPermission,
  } = useTraceStream()

  // Desktop hover-expandable rail state
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const openTimerRef = useRef<NodeJS.Timeout | null>(null)
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Load pinned state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('agentshield_sidebar_pinned')
      if (saved === 'true') {
        setIsPinned(true)
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  const handleTogglePin = () => {
    setIsPinned((prev) => {
      const next = !prev
      try {
        localStorage.setItem('agentshield_sidebar_pinned', String(next))
      } catch {
        // Ignore localStorage errors
      }
      return next
    })
  }

  // Handle Intent-Delay Hover
  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (!openTimerRef.current) {
      openTimerRef.current = setTimeout(() => {
        setIsHovered(true)
        openTimerRef.current = null
      }, 90) // 90ms intent delay
    }
  }

  const handleMouseLeave = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (!closeTimerRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setIsHovered(false)
        closeTimerRef.current = null
      }, 220) // 220ms grace delay
    }
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const isExpanded = isPinned || isHovered || isFocused

  return (
    <div className="relative flex h-screen overflow-hidden" style={{ background: MAIN_BG }}>
      {/* 3D Topographic Depth Canvas Background */}
      <SpatialDepthCanvas enabled={depthEnabled} />

      {/* Desktop Fixed Width Spacer to prevent main content reflow */}
      <div className="hidden md:block w-16 shrink-0" aria-hidden="true" />

      {/* Desktop Hover-Expandable Floating Sidebar */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsFocused(false)
          }
        }}
        className={cn(
          'hidden md:flex md:flex-col fixed left-0 top-0 bottom-0 z-40 border-r border-border/80 transition-[width,box-shadow,background-color] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          isExpanded
            ? 'w-[244px] shadow-[16px_0_48px_-12px_rgba(0,0,0,0.55)] backdrop-blur-xl bg-[hsl(var(--sidebar)/0.96)]'
            : 'w-16 shadow-none bg-[hsl(var(--sidebar))]'
        )}
      >
        <DesktopSidebarContent
          pathname={pathname}
          isExpanded={isExpanded}
          isPinned={isPinned}
          onTogglePin={handleTogglePin}
          connected={connected}
          lastUpdate={lastUpdate}
          notifPermission={notifPermission}
          requestNotifPermission={requestNotifPermission}
          depthEnabled={depthEnabled}
          setDepthEnabled={setDepthEnabled}
          isometricMode={isometricMode}
          setIsometricMode={setIsometricMode}
        />
      </aside>

      {/* Mobile Header */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center px-4 h-14 border-b border-border/80"
        style={{ background: BG }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg text-foreground hover:bg-[hsl(var(--sidebar-active))]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="ml-3">
          <AegisLogo />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: connected ? 'hsl(150 18% 44%)' : 'hsl(0 0% 60%)',
              boxShadow: connected ? '0 0 0 2px hsl(150 18% 44% / 0.25)' : 'none',
            }}
          />
          <span
            className="text-[10px]"
            style={{ color: connected ? 'hsl(150 18% 40%)' : 'hsl(var(--muted-foreground))' }}
          >
            {connected ? 'Live' : '…'}
          </span>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-64 border-r border-border/80 shadow-2xl"
            style={{ background: BG }}
          >
            <div className="flex items-center justify-end px-4 pt-4">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <MobileSidebarContent
              pathname={pathname}
              onLinkClick={() => setMobileOpen(false)}
              connected={connected}
              lastUpdate={lastUpdate}
              notifPermission={notifPermission}
              requestNotifPermission={requestNotifPermission}
              depthEnabled={depthEnabled}
              setDepthEnabled={setDepthEnabled}
              isometricMode={isometricMode}
              setIsometricMode={setIsometricMode}
            />
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden relative z-10">
        <div className="pt-14 md:pt-0">
          <StatusBar />
        </div>
        <main className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8">
            <SpatialStage isometric={isometricMode}>
              {children}
            </SpatialStage>
          </div>
        </main>
      </div>

      {/* Block Alert Toasts */}
      <BlockAlertToast alerts={alerts} dismissAlert={dismissAlert} />
    </div>
  )
}

