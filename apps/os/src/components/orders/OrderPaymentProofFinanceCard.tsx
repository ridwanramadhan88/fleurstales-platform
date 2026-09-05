import { useEffect, useState, type FC } from 'react'
import { ExternalLink, ImageOff, Loader2, ReceiptText } from 'lucide-react'
import { openOrderPaymentProof, resolveOrderPaymentProofUrl } from '../../data/orderMediaUpload'
import { toast } from '../../hooks/use-toast'

export const OrderPaymentProofFinanceCard: FC<{ paymentProofPath?: string }> = ({ paymentProofPath }) => {
  const [opening, setOpening] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!paymentProofPath) {
      setPreviewUrl(null)
      setPreviewError(null)
      return
    }

    let active = true
    setPreviewLoading(true)
    setPreviewError(null)
    resolveOrderPaymentProofUrl(paymentProofPath)
      .then((url) => {
        if (active) setPreviewUrl(url)
      })
      .catch((error) => {
        if (!active) return
        setPreviewUrl(null)
        setPreviewError(error instanceof Error ? error.message : 'Could not load payment proof preview.')
      })
      .finally(() => {
        if (active) setPreviewLoading(false)
      })

    return () => { active = false }
  }, [paymentProofPath])

  if (!paymentProofPath) return null

  const open = async () => {
    if (opening) return
    setOpening(true)
    try {
      await openOrderPaymentProof(paymentProofPath)
    } catch (error) {
      toast({
        title: 'Payment proof unavailable',
        description: error instanceof Error ? error.message : 'Could not open payment proof.',
        variant: 'destructive',
      })
    } finally {
      setOpening(false)
    }
  }

  return (
    <section className="space-y-3 rounded-xl bg-surface-panel p-3.5 ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ReceiptText className="size-4" /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold">Bukti transfer</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">Primary Finance evidence · private signed access.</p>
          </div>
        </div>
        <button type="button" onClick={() => { void open() }} disabled={opening} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold hover:bg-muted disabled:opacity-50">
          <ExternalLink className="size-3.5" /> {opening ? 'Opening…' : 'Open full proof'}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        {previewLoading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading payment proof…
          </div>
        ) : previewUrl ? (
          <button type="button" onClick={() => { void open() }} className="block w-full cursor-zoom-in bg-muted/20" aria-label="Open full payment proof">
            <img src={previewUrl} alt="Bukti transfer" className="max-h-[28rem] w-full object-contain" />
          </button>
        ) : (
          <div className="flex min-h-36 flex-col items-center justify-center px-5 text-center text-xs text-muted-foreground">
            <ImageOff className="mb-2 size-5" />
            <p className="font-medium text-foreground">Preview unavailable</p>
            <p className="mt-1">{previewError ?? 'Use Open full proof to retry with a fresh signed link.'}</p>
          </div>
        )}
      </div>
      <p className="text-2xs text-muted-foreground">Preview links expire after 5 minutes. Opening the full proof requests a fresh signed link.</p>
    </section>
  )
}
