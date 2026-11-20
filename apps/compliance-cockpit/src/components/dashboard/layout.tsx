'use client'

import { ReactNode, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, Shield, ScrollText, Sparkles,
  CheckCircle, AlertTriangle, Settings, FlaskConical,
  ShieldHalf, Compass, ClipboardList, UserRound, Layers, FileCheck2,
  ScanLine, Menu, X, Wrench, ChevronDown, Brain, Undo2, Box, Wallet
} from 'lucide-react'
import { useTraceStream } from '@/hooks/useTraceStream'
import { useLicenseTier, hasTier } from '@/hooks/useLicenseTier'
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

// Primary nav — what an ops / compliance user uses 90% of the time.
// `tier` — the minimum paid tier that unlocks this nav item. Free
// users see the item with a small badge; clicking still navigates,
// but the target page renders a TierGate upsell instead of the
// feature. Absent = available to Free tier.
type NavDef = { name: string; href: string; icon: any; badge?: string }
// Grouped in logical sequence for Hackathon Bank Agent Security
const navGroups: Array<{ label: string | null; items: NavDef[] }> = [
  { label: 'Mission Control', items: [
    { name: 'AI Workflow Studio', href: '/workflow-studio', icon: Sparkles, badge: 'AUTO-AI' },
    { name: 'Banking Command', href: '/banking', icon: Layers, badge: 'DEFENSE' },
    { name: 'Overview',    href: '/',           icon: LayoutDashboard },
    { name: 'Activity',    href: '/traces',     icon: FileText        },
    { name: 'Approvals',   href: '/approvals',  icon: CheckCircle     },
  ] },
  { label: 'Defend & Protect', items: [
    { name: 'Security 360', href: '/coverage',  icon: ShieldHalf      },
    { name: 'Category Budget Pools', href: '/budget-pools', icon: Wallet, badge: 'POOLS' },
    { name: 'Policies & Mandates', href: '/policies',   icon: Shield          },
    { name: 'Policy Packs',href: '/dsl/packs',  icon: ScrollText      },
    { name: 'Violations',  href: '/violations', icon: AlertTriangle   },
    { name: 'Rollbacks',   href: '/rollbacks',  icon: Undo2           },
  ] },
  { label: 'AI Agents', items: [
    { name: 'Agent Registry', href: '/agents',     icon: UserRound       },
  ] },
  { label: 'Regulatory & Audit', items: [
    { name: 'Audit Log & Witness', href: '/audit-log',  icon: ClipboardList   },
    { name: 'Compliance Proofs',  href: '/compliance', icon: FileCheck2      },
  ] },
  { label: null, items: [
    { name: 'Settings',    href: '/settings',   icon: Settings        },
  ] },
]
const navigation: NavDef[] = navGroups.flatMap(g => g.items)

// All values resolve from CSS variables in globals.css (:root). Edit the
// palette there to retheme the entire Cockpit — nothing else to change.
const BG        = 'hsl(var(--sidebar))'
const MAIN_BG   = 'hsl(var(--background))'
const BORDER    = 'hsl(var(--border))'
const TEXT      = 'hsl(var(--foreground))'
const MUTED     = 'hsl(var(--muted-foreground))'
const ACTIVE_BG = 'hsl(var(--sidebar-active))'

function AegisLogo() {
  // Sans wordmark: weight and tracking carry the identity, same face as the UI.
  return (
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
    >
      AgentShield
    </span>
  )
}

type NavItem = { name: string; href: string; icon: typeof LayoutDashboard; badge?: string }

function NavLink({ item, pathname, onLinkClick, depth = 0 }: {
  item: NavItem; pathname: string; onLinkClick?: () => void; depth?: number
}) {
  const isActive = pathname === item.href
  return (
    <Link
      href={item.href}
      onClick={onLinkClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]',
        isActive
          ? 'font-medium bg-[hsl(var(--sidebar-active))] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
          : 'font-normal text-muted-foreground hover:bg-[hsl(var(--sidebar-active))] hover:text-foreground'
      )}
      style={{
        paddingLeft: depth > 0 ? '1.75rem' : undefined,
      }}
    >
      <item.icon
        className="h-4 w-4 flex-shrink-0"
        style={{ color: isActive ? TEXT : MUTED, opacity: isActive ? 1 : 0.8 }}
      />
      <span>{item.name}</span>
      {item.badge && (
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          {item.badge}
        </span>
      )}
    </Link>
  )
}

function SidebarContent({
  pathname,
  connected,
  lastUpdate,
  notifPermission,
  requestNotifPermission,
  onLinkClick,
  depthEnabled,
  setDepthEnabled,
  isometricMode,
  setIsometricMode,
}: {
  pathname: string
  connected: boolean
  lastUpdate: Date | null
  notifPermission: NotificationPermission | 'default'
  requestNotifPermission: () => void
  onLinkClick?: () => void
  depthEnabled: boolean
  setDepthEnabled: React.Dispatch<React.SetStateAction<boolean>>
  isometricMode: boolean
  setIsometricMode: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <>
      {/* Logo */}
      <div className="flex items-center px-4 py-5">
        <AegisLogo />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {navGroups.map((g, gi) => (
          <div key={gi} className={gi ? 'pt-3' : ''}>
            {g.label && (
              <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                 style={{ color: 'hsl(var(--muted-foreground) / 0.8)' }}>{g.label}</p>
            )}
            {g.items.map(item => (
              <NavLink key={item.name} item={item} pathname={pathname} onLinkClick={onLinkClick} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t space-y-2" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
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
              {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
        <p className="text-[11px]" style={{ color: MUTED, opacity: 0.85 }}>v{process.env.APP_VERSION}</p>
      </div>
    </>
  )
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [depthEnabled, setDepthEnabled] = useState(true)
  const [isometricMode, setIsometricMode] = useState(false)
  use3DTilt(depthEnabled)
  const { connected, lastUpdate, alerts, dismissAlert, notifPermission, requestNotifPermission } = useTraceStream()

  const sidebarProps = {
    pathname,
    connected,
    lastUpdate,
    notifPermission,
    requestNotifPermission,
    depthEnabled,
    setDepthEnabled,
    isometricMode,
    setIsometricMode,
  }

  return (
    <div className="relative flex h-screen overflow-hidden" style={{ background: MAIN_BG }}>
      {/* 3D Topographic Depth Canvas Background */}
      <SpatialDepthCanvas enabled={depthEnabled} />

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex md:flex-col w-56 flex-shrink-0 border-r relative z-20"
        style={{ background: BG, borderColor: BORDER }}
      >
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center px-4 h-14 border-b"
        style={{ background: BG, borderColor: BORDER }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg"
          style={{ color: TEXT }}
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
          <span className="text-[10px]" style={{ color: connected ? 'hsl(150 18% 40%)' : 'hsl(var(--muted-foreground))' }}>
            {connected ? 'Live' : '…'}
          </span>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-64 border-r shadow-xl"
            style={{ background: BG, borderColor: BORDER }}
          >
            <div className="flex items-center justify-end px-4 pt-4">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg"
                style={{ color: MUTED }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent {...sidebarProps} onLinkClick={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden relative z-10">
        {/* Live status bar — protected | traces | blocked | pending */}
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

      {/* Block alert toasts */}
      <BlockAlertToast alerts={alerts} dismissAlert={dismissAlert} />
    </div>
  )
}
