import { useState, type FC } from 'react'
import type { BranchSettings } from '../../types/settings'
import type { DeliveryTariff, DeliveryVehicleTariff } from '../../data/shared/contracts'
import { DEFAULT_DELIVERY_TARIFF, deliveryFeeForDistance } from '../../domain/deliveryTariffDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

const FIELD_CLASS =
  'h-8 w-full rounded-sm border border-transparent bg-background px-2 text-xs text-foreground outline-none ring-1 ring-border/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'

const rupiah = (value: number): string => `Rp ${value.toLocaleString('id-ID')}`

interface Props {
  branch: BranchSettings
  isEditing: boolean
  error?: string
  onUpdateBranch: (id: string, patch: Partial<BranchSettings>) => void
}

const NumberField: FC<{ label: string; value: number; step?: number; min?: number; onChange: (value: number) => void }> = ({ label, value, step = 1, min = 0, onChange }) => (
  <label className="space-y-1">
    <span className="text-2xs font-semibold text-muted-foreground">{label}</span>
    <input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))} className={FIELD_CLASS} />
  </label>
)

export const BranchDeliveryTariffEditor: FC<Props> = ({ branch, isEditing, error, onUpdateBranch }) => {
  const tr = useBilingualCopy()
  const [exampleKm, setExampleKm] = useState(7)
  const tariff: DeliveryTariff = branch.deliveryTariff ?? DEFAULT_DELIVERY_TARIFF
  const update = (patch: Partial<DeliveryTariff>) => onUpdateBranch(branch.id, { deliveryTariff: { ...tariff, ...patch } })
  const updateVehicle = (vehicle: 'motor' | 'car', patch: Partial<DeliveryVehicleTariff>) =>
    update({ [vehicle]: { ...tariff[vehicle], ...patch } } as Partial<DeliveryTariff>)

  if (!isEditing) {
    return (
      <div className="rounded-md border border-border/60 p-3 text-xs">
        <p className="font-semibold text-foreground">{tr('Delivery tariff', 'Tarif pengiriman')}</p>
        {tariff.enabled ? (
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            <li>{tr('Motor', 'Motor')}: {rupiah(tariff.motor.baseIdr)} {tr('for the first', 'untuk')} {tariff.motor.includedKm} km, {tr('then', 'lalu')} {rupiah(tariff.motor.perKmIdr)}/km</li>
            <li>{tr('Car', 'Mobil')}: {rupiah(tariff.car.baseIdr)} {tr('for the first', 'untuk')} {tariff.car.includedKm} km, {tr('then', 'lalu')} {rupiah(tariff.car.perKmIdr)}/km</li>
            <li>{tr('Maximum distance', 'Jarak maksimal')}: {tariff.maxKm} km{tariff.motorMaxItems ? ` · ${tr('Motor up to', 'Motor maksimal')} ${tariff.motorMaxItems} ${tr('products', 'produk')}` : ''}</li>
          </ul>
        ) : (
          <p className="mt-1 text-muted-foreground">{tr('Off. The flat delivery fee above is used.', 'Nonaktif. Memakai biaya kirim tetap di atas.')}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={tariff.enabled} onChange={(event) => update({ enabled: event.target.checked })} className="mt-0.5 size-4" />
        <span>
          <span className="font-semibold text-foreground">{tr('Charge delivery by distance', 'Hitung ongkir berdasarkan jarak')}</span>
          <span className="block text-muted-foreground">{tr('Road distance from this branch to the customer\'s map pin. While off, the flat fee above is used.', 'Jarak jalan dari cabang ke pin pelanggan. Selama nonaktif, biaya tetap di atas yang dipakai.')}</span>
        </span>
      </label>

      {tariff.enabled && (
        <>
          {(['motor', 'car'] as const).map((vehicle) => (
            <div key={vehicle} className="space-y-2">
              <p className="text-xs font-semibold text-foreground">{vehicle === 'motor' ? tr('Motor', 'Motor') : tr('Car', 'Mobil')}</p>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label={tr('Base fee (IDR)', 'Biaya dasar (Rp)')} step={500} value={tariff[vehicle].baseIdr} onChange={(value) => updateVehicle(vehicle, { baseIdr: Math.round(value) })} />
                <NumberField label={tr('Included km', 'Km termasuk')} step={0.5} value={tariff[vehicle].includedKm} onChange={(value) => updateVehicle(vehicle, { includedKm: value })} />
                <NumberField label={tr('Per extra km (IDR)', 'Per km tambahan (Rp)')} step={500} value={tariff[vehicle].perKmIdr} onChange={(value) => updateVehicle(vehicle, { perKmIdr: Math.round(value) })} />
              </div>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <NumberField label={tr('Maximum distance (km)', 'Jarak maksimal (km)')} step={1} min={1} value={tariff.maxKm} onChange={(value) => update({ maxKm: Math.min(100, value) })} />
            <label className="space-y-1">
              <span className="text-2xs font-semibold text-muted-foreground">{tr('Motor up to (products, blank = no limit)', 'Motor maksimal (produk, kosong = tanpa batas)')}</span>
              <input
                type="number" min={1} step={1}
                value={tariff.motorMaxItems ?? ''}
                onChange={(event) => update({ motorMaxItems: event.target.value === '' ? null : Math.max(1, Math.round(Number(event.target.value) || 1)) })}
                className={FIELD_CLASS}
              />
            </label>
          </div>
          <p className="text-2xs text-muted-foreground">{tr('Above the motor limit, or for products marked "must go by car", the order automatically goes by car.', 'Di atas batas motor, atau untuk produk bertanda "wajib dikirim dengan mobil", pesanan otomatis memakai mobil.')}</p>

          <div className="rounded-sm bg-muted/50 p-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{tr('Example', 'Contoh')}</span>
              <input type="range" min={1} max={Math.max(1, Math.floor(tariff.maxKm))} value={Math.min(exampleKm, Math.max(1, Math.floor(tariff.maxKm)))} onChange={(event) => setExampleKm(Number(event.target.value))} className="flex-1" />
              <span className="w-12 text-right tabular-nums">{Math.min(exampleKm, Math.max(1, Math.floor(tariff.maxKm)))} km</span>
            </label>
            <p className="mt-1 text-muted-foreground">
              Motor {rupiah(deliveryFeeForDistance(tariff, 'motor', exampleKm))} · {tr('Car', 'Mobil')} {rupiah(deliveryFeeForDistance(tariff, 'car', exampleKm))}
            </p>
          </div>
        </>
      )}
      {error && <p className="text-2xs font-medium text-destructive">{error}</p>}
    </div>
  )
}
