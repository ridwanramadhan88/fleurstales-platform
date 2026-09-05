import { useState, type FC } from 'react'
import { ExternalLink, ReceiptText } from 'lucide-react'
import { openOrderPaymentProof } from '../../data/orderMediaUpload'
import { toast } from '../../hooks/use-toast'

export const OrderPaymentProofFinanceCard: FC<{ paymentProofPath?: string }> = ({ paymentProofPath }) => {
  const [opening, setOpening] = useState(false)
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
    <section className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-surface-panel px-3.5 py-3 ring-1 ring-border/60">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ReceiptText className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Bukti transfer</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">Private Finance evidence · signed access expires after 5 minutes.</p>
        </div>
      </div>
      <button type="button" onClick={() => { void open() }} disabled={opening} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold hover:bg-muted disabled:opacity-50">
        <ExternalLink className="size-3.5" /> {opening ? 'Opening…' : 'View proof'}
      </button>
    </section>
  )
}
