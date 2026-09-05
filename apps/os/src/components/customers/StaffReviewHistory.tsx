import { useEffect, useMemo, useState, type FC } from 'react'
import { Gift, MessageSquareText, Star } from 'lucide-react'
import { getStaffReviews, type StaffReview } from '../../data/staffReviews'

export interface StaffReviewHistoryProps {
  orderId?: string
  customerId?: string
  title?: string
  emptyLabel?: string
  className?: string
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const moneyFormatter = new Intl.NumberFormat('id-ID')

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

  const average = useMemo(() => {
    if (reviews.length === 0) return null
    return reviews.reduce((sum, review) => sum + Number(review.averageScore || 0), 0) / reviews.length
  }, [reviews])

  return (
    <section className={`space-y-3 rounded-xl bg-card p-4 ring-1 ring-border/70 ${className}`.trim()} aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageSquareText className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Read-only feedback submitted from completed Storefront orders.
            </p>
          </div>
        </div>
        {average != null && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning">
            <Star className="size-3.5 fill-current" />
            {average.toFixed(1)} / 5
          </div>
        )}
      </header>

      {loading && <p className="text-xs text-muted-foreground">Loading reviews…</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      {!loading && !error && reviews.length === 0 && (
        <p className="rounded-lg bg-muted/35 px-3 py-3 text-xs text-muted-foreground">{emptyLabel}</p>
      )}

      {!loading && !error && reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="space-y-3 rounded-xl bg-surface-panel p-3.5 ring-1 ring-border/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {review.customerName || 'Customer'} · {review.orderNumber}
                  </p>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {dateFormatter.format(new Date(review.submittedAt))}
                    {review.customerWhatsapp ? ` · ${review.customerWhatsapp}` : ''}
                  </p>
                </div>
                <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                  <Star className="size-3 fill-current" />
                  {Number(review.averageScore || 0).toFixed(1)}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {review.answers.map((answer) => (
                  <div key={answer.questionId} className="rounded-lg bg-card px-3 py-2.5 ring-1 ring-border/50">
                    <p className="text-2xs font-medium text-muted-foreground">{answer.question}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{answer.score} / 5</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-card px-3 py-2.5 ring-1 ring-border/50">
                <p className="text-2xs font-medium text-muted-foreground">Kritik &amp; Saran</p>
                <p className={review.note ? 'mt-1 text-sm text-foreground/90' : 'mt-1 text-xs text-muted-foreground/50'}>
                  {review.note || 'No written feedback.'}
                </p>
              </div>

              {review.reward && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-xs text-foreground ring-1 ring-primary/10">
                  <Gift className="size-3.5 text-primary" />
                  <span className="font-medium">
                    Reward {review.reward.percentOff}% off · min Rp {moneyFormatter.format(review.reward.minOrderIdr)}
                  </span>
                  <span className="rounded-full bg-card px-2 py-0.5 text-2xs font-semibold capitalize text-muted-foreground ring-1 ring-border/60">
                    {review.reward.status}
                  </span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default StaffReviewHistory
