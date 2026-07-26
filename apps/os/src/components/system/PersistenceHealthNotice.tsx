import { AlertTriangle, Cloud, RefreshCw } from 'lucide-react'
import { usePersistenceHealthStore } from '../../store/persistenceHealthStore'

export const PersistenceHealthNotice = () => {
  const status = usePersistenceHealthStore((state) => state.status)
  const message = usePersistenceHealthStore((state) => state.message)

  if (status !== 'error' && status !== 'conflict' && status !== 'saving') return null

  const failed = status === 'error' || status === 'conflict'
  const title = status === 'conflict'
    ? 'Newer data is available'
    : status === 'error'
      ? 'Changes were not saved'
      : 'Saving changes'

  return (
    <aside
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? 'assertive' : 'polite'}
      className={`fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 mx-auto flex max-w-xl items-start gap-3 rounded-2xl border p-3.5 shadow-ios-lg md:bottom-5 md:left-auto md:right-5 md:mx-0 md:max-w-md ${
        failed
          ? 'border-warning/35 bg-surface-popover text-foreground'
          : 'border-border/70 bg-surface-popover text-foreground'
      }`}
    >
      <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
        failed ? 'bg-warning/12 text-warning' : 'bg-primary/10 text-primary'
      }`}>
        {failed
          ? <AlertTriangle className="size-4" aria-hidden="true" />
          : <Cloud className="size-4" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {message ?? (failed
            ? 'Reload the latest data before continuing.'
            : 'Your update is being synchronized with Fleurstales.')}
        </p>
      </div>
      {failed && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Reload
        </button>
      )}
    </aside>
  )
}
