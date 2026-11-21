'use client'

import { gw, setSessionToken } from './gateway'

export interface LocalAuthUser {
  id: string
  name: string
  email: string
  role: string
  passwordHash: string
  createdAt: string
}

export interface ActiveUserProfile {
  id: string
  name: string
  email: string
  role: string
  provider: string
  signedInAt: string
}

const USERS_STORAGE_KEY = 'aegis:auth-users'
const ACTIVE_USER_STORAGE_KEY = 'aegis:active-user'

// Salt for password hashing
const HASH_SALT = 'agentguard_sovereign_salt_2026'

/**
 * Computes SHA-256 hash of password with salt.
 * Uses window.crypto.subtle when available; falls back cleanly to deterministic string hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salted = `${password}:${HASH_SALT}`
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(salted)
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    } catch {
      // Fallback below
    }
  }

  // Pure JS DJB2/FNV style deterministic fallback hash for non-HTTPS / SSR contexts
  let hash = 5381
  for (let i = 0; i < salted.length; i++) {
    hash = (hash * 33) ^ salted.charCodeAt(i)
  }
  return `sha256_fallback_${Math.abs(hash).toString(16)}`
}

/**
 * Initializes and retrieves all registered local accounts from localStorage.
 * Ensures the pre-seeded demo operator account is always present.
 */
export async function getLocalUsers(): Promise<LocalAuthUser[]> {
  if (typeof window === 'undefined') return []

  let users: LocalAuthUser[] = []
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY)
    if (raw) {
      users = JSON.parse(raw)
    }
  } catch {
    users = []
  }

  // Ensure default demo admin exists
  const demoEmail = 'admin@agentguard.bank'
  const hasDemo = users.some((u) => u.email.toLowerCase() === demoEmail)
  if (!hasDemo) {
    const defaultHash = await hashPassword('password123')
    const demoAdmin: LocalAuthUser = {
      id: 'usr_admin',
      name: 'Security Admin',
      email: demoEmail,
      role: 'Security Admin',
      passwordHash: defaultHash,
      createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    }
    users.unshift(demoAdmin)
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
    } catch {}
  }

  return users
}

/**
 * Retrieves the currently active signed-in local user profile.
 */
export function getActiveLocalUser(): ActiveUserProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ACTIVE_USER_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {}
  return null
}

/**
 * Persists the active user profile to localStorage.
 */
export function setActiveLocalUser(profile: ActiveUserProfile): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(profile))
    window.dispatchEvent(new CustomEvent('aegis-auth-changed', { detail: profile }))
  } catch {}
}

/**
 * Clears active local user profile on logout.
 */
export function clearActiveLocalUser(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(ACTIVE_USER_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('aegis-auth-changed', { detail: null }))
  } catch {}
}

export interface SignUpParams {
  name: string
  email: string
  password: string
  role?: string
  providerInfo?: { provider: string; state?: string } | null
}

export interface AuthResult {
  ok: boolean
  user?: ActiveUserProfile
  error?: string
}

/**
 * Signs up a brand-new user account, hashes password, saves to localStorage,
 * establishes a session token (via gateway callback or local fallback), and activates profile.
 */
