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
import { isStrongStaffPassword, STAFF_PASSWORD_HELP } from '../domain/staffCredentialDomain'
import { isSharedBackendConfigured, signInSharedBackend } from '../api/remoteSession'
import { isSupabaseConfigured } from '../data/shared/supabaseConfig'
import {
  initializeSupabaseAuth,
  sendSupabasePasswordReset,
  signInSupabaseWithUsername,
  signOutSupabase,
  subscribeSupabaseAuth,
  updateSupabasePassword,
} from '../api/supabaseAuth'
import { refreshSupabaseStaffSession } from '../data/shared/staffSessionBridge'
import type { SharedStaffSession } from '../data/shared/staffSessionDomain'
import { useUiLanguage, type UiLanguage } from '../i18n/uiLanguage'

export interface LoginPageProps {
  onSignIn: (employee: Employee) => void | Promise<void>
  theme?: Theme
  onToggleTheme?: () => void
}

const LOGIN_COPY = {
  id: {
    workspace: 'Ruang kerja staf aman',
    signIn: 'Masuk',
    resetPassword: 'Atur ulang kata sandi',
    createPassword: 'Buat kata sandi',
    signInHelp: 'Gunakan nama pengguna atau email staf dan kata sandi.',
    resetHelp: 'Kami akan mengirim tautan aman untuk mengatur ulang kata sandi.',
    passwordHelp: 'Gunakan minimal 6 karakter dengan kombinasi huruf dan angka.',
    usernameOrEmail: 'Nama pengguna atau email',
    username: 'Nama pengguna',
    usernameOrEmailPlaceholder: 'nama pengguna atau email',
    usernamePlaceholder: 'nama pengguna',
    password: 'Kata Sandi',
    newPassword: 'Kata sandi baru',
    confirmPassword: 'Konfirmasi kata sandi',
    repeatPassword: 'Ulangi kata sandi',
    opening: 'Membuka Fleurstales OS',
    restoring: 'Memulihkan sesi aman Anda…',
    pleaseWait: 'Mohon tunggu…',
    sendReset: 'Kirim tautan reset',
    savePassword: 'Simpan kata sandi',
    forgotPassword: 'Lupa kata sandi?',
    backToSignIn: 'Kembali ke halaman masuk',
    resetSent: 'Periksa email Anda untuk tautan aman pengaturan ulang kata sandi.',
    inactiveAccount: 'Akun ini tidak memiliki akses aktif ke Fleurstales OS.',
    accountLoadFailed: 'Akun staf ini tidak dapat dimuat.',
    invalidLogin: 'Nama pengguna atau kata sandi salah, atau akun ini tidak aktif.',
    incorrectLogin: 'Nama pengguna atau kata sandi salah.',
    passwordMismatch: 'Kata sandi tidak sama.',
    serviceUnavailable: 'Layanan masuk tidak dapat dijangkau. Silakan coba lagi.',
    restoreFailed: 'Sesi Anda tidak dapat dipulihkan. Silakan masuk kembali.',
    sessionExpired: 'Sesi aman Anda telah berakhir. Silakan masuk kembali.',
    workspaceLoadFailed: 'Sesi berhasil diverifikasi, tetapi data Fleurstales OS belum dapat dimuat. Silakan masuk kembali.',
    localCredentials: 'Kredensial staf lokal',
  },
  en: {
    workspace: 'Secure staff workspace',
    signIn: 'Sign in',
    resetPassword: 'Reset password',
    createPassword: 'Create password',
    signInHelp: 'Use your staff username or email and password.',
    resetHelp: 'We’ll email you a secure reset link.',
    passwordHelp: STAFF_PASSWORD_HELP,
    usernameOrEmail: 'Username or email',
    username: 'Username',
    usernameOrEmailPlaceholder: 'username or email',
    usernamePlaceholder: 'username',
    password: 'Password',
    newPassword: 'New password',
    confirmPassword: 'Confirm password',
    repeatPassword: 'Repeat password',
    opening: 'Opening Fleurstales OS',
    restoring: 'Restoring your secure session…',
    pleaseWait: 'Please wait…',
    sendReset: 'Send reset link',
    savePassword: 'Save password',
    forgotPassword: 'Forgot password?',
    backToSignIn: 'Back to sign in',
    resetSent: 'Check your email for a secure password reset link.',
    inactiveAccount: 'This account does not have active Fleurstales OS access.',
    accountLoadFailed: 'Unable to load this staff account.',
    invalidLogin: 'Invalid username or password, or this account is inactive.',
    incorrectLogin: 'Incorrect username or password.',
    passwordMismatch: 'Password entries do not match.',
    serviceUnavailable: 'Unable to reach the sign-in service. Please try again.',
    restoreFailed: 'Unable to restore your session. Please sign in again.',
    sessionExpired: 'Your secure session expired. Please sign in again.',
    workspaceLoadFailed: 'Your session was verified, but Fleurstales OS data could not be loaded. Please sign in again.',
    localCredentials: 'Local staff credentials',
  },
} as const

