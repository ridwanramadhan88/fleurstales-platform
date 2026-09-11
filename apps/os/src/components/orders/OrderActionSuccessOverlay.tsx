import { useEffect, useState, type FC } from 'react'
import { Check, Loader2 } from 'lucide-react'

export type OrderActionSuccessKind = 'processing' | 'completed'

interface OrderActionSuccessOverlayProps {
  kind: OrderActionSuccessKind
  subtitle?: string
  onComplete: () => void
}

export const OrderActionSuccessOverlay: FC<OrderActionSuccessOverlayProps> = ({
  kind,
  subtitle,
  onComplete,
}) => {
  const [done, setDone] = useState(false)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true))
    const doneTimer = window.setTimeout(() => setDone(true), kind === 'processing' ? 280 : 180)
    const completeTimer = window.setTimeout(onComplete, kind === 'processing' ? 1150 : 950)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(doneTimer)
      window.clearTimeout(completeTimer)
    }
  }, [kind, onComplete])

  const title = kind === 'processing' ? 'Pesanan diproses' : 'Pesanan selesai'
  const workingLabel = kind === 'processing' ? 'Memulai produksi…' : 'Menyelesaikan pesanan…'

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-background/45 px-5 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-label={done ? title : workingLabel}
    >
      <div
        className={`w-full max-w-xs rounded-3xl bg-card px-6 py-7 text-center shadow-ios-lg ring-1 ring-border/60 transition-all duration-200 motion-reduce:transition-none ${
          entered ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.97] opacity-0'
        }`}
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success ring-1 ring-success/20">
          {done ? (
            <Check className="size-7 transition-transform duration-200 motion-safe:scale-110 motion-reduce:transition-none" strokeWidth={2.6} />
          ) : (
            <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />
          )}
        </div>
        <p className="mt-4 text-base font-semibold text-foreground">
          {done ? title : workingLabel}
        </p>
        {done && subtitle ? (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}
