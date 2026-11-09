import type { FC } from 'react'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

const rupiah = (value: number): string => `Rp ${value.toLocaleString('id-ID')}`

/** Motor / Mobil for branches that charge delivery by distance. */
export const NewOrderDeliveryVehicle: FC<{ viewModel: Pick<NewOrderSheetViewModel, 'deliveryFee' | 'values'> }> = ({ viewModel }) => {
  const { deliveryFee, values } = viewModel
  const tr = useBilingualCopy()

  let body: JSX.Element
  if (!values.deliveryPin) {
    body = <p className="text-2xs text-muted-foreground">{tr('Set the delivery pin to calculate the fee.', 'Tentukan pin pengiriman untuk menghitung ongkir.')}</p>
  } else if (deliveryFee.error === 'OUT_OF_RANGE') {
    body = (
      <p className="text-xs font-medium text-destructive" role="alert">
        {tr(
          `Outside the delivery range (max ${deliveryFee.maxDistanceKm ?? ''} km). Arrange this order outside the app.`,
          `Di luar jangkauan pengiriman (maks ${deliveryFee.maxDistanceKm ?? ''} km). Atur pesanan ini di luar aplikasi.`,
        )}
      </p>
    )
  } else if (deliveryFee.status === 'error') {
    body = <p className="text-xs font-medium text-destructive" role="alert">{tr('Could not calculate the fee. Check the pin and try again.', 'Ongkir belum bisa dihitung. Periksa pin lalu coba lagi.')}</p>
  } else if (deliveryFee.status !== 'ready' && deliveryFee.vehicle === null) {
    body = <p className="text-2xs text-muted-foreground">{tr('Calculating…', 'Menghitung…')}</p>
  } else {
    const forced = deliveryFee.forcedReason !== null
    body = (
      <>
        <div className="grid grid-cols-2 gap-2">
          {(['motor', 'car'] as const).map((id) => {
            const active = deliveryFee.vehicle === id
            const locked = forced && id === 'motor'
            return (
              <button
                key={id}
                type="button"
                disabled={locked}
                aria-pressed={active}
                onClick={() => deliveryFee.chooseVehicle(id)}
                className={`h-8 rounded-sm text-xs font-medium ring-1 transition ${active ? 'bg-primary text-primary-foreground ring-primary' : 'bg-background text-foreground ring-border/70 hover:bg-muted/50'} ${locked ? 'cursor-not-allowed opacity-45' : ''}`}
              >
                {id === 'motor' ? tr('Motor', 'Motor') : tr('Car', 'Mobil')}
              </button>
            )
          })}
        </div>
        {forced && (
          <p className="text-2xs text-muted-foreground">
            {deliveryFee.forcedReason === 'product'
              ? tr('A product here must go by car.', 'Ada produk yang wajib dikirim dengan mobil.')
              : tr('Too many products for a motorbike, so it goes by car.', 'Produk terlalu banyak untuk motor, jadi memakai mobil.')}
          </p>
        )}
        {deliveryFee.feeIdr !== null && (
          <p className="text-xs font-medium text-foreground">
            {rupiah(deliveryFee.feeIdr)}
            {deliveryFee.distanceKm !== null && <span className="font-normal text-muted-foreground"> · {deliveryFee.distanceKm} km</span>}
          </p>
        )}
      </>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{tr('Delivery vehicle', 'Kendaraan pengiriman')}</p>
      {body}
    </div>
  )
}
