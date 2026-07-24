import type { FC } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { NotificationItem } from '../../types/notifications'
import { addDays, getLocalDateString, nowInJakarta, toJakarta } from '../../domain/orderTimingDomain'
import { AppSheet } from '../ui/app-sheet'

export interface NotificationCenterProps {
  open: boolean
  onClose: () => void
  items?: NotificationItem[]
  onMarkAllRead?: () => void
  onOpenNotification?: (item: NotificationItem) => void
}

const formatNotificationAge = (createdAt: string): string => {
  const createdJakarta = toJakarta(new Date(createdAt))
  const today = nowInJakarta()
  const createdDateStr = getLocalDateString(createdJakarta)
  if (createdDateStr === getLocalDateString(today)) return 'Today'
  if (createdDateStr === getLocalDateString(addDays(today, -1))) return 'Yesterday'
  return createdJakarta.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const unreadTone: Record<NotificationItem['priority'], string> = {
  info: 'bg-info/12 ring-info/25',
  success: 'bg-success/12 ring-success/25',
  warning: 'bg-warning/14 ring-warning/30',
  critical: 'bg-destructive/12 ring-destructive/30',
}

export const NotificationCenter: FC<NotificationCenterProps> = ({
  open,
  onClose,
  items = [],
  onMarkAllRead,
  onOpenNotification,
}) => {
  if (!open) return null
  const allRead = items.length > 0 && items.every((item) => item.isRead)

  return (
    <AppSheet
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}
      title={<span className="sr-only">Notifications</span>}
      headerClassName="sr-only"
      hideCloseButton
      side="top"
      contentClassName="inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] h-[min(62vh,34rem)] w-auto max-w-md gap-0 rounded-2xl border p-0 sm:h-[min(82vh,40rem)]"
    >
      <header className="shrink-0 border-b border-border/70 px-4 py-4 sm:px-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <div className="min-w-0 sm:col-start-1 sm:row-start-1">
            <h1 className="font-display text-lg font-semibold leading-6 text-foreground">Notifications</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Important tasks only.</p>
          </div>
          {items.length > 0 && !allRead && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="col-start-1 row-start-2 justify-self-start text-xs font-medium text-primary hover:bg-surface-panel sm:col-start-2 sm:row-start-1 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="col-start-2 row-start-1 inline-flex size-11 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:col-start-3"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-5 sm:px-5">
        {items.length === 0 ? (
          <div className="rounded-xl bg-muted/60 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">Nothing needs attention</p>
            <p className="mt-1 text-xs text-muted-foreground">Important updates will appear here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const clickable = Boolean(item.target && onOpenNotification)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onOpenNotification?.(item)}
                    className={`w-full rounded-xl px-3 py-2 text-left ring-1 transition ${
                      item.isRead
                        ? 'bg-card ring-border/70 hover:bg-muted/50'
                        : `${unreadTone[item.priority]} shadow-ios-sm`
                    } ${clickable ? 'cursor-pointer' : 'cursor-default'} disabled:opacity-100`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? 'bg-muted-foreground/35' : 'bg-primary'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold leading-snug text-foreground">{item.title}</p>
                          <span className="shrink-0 text-2xs text-muted-foreground">{formatNotificationAge(item.createdAt)}</span>
                        </div>
                        {item.message && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.message}</p>}
                      </div>
                      {clickable && <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>


    </AppSheet>
  )
}
