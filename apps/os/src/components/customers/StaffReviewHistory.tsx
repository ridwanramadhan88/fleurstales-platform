import { useEffect, useState, type FC } from 'react'
import { ChevronDown, Star } from 'lucide-react'
import { getStaffReviews, type StaffReview } from '../../data/staffReviews'

export interface StaffReviewHistoryProps {
  orderId?: string
  customerId?: string
  title?: string
  emptyLabel?: string
  className?: string
}

export const StaffReviewHistory: FC<StaffReviewHistoryProps> = ({
  orderId,
  customerId,
  title = 'Customer reviews',
  emptyLabel = 'No customer review submitted yet.',
  className = '',
}) => {
  const [reviews, setReviews] = useState<StaffReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let inFlight = false

    const loadReviews = (showLoading: boolean) => {
      if (inFlight) return
      inFlight = true
      if (showLoading) {
        setLoading(true)
        setError(null)
      }

      void getStaffReviews({ orderId, customerId })
        .then((result) => {
          if (!active) return
          setReviews(result)
          setError(null)
        })
        .catch((cause) => {
          if (active && showLoading) {
            setError(cause instanceof Error ? cause.message : 'Unable to load customer reviews.')
          }
        })
        .finally(() => {
          inFlight = false
          if (active && showLoading) setLoading(false)
        })
    }

    const refreshReviews = () => loadReviews(false)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshReviews()
    }

    loadReviews(true)
    window.addEventListener('focus', refreshReviews)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      window.removeEventListener('focus', refreshReviews)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [orderId, customerId])

  return (
    <section className={`space-y-2 ${className}`.trim()} aria-label={title || 'Customer reviews'}>
      {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}

      {loading && <p className="text-xs text-muted-foreground">Loading reviews…</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      {!loading && !error && reviews.length === 0 && (
        <p className="rounded-xl bg-surface-panel px-3 py-3 text-xs text-muted-foreground ring-1 ring-border/40">{emptyLabel}</p>
      )}

      {!loading && !error && reviews.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-border/60">
          {reviews.map((review, index) => {
            const expanded = expandedReviewId === review.id
            const panelId = `review-detail-${review.id}`

            return (
              <article key={review.id} className={index > 0 ? 'border-t border-border/60' : undefined}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setExpandedReviewId(expanded ? null : review.id)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-muted/45"
                >
                  <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {review.customerName || 'Customer'}
                    </p>
                    <span className="hidden text-muted-foreground sm:inline">·</span>
                    <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
                      {review.orderNumber}
                    </p>
                  </div>

                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-warning">
                    <Star className="size-3 fill-current" />
                    {Number(review.averageScore || 0).toFixed(1)}
                  </span>
                  <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div id={panelId} className="space-y-2 border-t border-border/50 bg-surface-panel/65 px-3.5 py-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {review.answers.map((answer) => (
                        <div key={answer.questionId} className="rounded-lg bg-card px-3 py-2.5 ring-1 ring-border/50">
                          <p className="text-2xs font-medium text-muted-foreground">{answer.question}</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{answer.score} / 5</p>
                        </div>
                      ))}
                    </div>

                    {review.note && (
                      <div className="rounded-lg bg-card px-3 py-2.5 ring-1 ring-border/50">
                        <p className="text-2xs font-medium text-muted-foreground">Kritik &amp; Saran</p>
                        <p className="mt-1 text-sm text-foreground/90">{review.note}</p>
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default StaffReviewHistory
