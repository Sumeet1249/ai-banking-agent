'use client'

import React, { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { gw, getSessionToken } from '@/lib/gateway'
import {
  signInAccount,
  signUpAccount,
  getActiveLocalUser,
} from '@/lib/local-auth'
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  Loader2,
  Sparkles,
  Zap,
  Layers,
  KeyRound,
  FileCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Dynamic import of the Studio-Lit 3D Reactive Sovereign Vault stage (SSR: false)
const LoginVault3D = dynamic(
  () => import('@/components/auth/login-vault-3d').then((m) => m.LoginVault3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[360px] flex flex-col items-center justify-center bg-[#070b14] text-xs font-mono text-muted-foreground p-6">
        <div className="h-10 w-10 rounded-full border border-primary/30 border-t-primary animate-spin mb-3" />
        <span className="animate-pulse tracking-wider uppercase text-[11px]">
          Initializing 3D Sovereign Vault Stage...
        </span>
      </div>
    ),
  }
)

interface LoginUrlResponse {
  url: string
  state: string
  provider: 'mock' | 'workos' | 'okta' | 'google' | 'other'
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#070b14] text-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('return_to') || '/'

  // Mode state: 'login' | 'signup'
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  // 3D reactive animation states
  const [passwordFocused, setPasswordFocused] = useState<boolean>(false)
  const [authState, setAuthState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  // Form input states (Sign In)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // Form input states (Sign Up)
  const [signUpName, setSignUpName] = useState('')
  const [signUpEmail, setSignUpEmail] = useState('')
  const [signUpRole, setSignUpRole] = useState('Security Admin')
  const [signUpPassword, setSignUpPassword] = useState('')
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('')
  const [showSignUpPassword, setShowSignUpPassword] = useState(false)

  // UI status
  const [providerInfo, setProviderInfo] = useState<LoginUrlResponse | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [resolvingIdp, setResolvingIdp] = useState(true)

  // Redirect if already logged in
  useEffect(() => {
    if (getSessionToken() || getActiveLocalUser()) {
      router.replace(returnTo)
      return
    }

    // Resolve IdP provider configuration from gateway
    let cancelled = false
    ;(async () => {
      try {
        const redirect_uri =
          typeof window !== 'undefined'
            ? `${window.location.origin}/login/callback`
            : ''
        const res = await gw(
          `auth/login-url?redirect_uri=${encodeURIComponent(redirect_uri)}&return_to=${encodeURIComponent(returnTo)}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as LoginUrlResponse
        if (!cancelled) setProviderInfo(data)
      } catch {
        // Fallback to local/mock provider
        if (!cancelled) {
          setProviderInfo({
            url: '',
            state: 'local_state_' + Date.now().toString(36),
            provider: 'mock',
          })
        }
      } finally {
        if (!cancelled) setResolvingIdp(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router, returnTo])

  // Password strength meter calculation
  const passwordStrength = React.useMemo(() => {
    const pwd = signUpPassword
    if (!pwd) return { score: 0, label: '', color: 'bg-muted' }
    let score = 0
    if (pwd.length >= 6) score++
    if (pwd.length >= 10) score++
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
    if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++

    switch (score) {
      case 1:
        return { score: 1, label: 'Weak', color: 'bg-rose-500' }
      case 2:
        return { score: 2, label: 'Fair', color: 'bg-amber-500' }
      case 3:
        return { score: 3, label: 'Good', color: 'bg-blue-500' }
      case 4:
      default:
        return { score: 4, label: 'Strong', color: 'bg-emerald-500' }
    }
  }, [signUpPassword])

  // Fill Demo Admin account (1-click helper)
  const handleFillDemoAdmin = () => {
    setEmail('admin@agentguard.bank')
    setPassword('password123')
    setFormError(null)
    toast.info('Demo credentials populated: admin@agentguard.bank')
  }

  // Handle Sign In submission
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!email.trim()) {
      setFormError('Please enter your work email.')
      return
    }

    setAuthState('submitting')

    try {
      const res = await signInAccount({
        email: email.trim(),
        password,
        providerInfo,
      })

      if (!res.ok) {
        setAuthState('error')
        setFormError(res.error || 'Authentication failed. Please verify credentials.')
        toast.error(res.error || 'Invalid credentials')
        setTimeout(() => setAuthState('idle'), 1200)
        return
      }

      // Success sequence
      setAuthState('success')
      toast.success(`Access granted! Welcome back, ${res.user?.name || 'Operator'}.`)
      // Give time for the 3D shockwave to flare before redirect
      setTimeout(() => {
        router.replace(returnTo)
      }, 580)
    } catch (err: any) {
      setAuthState('error')
      setFormError(err.message || 'Authentication error')
      setTimeout(() => setAuthState('idle'), 1200)
    }
  }

  // Handle Sign Up (Create Account) submission
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!signUpName.trim() || signUpName.trim().length < 2) {
      setFormError('Please enter your full name (at least 2 characters).')
      return
    }
    if (!signUpEmail.trim() || !signUpEmail.includes('@')) {
      setFormError('Please enter a valid work email.')
      return
    }
    if (signUpPassword.length < 6) {
      setFormError('Password must be at least 6 characters long.')
      return
    }
    if (signUpPassword !== signUpConfirmPassword) {
      setFormError('Passwords do not match. Please re-enter confirm password.')
      return
    }

    setAuthState('submitting')

    try {
      const res = await signUpAccount({
        name: signUpName.trim(),
        email: signUpEmail.trim(),
        password: signUpPassword,
        role: signUpRole,
        providerInfo,
      })

      if (!res.ok) {
        setAuthState('error')
        setFormError(res.error || 'Failed to create account.')
        toast.error(res.error || 'Registration failed')
        setTimeout(() => setAuthState('idle'), 1200)
        return
      }

      setAuthState('success')
      toast.success(`Account established! Welcome to AgentShield, ${res.user?.name}.`)
      setTimeout(() => {
        router.replace(returnTo)
      }, 620)
    } catch (err: any) {
      setAuthState('error')
      setFormError(err.message || 'Registration error')
      setTimeout(() => setAuthState('idle'), 1200)
    }
  }

  // Handle Social / Provider buttons
  const handleSocialClick = async (providerName: string) => {
    if (providerName === 'Passkey' && providerInfo?.url && providerInfo.provider !== 'mock') {
      window.location.href = providerInfo.url
      return
    }

    setSocialLoading(providerName)
    await new Promise((r) => setTimeout(r, 380))
    setSocialLoading(null)
    toast.info(
      `${providerName} authentication is in enterprise preview. Sign in or Create Account using email below.`
    )
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#070b14] text-foreground overflow-hidden selection:bg-primary/20">
      {/* ── LEFT PANEL: FULL-HEIGHT 3D STUDIO STAGE (DESKTOP) ─────────────── */}
      <div className="lg:col-span-7 relative h-72 lg:h-full min-h-[300px] lg:min-h-screen flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-border/80 bg-[#070b14]">
        {/* Top-Left Sovereign Brand Badge */}
        <div className="absolute top-6 left-6 z-20 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-lg backdrop-blur-md">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.6} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                AEGIS <span className="text-muted-foreground font-normal">·</span> AgentShield
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              Zero-Trust Banking Control Plane
            </p>
          </div>
        </div>

        {/* 3D Canvas Stage */}
        <div className="flex-1 w-full h-full">
          <LoginVault3D
            mode={mode}
            passwordFocused={passwordFocused}
            authState={authState}
          />
        </div>

        {/* Bottom-Left Quiet Editorial Overlay (Desktop Only) */}
        <div className="hidden lg:block absolute bottom-6 left-6 right-6 z-20 pointer-events-none">
          <div className="max-w-md p-4 rounded-xl border border-white/10 bg-[#0b1120]/80 backdrop-blur-md shadow-2xl space-y-2 pointer-events-auto">
            <p className="text-xs font-semibold text-slate-200 leading-snug">
              Cryptographic authority for autonomous banking agents.
            </p>
            <div className="flex items-center gap-2 flex-wrap pt-1 text-[10px] font-mono text-muted-foreground">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                <KeyRound className="h-3 w-3 text-emerald-400" />
                Ed25519 Signed Permits
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                <Zap className="h-3 w-3 text-cyan-400" />
                Integer-Paise Mandates
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                <FileCheck className="h-3 w-3 text-purple-400" />
                RFC 6962 Merkle Audit
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: AUTH CONSOLE CARD ─────────────────────────────────── */}
      <div className="lg:col-span-5 flex items-center justify-center p-4 sm:p-8 lg:p-12 overflow-y-auto bg-[#070b14]">
        <div className="max-w-[440px] w-full rounded-2xl border border-border/80 bg-card/90 backdrop-blur-xl shadow-2xl p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-5">
          {/* Header Title */}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>{mode === 'login' ? 'Operator Sign In' : 'Establish Operator Profile'}</span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold">
                FIDO2 / SSO
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === 'login'
                ? 'Authenticate to access sovereign policies and execution telemetry.'
                : 'Register a cryptographic administrator profile on this node.'}
            </p>
          </div>

          {/* Segmented Mode Tab Switcher */}
          <div className="p-1 rounded-xl bg-secondary/80 border border-border grid grid-cols-2 gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setFormError(null)
              }}
              className={cn(
                "py-1.5 rounded-lg transition-[background-color,color,box-shadow] duration-200 flex items-center justify-center gap-1.5",
                mode === 'login'
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setFormError(null)
              }}
              className={cn(
                "py-1.5 rounded-lg transition-[background-color,color,box-shadow] duration-200 flex items-center justify-center gap-1.5",
                mode === 'signup'
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <User className="h-3.5 w-3.5 text-cyan-500" />
              <span>Create Account</span>
            </button>
          </div>

          {/* Social / Provider Auth Row (Tactile 2x2 Grid) */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {/* Google */}
              <button
                type="button"
                onClick={() => handleSocialClick('Google')}
                disabled={Boolean(socialLoading)}
                className="h-10 px-3 rounded-xl border border-border bg-secondary/40 hover:bg-secondary text-xs font-medium text-foreground transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {socialLoading === 'Google' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Google</span>
              </button>

              {/* GitHub */}
              <button
                type="button"
                onClick={() => handleSocialClick('GitHub')}
                disabled={Boolean(socialLoading)}
                className="h-10 px-3 rounded-xl border border-border bg-secondary/40 hover:bg-secondary text-xs font-medium text-foreground transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {socialLoading === 'GitHub' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <svg className="h-4 w-4 shrink-0 fill-current text-foreground" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                )}
                <span>GitHub</span>
              </button>

              {/* ChatGPT / OpenAI */}
              <button
                type="button"
                onClick={() => handleSocialClick('ChatGPT')}
                disabled={Boolean(socialLoading)}
                className="h-10 px-3 rounded-xl border border-border bg-secondary/40 hover:bg-secondary text-xs font-medium text-foreground transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {socialLoading === 'ChatGPT' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <svg className="h-4 w-4 shrink-0 fill-current text-foreground" viewBox="0 0 24 24">
                    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.771-4.205 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.746-7.074zM13.26 22.63a4.67 4.67 0 0 1-2.97-1.076l.166-.094 4.926-2.843a.7.7 0 0 0 .351-.607v-6.945l2.09 1.206a.07.07 0 0 1 .035.053v5.632a4.694 4.694 0 0 1-4.598 4.676zM3.464 18.046a4.654 4.654 0 0 1-.62-3.107l.167.1 4.926 2.844a.7.7 0 0 0 .7 0l6.015-3.473v2.413a.07.07 0 0 1-.035.06l-4.877 2.815a4.694 4.694 0 0 1-6.276-1.652zm-1.42-9.43a4.664 4.664 0 0 1 2.35-2.031v6.07a.7.7 0 0 0 .35.607l6.015 3.473-2.09 1.206a.07.07 0 0 1-.07 0l-4.878-2.815A4.694 4.694 0 0 1 2.044 8.616zm15.932 3.513l-6.015-3.473 2.09-1.206a.07.07 0 0 1 .07 0l4.877 2.815a4.694 4.694 0 0 1 .62 7.784v-5.313a.7.7 0 0 0-.352-.607l-.29-.168zm2.012-3.03l-.167-.1-4.926-2.844a.7.7 0 0 0-.7 0L8.17 9.628V7.215a.07.07 0 0 1 .035-.06l4.877-2.815a4.694 4.694 0 0 1 6.894 4.758zM8.616 14.15l-2.09-1.206a.07.07 0 0 1-.035-.053V7.259a4.694 4.694 0 0 1 7.568-3.6l-.166.094-4.926 2.844a.7.7 0 0 0-.351.607v6.945zm1.503-2.545l2.7-1.558 2.7 1.558v3.117l-2.7 1.558-2.7-1.558v-3.117z"/>
                  </svg>
                )}
                <span>ChatGPT</span>
              </button>

              {/* Passkey / SSO */}
              <button
                type="button"
                onClick={() => handleSocialClick('Passkey')}
                disabled={Boolean(socialLoading)}
                className="h-10 px-3 rounded-xl border border-border bg-secondary/40 hover:bg-secondary text-xs font-medium text-foreground transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {socialLoading === 'Passkey' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Fingerprint className="h-4 w-4 text-emerald-400" />
                )}
                <span>Passkey</span>
              </button>
            </div>

            {/* Hairline Divider */}
            <div className="relative py-2 flex items-center justify-center">
              <div className="w-full border-t border-border/80" />
              <span className="absolute px-3 bg-card text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                or continue with credentials
              </span>
            </div>
          </div>

          {/* Inline Form Error Banner */}
          {formError && (
            <div className="rounded-xl p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-start gap-2.5 animate-in fade-in duration-200">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <span className="leading-snug">{formError}</span>
            </div>
          )}

          {/* ── TAB 1: WORKING SIGN IN FORM ─────────────────────────────────── */}
          {mode === 'login' && (
            <form onSubmit={handleSignInSubmit} className="space-y-4 text-xs">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground flex items-center justify-between">
                  <span>Work Email</span>
                  <button
                    type="button"
                    onClick={handleFillDemoAdmin}
                    className="text-[10px] font-mono text-primary hover:underline font-bold"
                  >
                    Fill Demo Admin
                  </button>
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="admin@agentguard.bank"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-mono focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground flex items-center justify-between">
                  <span>Vault Password</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Demo: password123
                  </span>
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-mono focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <span className="text-xs text-muted-foreground">Keep operator session active</span>
                </label>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={authState === 'submitting' || !email.trim()}
                className={cn(
                  "w-full py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-50",
                  authState === 'success'
                    ? "bg-emerald-600 text-white"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {authState === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying Credentials &amp; Permits...</span>
                  </>
                ) : authState === 'success' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Access Granted · Entering Console</span>
                  </>
                ) : (
                  <>
                    <span>Sign in to Control Plane</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── TAB 2: WORKING CREATE ACCOUNT (SIGN UP) FORM ─────────────────── */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUpSubmit} className="space-y-3.5 text-xs">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Full Name</label>
                <div className="relative flex items-center">
                  <User className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="Mohit Agarwal"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                  />
                </div>
              </div>

              {/* Work Email */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Work Email</label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="mohit@acme-bank.com"
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-mono focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                  />
                </div>
              </div>

              {/* Role Select */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Role Designation</label>
                <select
                  value={signUpRole}
                  onChange={(e) => setSignUpRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                >
                  <option value="Security Admin">Security Admin (Zero-Trust Root)</option>
                  <option value="Risk Engineer">Risk Engineer (Mandates &amp; Invariants)</option>
                  <option value="SOC Analyst">SOC Analyst (Approvals &amp; Anomaly)</option>
                  <option value="Compliance Auditor">Compliance Auditor (RFC 6962 Witness)</option>
                </select>
              </div>

              {/* Password with Strength Meter */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-foreground">Master Password</label>
                  {passwordStrength.label && (
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">
                      Strength: <strong className="text-foreground">{passwordStrength.label}</strong>
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type={showSignUpPassword ? 'text' : 'password'}
                    required
                    placeholder="Min 6 characters"
                    value={signUpPassword}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs font-mono focus:ring-1 focus:ring-primary focus:border-primary outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* 4-bar Strength Indicator */}
                {signUpPassword && (
                  <div className="grid grid-cols-4 gap-1 pt-1">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={cn(
                          "h-1 rounded-full transition-colors duration-200",
                          step <= passwordStrength.score ? passwordStrength.color : "bg-secondary"
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground flex items-center justify-between">
                  <span>Confirm Password</span>
                  {signUpConfirmPassword && signUpPassword !== signUpConfirmPassword && (
                    <span className="text-[10px] text-rose-500 font-semibold">Mismatch</span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type={showSignUpPassword ? 'text' : 'password'}
                    required
                    placeholder="Re-enter password"
                    value={signUpConfirmPassword}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                    className={cn(
                      "w-full pl-9 pr-3 py-2.5 rounded-xl border bg-background text-foreground text-xs font-mono focus:ring-1 outline-none transition",
                      signUpConfirmPassword && signUpPassword !== signUpConfirmPassword
                        ? "border-rose-500 focus:ring-rose-500"
                        : "border-border focus:ring-primary focus:border-primary"
                    )}
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={authState === 'submitting' || !signUpEmail.trim()}
                className={cn(
                  "w-full py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-50",
                  authState === 'success'
                    ? "bg-emerald-600 text-white"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {authState === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Establishing Operator Record...</span>
                  </>
                ) : authState === 'success' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Account Established · Entering Console</span>
                  </>
                ) : (
                  <>
                    <span>Create Account &amp; Enter</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Navigation Link */}
          <div className="pt-2 border-t border-border/80 flex items-center justify-between text-xs text-muted-foreground">
            {mode === 'login' ? (
              <p>
                Need operator credentials?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup')
                    setFormError(null)
                  }}
                  className="font-semibold text-foreground hover:text-primary transition"
                >
                  Create Account →
                </button>
              </p>
            ) : (
              <p>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
                    setFormError(null)
                  }}
                  className="font-semibold text-foreground hover:text-primary transition"
                >
                  Sign In instead →
                </button>
              </p>
            )}

            <Link
              href="/welcome"
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition underline"
            >
              Tour System
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
