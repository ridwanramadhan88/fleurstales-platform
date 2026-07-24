import type { FC, FormEvent } from 'react'
import { useState } from 'react'
import { Flower2, Store, LogIn } from 'lucide-react'
import type { Employee } from '../store/hrStoreTypes'
import { useHrStore } from '../store/hrStore'
import type { Theme } from '../hooks/useTheme'
import { ThemeToggle } from '../components/ui/theme-toggle'
import { LanguageToggle } from '../components/ui/language-toggle'
import { InfoDisclosure } from '../components/ui/info-disclosure'
import { normalizeUsername } from '../domain/staffAccountDomain'
import { isSharedBackendConfigured, signInSharedBackend } from '../api/remoteSession'

export interface LoginPageProps {
  onSignIn: (employee: Employee) => void
  onVisitStorefront: () => void
  theme?: Theme
  onToggleTheme?: () => void
}

export const LoginPage: FC<LoginPageProps> = ({ onSignIn, onVisitStorefront, theme = 'light', onToggleTheme }) => {
  const employees = useHrStore((state) => state.employees)
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizeUsername(username)
    setIsSigningIn(true)
    try {
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
            <h2 className="text-base font-semibold text-foreground">Sign in</h2>
            <p className="text-xs text-muted-foreground">Use your staff username and six-digit PIN.</p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Username</span>
            <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="username" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">PIN</span>
            <input autoComplete="current-password" inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/30">{error}</p>}
          <button type="submit" disabled={isSigningIn || !username || pin.length !== 6} className="flex w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition disabled:bg-primary/45 disabled:text-primary-foreground/90 disabled:opacity-100 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">
            <LogIn className="size-4" />
            {isSigningIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={onVisitStorefront}
          className="tap-scale flex w-full items-center justify-center bg-transparent text-sm font-medium text-muted-foreground ring-1 ring-border transition hover:bg-muted hover:text-foreground rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
        >
          <Store className="size-4" />
          Visit online store
        </button>

        <InfoDisclosure title="Demo staff credentials" className="text-center">
          <div className="space-y-1 text-left">
            <p>Username: <code>owner</code>, <code>finance</code>, <code>hr</code>, or staff names such as <code>akbar</code> or <code>zahra</code>.</p>
            <p>PIN: <code>123456</code></p>
          </div>
        </InfoDisclosure>
      </div>
    </div>
  )
}
export default LoginPage
