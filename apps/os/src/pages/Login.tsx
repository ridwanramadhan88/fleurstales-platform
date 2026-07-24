import type { FC, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Flower2, KeyRound, LogIn, Mail } from 'lucide-react'
import type { Employee } from '../store/hrStoreTypes'
import { useHrStore } from '../store/hrStore'
import type { Theme } from '../hooks/useTheme'
import { ThemeToggle } from '../components/ui/theme-toggle'
import { LanguageToggle } from '../components/ui/language-toggle'
import { InfoDisclosure } from '../components/ui/info-disclosure'
import { normalizeUsername } from '../domain/staffAccountDomain'
import { isSharedBackendConfigured, signInSharedBackend } from '../api/remoteSession'
import { isSupabaseConfigured } from '../data/shared/supabaseConfig'
import {
  initializeSupabaseAuth,
  sendSupabasePasswordReset,
  signInSupabaseWithPassword,
  signOutSupabase,
  subscribeSupabaseAuth,
  updateSupabasePassword,
} from '../api/supabaseAuth'
import { refreshSupabaseStaffSession } from '../data/shared/staffSessionBridge'
import type { SharedStaffSession } from '../data/shared/staffSessionDomain'

export interface LoginPageProps {
  onSignIn: (employee: Employee) => void
  theme?: Theme
  onToggleTheme?: () => void
}

