'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { gw, getSessionToken, clearSessionToken } from '@/lib/gateway'
import { getActiveLocalUser, clearActiveLocalUser, ActiveUserProfile } from '@/lib/local-auth'
import { LogIn, LogOut, UserRound, Loader2, ShieldCheck } from 'lucide-react'

const BORDER = 'hsl(var(--border))'
const TEXT   = 'hsl(var(--foreground))'
const MUTED  = 'hsl(var(--muted-foreground))'
const OK     = 'hsl(var(--status-ok))'

interface MeUser {
  id: string
  email: string
  name?: string
  role: string
  provider: string
}

/**
 * Sidebar account widget.
 * Seamlessly integrates local-auth profiles with backend SSO /auth/me fallback.
 */
export function AccountWidget() {
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'in' | 'out'>('in')
  const [user, setUser]   = useState<MeUser | null>(null)
  const [busy, setBusy]   = useState(false)

  const syncUser = async () => {
    // 1. Prefer local active user profile if available
    const localUser = getActiveLocalUser()
    if (localUser) {
      setUser({
        id: localUser.id,
        email: localUser.email,
        name: localUser.name,
        role: localUser.role,
        provider: localUser.provider,
      })
      setState('in')
      return
    }

    // 2. If session token exists, query backend gateway /auth/me
    if (getSessionToken()) {
      try {
        const res = await gw('auth/me')
        if (res.ok) {
          const data = await res.json()
          if (data.user) {
            setUser(data.user)
            setState('in')
            return
          }
        }
      } catch {}
    }

    // 3. Fallback default operator demo profile
    const defaultUser: MeUser = {
      id: 'usr_admin',
      email: 'admin@agentguard.bank',
      name: 'Security Admin',
      role: 'Security Admin',
      provider: 'local-vault',
    }
    setUser(defaultUser)
    setState('in')
  }

  useEffect(() => {
    syncUser()

    const onAuthChanged = (e: any) => {
      if (e.detail) {
        setUser({
          id: e.detail.id,
          email: e.detail.email,
          name: e.detail.name,
          role: e.detail.role,
          provider: e.detail.provider,
        })
        setState('in')
      } else {
        syncUser()
      }
    }

    window.addEventListener('aegis-auth-changed', onAuthChanged)
    window.addEventListener('storage', syncUser)
    return () => {
      window.removeEventListener('aegis-auth-changed', onAuthChanged)
      window.removeEventListener('storage', syncUser)
    }
  }, [])

  async function handleSignOut() {
    setBusy(true)
    try {
      await gw('auth/logout', { method: 'POST' }).catch(() => {})
    } catch {}
    clearActiveLocalUser()
    clearSessionToken()
    setUser(null)
    setState('out')
    setBusy(false)
    router.push('/login')
  }

  if (state === 'loading') {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-md"
        style={{ color: MUTED }}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-[11px]">Loading account…</span>
      </div>
    )
  }

  if (state === 'out') {
    return (
      <Link
        href="/login"
        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-opacity hover:opacity-70"
        style={{ background: 'transparent', border: '1px solid hsl(var(--border))', color: MUTED }}
      >
        <LogIn className="h-3 w-3" />
        <span>Sign in</span>
        <span className="ml-auto" style={{ color: MUTED, opacity: 0.7 }}>
          for audit
        </span>
      </Link>
    )
  }

  return (
    <div className="space-y-1.5">
      <div
        className="flex items-center gap-2 px-2 py-1"
        style={{ color: TEXT }}
      >
        <UserRound className="h-3 w-3" style={{ color: OK }} />
        <span className="text-[11px] truncate" title={user?.email}>
          {user?.email}
        </span>
      </div>
      <button
        onClick={handleSignOut}
        disabled={busy}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-opacity hover:opacity-70 disabled:opacity-40"
        style={{ background: 'transparent', border: '1px solid hsl(var(--border))', color: MUTED }}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <LogOut className="h-3 w-3" />
        )}
        <span>Sign out</span>
        <span className="ml-auto capitalize" style={{ color: MUTED, opacity: 0.7 }}>
          {user?.role}
        </span>
      </button>
    </div>
  )
}
