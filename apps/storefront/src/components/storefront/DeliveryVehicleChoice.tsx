import type { FC } from 'react'
import type { CartDrawerViewModel } from './CartDrawerController'

const formatRupiah = (value: number): string => `Rp${value.toLocaleString('id-ID')}`

const whatsappLink = (phone: string | undefined): string | null => {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null
  return `https://wa.me/${digits.startsWith('0') ? `62${digits.slice(1)}` : digits}`
}

/**
 * Motor / Mobil choice for branches that charge delivery by distance.
 * Car is forced (Motor locked) when a product requires it or the order has
 * more products than the branch allows on a motorbike.
 */
export const DeliveryVehicleChoice: FC<Pick<CartDrawerViewModel, 'deliveryFee' | 'selectedBranch' | 'deliveryDetails'>> = ({
  deliveryFee,
  selectedBranch,
  deliveryDetails,
}) => {
  if (!deliveryDetails.pin) {
    return <p className="sf-type-1 leading-4 text-black/55">Place the pin to see the delivery fee.</p>
  }
  if (deliveryFee.error === 'OUT_OF_RANGE') {
    const link = whatsappLink(selectedBranch?.phone)
    return (
      <div className="space-y-2 rounded-[var(--sf-radius-card)] bg-[#f0e6dd] px-4 py-4">
        <p className="sf-type-2 font-medium text-black">This address is outside our delivery range. Please contact the branch on WhatsApp.</p>
        {link && <a href={link} target="_blank" rel="noreferrer" className="sf-type-2 font-medium text-[#00813f] underline">Chat the branch on WhatsApp</a>}
      </div>
    )
  }
  if (deliveryFee.status === 'error') {
    return <p className="sf-type-1 leading-4 text-red-700">We could not calculate the delivery fee. Please check the map pin and try again.</p>
  }
  if (deliveryFee.status !== 'ready' && deliveryFee.vehicle === null) {
    return <p className="sf-type-1 leading-4 text-black/55">Calculating the delivery fee…</p>
  }

  const forced = deliveryFee.forcedReason !== null
  const options = [
    { id: 'motor' as const, label: 'Motor' },
    { id: 'car' as const, label: 'Car' },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ id, label }) => {
          const active = deliveryFee.vehicle === id
          const locked = forced && id === 'motor'
          return (
            <button
              key={id}
              type="button"
              disabled={locked}
              aria-pressed={active}
              onClick={() => deliveryFee.chooseVehicle(id)}
              className={`min-h-[3.35rem] rounded-[var(--sf-radius-card)] px-4 sf-type-3 font-medium transition ${
                active ? 'bg-[#00813f] text-white' : 'bg-[#f0e6dd] text-black/72 hover:bg-[#eadfd4]'
              } ${locked ? 'cursor-not-allowed opacity-45' : ''}`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {forced && (
        <p className="sf-type-1 leading-4 text-black/65">
          {deliveryFee.forcedReason === 'product'
            ? 'A product in your cart must be delivered by car.'
            : 'Your order has too many products for a motorbike, so it goes by car.'}
        </p>
      )}
      {deliveryFee.feeIdr !== null && (
        <p className="sf-type-2 font-medium text-black">
          {formatRupiah(deliveryFee.feeIdr)}
          {deliveryFee.distanceKm !== null && <span className="font-normal text-black/60"> · {deliveryFee.distanceKm} km</span>}
        </p>
      )}
    </div>
  )
}