export const LoginPage: FC<LoginPageProps> = ({ onSignIn, theme = 'light', onToggleTheme }) => {
  const employees = useHrStore((state) => state.employees)
  const usesSupabase = isSupabaseConfigured()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'forgot' | 'set-password'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const finishSupabaseSignIn = async (): Promise<void> => {
    const result = await refreshSupabaseStaffSession()
    if (result.kind !== 'ready') {
      await signOutSupabase()
      throw new Error(result.kind === 'unauthorized'
        ? 'This account does not have active Fleurstales OS access.'
        : 'Unable to load this staff account.')
    }
    const profile = result.session
    const employee = profile.employeeId
      ? employees.find((candidate) => candidate.id === profile.employeeId)
      : undefined
    onSignIn(employee ?? staffSessionToEmployee(profile))
  }

  useEffect(() => {
    if (!usesSupabase) return
    let cancelled = false
    const isPasswordSetupLink = /(?:[?#&])type=(?:recovery|invite)(?:&|$)/.test(window.location.href)
    const restore = async () => {
      try {
        const session = await initializeSupabaseAuth()
        if (cancelled || !session) return
        if (isPasswordSetupLink) {
          setMode('set-password')
          return
        }
        await finishSupabaseSignIn()
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to restore your session.')
      }
    }
    void restore()
    const unsubscribe = subscribeSupabaseAuth((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('set-password')
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  // Employee records are stable for the lifetime of this login screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesSupabase])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSigningIn(true)
    setError(null)
    setNotice(null)
    try {
      if (usesSupabase) {
        if (mode === 'forgot') {
          await sendSupabasePasswordReset(email)
          setNotice('Check your email for a secure password reset link.')
          return
        }
        if (mode === 'set-password') {
          if (password.length < 8) throw new Error('Use at least 8 characters for your password.')
          if (password !== confirmPassword) throw new Error('Passwords do not match.')
          await updateSupabasePassword(password)
          await finishSupabaseSignIn()
          return
        }
        await signInSupabaseWithPassword(email, password)
        await finishSupabaseSignIn()
        return
      }
      const normalized = normalizeUsername(username)
      const account = isSharedBackendConfigured()
        ? await signInSharedBackend(normalized, pin)
        : employees.find((employee) => employee.status === 'active' && employee.username === normalized && employee.pin === pin) ?? null
      if (!account) {
        setError('Invalid username or PIN, or this account is inactive.')
        return
      }
      setError(null)
      onSignIn(account)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reach the sign-in service.')
    } finally {
      setIsSigningIn(false)
    }
  }

  const authTitle = mode === 'forgot' ? 'Reset password' : mode === 'set-password' ? 'Create password' : 'Sign in'
  const authHelp = mode === 'forgot'
    ? 'We’ll email you a secure reset link.'
    : mode === 'set-password'
      ? 'Choose a password for your Fleurstales OS account.'
      : usesSupabase ? 'Use your staff email and password.' : 'Use your staff username and six-digit PIN.'

  return (
    <div className="min-h-screen bg-background px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-foreground sm:flex sm:items-center sm:justify-center sm:py-8">
      <div className="mx-auto w-full max-w-sm space-y-4">
        <div className="flex items-center justify-end gap-1">
          <LanguageToggle />
          {onToggleTheme && <ThemeToggle theme={theme} onToggle={onToggleTheme} />}
        </div>

        <header className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border/60">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-ios-sm">
            <Flower2 className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold leading-tight">Fleurstales OS</h1>
            <p className="mt-0.5 text-xs leading-tight text-muted-foreground">Secure staff workspace</p>
          </div>
        </header>

        <form onSubmit={submit} className="space-y-3.5 rounded-xl bg-card p-4 ring-1 ring-border/60">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">{authTitle}</h2>
            <p className="text-xs text-muted-foreground">{authHelp}</p>
          </div>

          {usesSupabase && mode !== 'set-password' ? <label className="block space-y-1.5">
            <span className="text-xs font-medium">Email</span>
            <input aria-label="Email" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40" />
          </label> : null}
          {!usesSupabase ? <label className="block space-y-1.5">
            <span className="text-xs font-medium">Username</span>
            <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="username" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40" />
          </label> : null}
          {(!usesSupabase || mode !== 'forgot') ? <label className="block space-y-1.5">
            <span className="text-xs font-medium">{usesSupabase ? (mode === 'set-password' ? 'New password' : 'Password') : 'PIN'}</span>
            <input
              aria-label={usesSupabase ? (mode === 'set-password' ? 'New password' : 'Password') : 'PIN'}
              autoComplete={mode === 'set-password' ? 'new-password' : 'current-password'}
              inputMode={usesSupabase ? undefined : 'numeric'}
              type="password"
              maxLength={usesSupabase ? undefined : 6}
              value={usesSupabase ? password : pin}
              onChange={(e) => usesSupabase ? setPassword(e.target.value) : setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={usesSupabase ? (mode === 'set-password' ? 'At least 8 characters' : 'Password') : '6-digit PIN'}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
            />
          </label> : null}
          {usesSupabase && mode === 'set-password' ? <label className="block space-y-1.5">
            <span className="text-xs font-medium">Confirm password</span>
            <input aria-label="Confirm password" autoComplete="new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40" />
          </label> : null}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/30">{error}</p>}
          {notice && <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground ring-1 ring-primary/25">{notice}</p>}
          <button type="submit" disabled={isSigningIn || (usesSupabase ? (mode === 'forgot' ? !email : mode === 'set-password' ? !password || !confirmPassword : !email || !password) : !username || pin.length !== 6)} className="flex w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition disabled:bg-primary/45 disabled:text-primary-foreground/90 disabled:opacity-100 px-[18px] whitespace-nowrap h-11 gap-2">
            {mode === 'forgot' ? <Mail className="size-4" /> : mode === 'set-password' ? <KeyRound className="size-4" /> : <LogIn className="size-4" />}
            {isSigningIn ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : mode === 'set-password' ? 'Save password' : 'Sign in'}
          </button>
          {usesSupabase && mode !== 'set-password' ? <button type="button" onClick={() => { setMode(mode === 'forgot' ? 'signin' : 'forgot'); setError(null); setNotice(null) }} className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground">
            {mode === 'forgot' ? 'Back to sign in' : 'Forgot password?'}
          </button> : null}
        </form>

        {!usesSupabase && <InfoDisclosure title="Demo staff credentials" className="text-center">
          <div className="space-y-1 text-left">
            <p>Username: <code>owner</code>, <code>finance</code>, <code>hr</code>, or staff names such as <code>akbar</code> or <code>zahra</code>.</p>
            <p>PIN: <code>123456</code></p>
          </div>
        </InfoDisclosure>}
      </div>
    </div>
  )
}

const staffSessionToEmployee = (session: SharedStaffSession): Employee => ({
  id: session.employeeId ?? session.userId ?? 'supabase-staff',
  name: session.displayName,
  position: session.role[0].toUpperCase() + session.role.slice(1),
  branch: (session.branchId ?? '') as Employee['branch'],
  systemRole: session.role,
  status: 'active',
  phone: '',
  hireDate: new Date().toISOString().slice(0, 10),
  username: session.role,
})

export default LoginPage
