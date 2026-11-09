import { useState, type FC } from 'react'
import { FileImage } from 'lucide-react'
import { resolveDeliveryProofUrl } from '../../data/courierDelivery'
import { useToast } from '../../hooks/use-toast'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import type { OrderTableRow } from '../../types/orders'

/** Roles Storage lets read a delivery proof (order_delivery_proofs_select). Never customers. */
export const DELIVERY_PROOF_VIEWER_ROLES = ['owner', 'admin'] as const

export const canViewDeliveryProof = (role: string, order: Pick<OrderTableRow, 'deliveryProofPhotoPath'>): boolean =>
  (DELIVERY_PROOF_VIEWER_ROLES as readonly string[]).includes(role) && Boolean(order.deliveryProofPhotoPath)

/** Opens the private proof-of-delivery photo in a new tab through a fresh signed link. */
export const DeliveryProofButton: FC<{ path: string }> = ({ path }) => {
  const copy = useBilingualCopy()
  const { toast } = useToast()
  const [opening, setOpening] = useState(false)

  const open = async () => {
    const popup = typeof window !== 'undefined' ? window.open('', '_blank') : null
    setOpening(true)
    try {
      const url = await resolveDeliveryProofUrl(path)
      if (!popup) throw new Error(copy('Allow pop-ups to open the photo.', 'Izinkan pop-up untuk membuka foto.'))
      popup.opener = null
      popup.location.href = url
    } catch (error) {
      popup?.close()
      toast({
        variant: 'destructive',
        title: copy('Could not open the proof photo', 'Foto bukti terima tidak bisa dibuka'),
        description: error instanceof Error ? error.message : copy('Try again in a moment.', 'Coba lagi beberapa saat lagi.'),
      })
    } finally {
      setOpening(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => { void open() }}
      disabled={opening}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-primary ring-1 ring-primary/25 transition hover:bg-primary/5 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <FileImage className="size-3.5" />
      {opening ? copy('Opening…', 'Membuka…') : copy('View proof of delivery', 'Lihat foto bukti terima')}
    </button>
  )
}