const userFacingLoginError = (
  cause: unknown,
  language: UiLanguage,
): string => {
  const copy = LOGIN_COPY[language]
  if (!(cause instanceof Error)) return copy.serviceUnavailable
  const message = cause.message
  if (message.includes('SESSION_REQUIRED') || message.includes('secure Fleurstales session expired')) {
    return copy.sessionExpired
  }
  if (message.startsWith('Fleurstales startup hydration failed:')) {
    return copy.workspaceLoadFailed
  }
  if (message === 'Incorrect username or password.') return copy.incorrectLogin
  if (message === 'Unable to reach the staff sign-in service. Please try again.') return copy.serviceUnavailable
  return message
}

export const LoginPage: FC<LoginPageProps> = ({ onSignIn, theme = 'light', onToggleTheme }) => {
  const employees = useHrStore((state) => state.employees)
  const language = useUiLanguage((state) => state.language)
  const copy = LOGIN_COPY[language]
  const usesSupabase = isSupabaseConfigured()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'forgot' | 'set-password'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isRestoringSession, setIsRestoringSession] = useState(usesSupabase)

  const finishSupabaseSignIn = async (): Promise<void> => {
    const result = await refreshSupabaseStaffSession()
    if (result.kind !== 'ready') {
      await signOutSupabase()
      throw new Error(result.kind === 'unauthorized' ? copy.inactiveAccount : copy.accountLoadFailed)
    }
    const profile = result.session
    const employee = profile.employeeId
      ? employees.find((candidate) => candidate.id === profile.employeeId)
      : undefined
    await onSignIn(reconcileSupabaseEmployeeRole(employee, profile))
  }

  useEffect(() => {
    if (!usesSupabase) return
    let cancelled = false
    const isPasswordSetupLink = /(?:[?#&])type=(?:recovery|invite)(?:&|$)/.test(window.location.href)
    const restore = async () => {
      try {
        const session = await initializeSupabaseAuth()
        if (cancelled) return
        if (!session) {
          setIsRestoringSession(false)
          return
        }
        if (isPasswordSetupLink) {
          setMode('set-password')
          setIsRestoringSession(false)
          return
        }
        await finishSupabaseSignIn()
      } catch (cause) {
        if (!cancelled) {
          console.error('Unable to restore Fleurstales OS session.', cause)
          setError(userFacingLoginError(cause, language))
          setIsRestoringSession(false)
        }
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
          setNotice(copy.resetSent)
          return
        }
        if (mode === 'set-password') {
          if (!isStrongStaffPassword(password)) throw new Error(copy.passwordHelp)
          if (password !== confirmPassword) throw new Error(copy.passwordMismatch)
          await updateSupabasePassword(password)
          await finishSupabaseSignIn()
          return
        }
        if (!isStrongStaffPassword(password)) throw new Error(copy.passwordHelp)
        await signInSupabaseWithUsername(username, password)
        await finishSupabaseSignIn()
        return
      }
      if (!isStrongStaffPassword(password)) throw new Error(copy.passwordHelp)
      const normalized = normalizeUsername(username)
      const account = isSharedBackendConfigured()
        ? await signInSharedBackend(normalized, password)
        : employees.find((employee) => employee.status === 'active' && employee.username === normalized && employee.pin === password) ?? null
      if (!account) {
        setError(copy.invalidLogin)
        return
      }
      setError(null)
      await onSignIn(account)
    } catch (cause) {
      console.error('Fleurstales OS sign-in failed.', cause)
      setError(userFacingLoginError(cause, language))
    } finally {
      setIsSigningIn(false)
    }
  }

  const authTitle = mode === 'forgot' ? copy.resetPassword : mode === 'set-password' ? copy.createPassword : copy.signIn
  const authHelp = mode === 'forgot'
    ? copy.resetHelp
    : mode === 'set-password'
      ? copy.passwordHelp
      : copy.signInHelp

  if (isRestoringSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground" aria-busy="true">
        <section className="apple-material w-full max-w-[25rem] rounded-2xl bg-card/92 p-6 shadow-ios ring-1 ring-border/70">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-ios-sm">
            <Flower2 className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-display text-lg font-semibold">{copy.opening}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{copy.restoring}</p>
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-foreground sm:flex sm:items-center sm:justify-center sm:py-8">
      <div className="mx-auto w-full max-w-[25rem] space-y-5">
        <div className="flex items-center justify-end gap-1">
          <LanguageToggle />
          {onToggleTheme && <ThemeToggle theme={theme} onToggle={onToggleTheme} />}
        </div>

        <header className="apple-material flex items-center gap-3 rounded-2xl bg-card/90 px-4 py-3.5 shadow-ios ring-1 ring-border/70">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-ios-sm">
            <Flower2 className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold leading-tight">Fleurstales OS</h1>
            <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{copy.workspace}</p>
          </div>
        </header>

        <form onSubmit={submit} className="apple-material space-y-4 rounded-2xl bg-card/92 p-5 shadow-ios ring-1 ring-border/70">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-foreground">{authTitle}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{authHelp}</p>
          </div>

          {usesSupabase && mode === 'forgot' ? <label className="block space-y-1.5">
            <span className="text-xs font-medium">Email</span>
            <input aria-label="Email" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-11 w-full rounded-xl border border-border/70 bg-card px-3.5 text-sm outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25" />
          </label> : null}
          {mode === 'signin' ? <label className="block space-y-1.5">
            <span className="text-xs font-medium">{usesSupabase ? copy.usernameOrEmail : copy.username}</span>
            <input aria-label={usesSupabase ? copy.usernameOrEmail : copy.username} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder={usesSupabase ? copy.usernameOrEmailPlaceholder : copy.usernamePlaceholder} className="h-11 w-full rounded-xl border border-border/70 bg-card px-3.5 text-sm outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25" />
          </label> : null}
          {(!usesSupabase || mode !== 'forgot') ? <label className="block space-y-1.5">
            <span className="text-xs font-medium">{mode === 'set-password' ? copy.newPassword : copy.password}</span>
            <input
              aria-label={mode === 'set-password' ? copy.newPassword : copy.password}
              autoComplete={mode === 'set-password' ? 'new-password' : 'current-password'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'set-password' ? '6+ characters' : copy.password}
              className="h-11 w-full rounded-xl border border-border/70 bg-card px-3.5 text-sm outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25"
            />
          </label> : null}
          {usesSupabase && mode === 'set-password' ? <label className="block space-y-1.5">
            <span className="text-xs font-medium">{copy.confirmPassword}</span>
            <input aria-label={copy.confirmPassword} autoComplete="new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={copy.repeatPassword} className="h-11 w-full rounded-xl border border-border/70 bg-card px-3.5 text-sm outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25" />
          </label> : null}
          {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/30">{error}</p>}
          {notice && <p role="status" className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-foreground ring-1 ring-primary/25">{notice}</p>}
          <button type="submit" disabled={isSigningIn || (usesSupabase ? (mode === 'forgot' ? !email : mode === 'set-password' ? !password || !confirmPassword : !username || !password) : !username || !password)} className="tap-scale flex w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90 disabled:bg-primary/45 disabled:text-primary-foreground/90 disabled:opacity-100 px-[18px] whitespace-nowrap h-11 gap-2">
            {mode === 'forgot' ? <Mail className="size-4" /> : mode === 'set-password' ? <KeyRound className="size-4" /> : <LogIn className="size-4" />}
            {isSigningIn ? copy.pleaseWait : mode === 'forgot' ? copy.sendReset : mode === 'set-password' ? copy.savePassword : copy.signIn}
          </button>
          {usesSupabase && mode !== 'set-password' ? <button type="button" onClick={() => { setMode(mode === 'forgot' ? 'signin' : 'forgot'); setError(null); setNotice(null) }} className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground">
            {mode === 'forgot' ? copy.backToSignIn : copy.forgotPassword}
          </button> : null}
        </form>

        {!usesSupabase && <InfoDisclosure title={copy.localCredentials} className="text-center">
          <div className="space-y-1 text-left">
            <p>{copy.username}: <code>owner</code>, <code>finance</code>, <code>hr</code>, or staff names such as <code>akbar</code> or <code>zahra</code>.</p>
            <p>{copy.password}: <code>Fleur1</code></p>
          </div>
        </InfoDisclosure>}
      </div>
    </div>
  )
}

export const reconcileSupabaseEmployeeRole = (
  employee: Employee | undefined,
  session: SharedStaffSession,
): Employee => ({
  ...(employee ?? staffSessionToEmployee(session)),
  systemRole: session.role,
})

const staffSessionToEmployee = (session: SharedStaffSession): Employee => ({
  id: session.employeeId ?? session.userId ?? 'supabase-staff',
  name: session.displayName,
  position: session.role[0].toUpperCase() + session.role.slice(1),
  branch: (session.branchId ?? '') as Employee['branch'],
  systemRole: session.role,
  status: 'active',
  phone: '',
  hireDate: new Date().toISOString().slice(0, 10),
  username: session.username ?? session.role,
  email: session.email,
})

export default LoginPage