export async function signUpAccount({
  name,
  email,
  password,
  role = 'Security Admin',
  providerInfo,
}: SignUpParams): Promise<AuthResult> {
  const cleanName = name.trim()
  const cleanEmail = email.trim().toLowerCase()

  if (cleanName.length < 2) {
    return { ok: false, error: 'Full name must be at least 2 characters.' }
  }
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    return { ok: false, error: 'Please enter a valid work email address.' }
  }
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters long.' }
  }

  const users = await getLocalUsers()
  if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return { ok: false, error: 'An account with this email already exists. Try signing in.' }
  }

  const pHash = await hashPassword(password)
  const newUser: LocalAuthUser = {
    id: `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    name: cleanName,
    email: cleanEmail,
    role,
    passwordHash: pHash,
    createdAt: new Date().toISOString(),
  }

  users.push(newUser)
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
  } catch {}

  const activeProfile: ActiveUserProfile = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    provider: 'local-vault',
    signedInAt: new Date().toISOString(),
  }
  setActiveLocalUser(activeProfile)

  // Attempt gateway sync if mock provider is active
  let tokenEstablished = false
  if (providerInfo?.provider === 'mock' && providerInfo.state) {
    try {
      const redirect_uri = typeof window !== 'undefined' ? `${window.location.origin}/login/callback` : ''
      const cb = await gw('auth/callback', {
        method: 'POST',
        body: JSON.stringify({
          code: cleanEmail,
          state: providerInfo.state,
          redirect_uri,
        }),
      })
      if (cb.ok) {
        const data = await cb.json()
        if (data.token) {
          setSessionToken(data.token)
          tokenEstablished = true
        }
      }
    } catch {}
  }

  if (!tokenEstablished) {
    // Generate valid structured local session token
    const localToken = `agt_session_${newUser.id}_${Date.now().toString(36)}`
    setSessionToken(localToken)
  }

  return { ok: true, user: activeProfile }
}

export interface SignInParams {
  email: string
  password?: string
  providerInfo?: { provider: string; state?: string } | null
}

/**
 * Signs in an existing account (or demo admin), verifies password hash,
 * establishes a session token, and activates profile.
 */
export async function signInAccount({
  email,
  password = '',
  providerInfo,
}: SignInParams): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail) {
    return { ok: false, error: 'Please enter your work email.' }
  }

  const users = await getLocalUsers()
  const foundUser = users.find((u) => u.email.toLowerCase() === cleanEmail)

  if (foundUser) {
    // Verify password if user provided one
    if (password) {
      const inputHash = await hashPassword(password)
      if (inputHash !== foundUser.passwordHash) {
        return { ok: false, error: 'Incorrect password for this account. Please try again.' }
      }
    }

    const activeProfile: ActiveUserProfile = {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      role: foundUser.role,
      provider: 'local-vault',
      signedInAt: new Date().toISOString(),
    }
    setActiveLocalUser(activeProfile)

    // Attempt gateway token exchange if mock provider available
    let tokenEstablished = false
    if (providerInfo?.provider === 'mock' && providerInfo.state) {
      try {
        const redirect_uri = typeof window !== 'undefined' ? `${window.location.origin}/login/callback` : ''
        const cb = await gw('auth/callback', {
          method: 'POST',
          body: JSON.stringify({
            code: cleanEmail,
            state: providerInfo.state,
            redirect_uri,
          }),
        })
        if (cb.ok) {
          const data = await cb.json()
          if (data.token) {
            setSessionToken(data.token)
            tokenEstablished = true
          }
        }
      } catch {}
    }

    if (!tokenEstablished) {
      const localToken = `agt_session_${foundUser.id}_${Date.now().toString(36)}`
      setSessionToken(localToken)
    }

    return { ok: true, user: activeProfile }
  }

  // If email was not pre-registered in users list but mock gateway is running
  if (providerInfo?.provider === 'mock') {
    const genericUser: ActiveUserProfile = {
      id: `usr_${Date.now().toString(36)}`,
      name: cleanEmail.split('@')[0].replace(/[._]/g, ' '),
      email: cleanEmail,
      role: 'Security Admin',
      provider: 'mock-gateway',
      signedInAt: new Date().toISOString(),
    }
    setActiveLocalUser(genericUser)
    try {
      const redirect_uri = typeof window !== 'undefined' ? `${window.location.origin}/login/callback` : ''
      const cb = await gw('auth/callback', {
        method: 'POST',
        body: JSON.stringify({
          code: cleanEmail,
          state: providerInfo.state,
          redirect_uri,
        }),
      })
      if (cb.ok) {
        const data = await cb.json()
        if (data.token) {
          setSessionToken(data.token)
        }
      }
    } catch {
      setSessionToken(`agt_session_${genericUser.id}`)
    }
    return { ok: true, user: genericUser }
  }

  return { ok: false, error: 'No account found with this email. Switch to Create Account to register.' }
}
