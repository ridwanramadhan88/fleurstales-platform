import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DeliveryDistanceResult,
  DeliveryFeeQuote,
  DeliveryFeeQuoteInput,
  DeliveryVehicle,
} from '../data/shared/contracts'

export interface DeliveryFeeState {
  /** idle: no tariff or nothing to price yet; loading: measuring; ready: priced; error: blocked */
  status: 'idle' | 'loading' | 'ready' | 'error'
  feeIdr: number | null
  vehicle: DeliveryVehicle | null
  forcedReason: 'product' | 'quantity' | null
  distanceKm: number | null
  quoteId: string | null
  maxDistanceKm: number | null
  motorMaxItems: number | null
  error: 'OUT_OF_RANGE' | 'UNAVAILABLE' | 'PIN_REQUIRED' | null
}

const IDLE: DeliveryFeeState = {
  status: 'idle', feeIdr: null, vehicle: null, forcedReason: null, distanceKm: null,
  quoteId: null, maxDistanceKm: null, motorMaxItems: null, error: null,
}

interface Args {
  /** True when the branch has the distance tariff on and the order is delivery. */
  enabled: boolean
  branchId: string
  pin: { latitude: number; longitude: number } | null
  items: Array<{ productId?: string; quantity: number }>
  measure: (input: { branchId: string; latitude: number; longitude: number }) => Promise<DeliveryDistanceResult>
  quote: (input: DeliveryFeeQuoteInput) => Promise<DeliveryFeeQuote>
}

const isExpired = (error: unknown): boolean =>
  /DELIVERY_QUOTE_EXPIRED|DELIVERY_QUOTE_PIN_MISMATCH/.test(error instanceof Error ? error.message : JSON.stringify(error))

/**
 * Measures the road distance for the pin (debounced) and prices the chosen
 * vehicle. The server decides which vehicle is forced; the preference is only
 * honoured when Motor is allowed. Totals shown here are previews; the order
 * is re-priced on the server from the same quote.
 */
export const useDeliveryFee = ({ enabled, branchId, pin, items, measure, quote }: Args) => {
  const [state, setState] = useState<DeliveryFeeState>(IDLE)
  const [preference, setPreference] = useState<DeliveryVehicle | null>(null)
  const requestId = useRef(0)
  const measured = useRef<{ key: string; quoteId: string; distanceKm: number } | null>(null)

  const pinKey = pin ? `${branchId}:${pin.latitude.toFixed(5)},${pin.longitude.toFixed(5)}` : ''
  const itemsKey = JSON.stringify(items.map((item) => [item.productId ?? '', item.quantity]))

  const run = useCallback(async (forceMeasure: boolean) => {
    const id = ++requestId.current
    if (!enabled) { measured.current = null; setState(IDLE); return }
    if (!pin) { setState({ ...IDLE, error: 'PIN_REQUIRED' }); return }
    setState((current) => ({ ...current, status: 'loading', error: null }))
    try {
      if (forceMeasure || measured.current?.key !== pinKey) {
        const result = await measure({ branchId, latitude: pin.latitude, longitude: pin.longitude })
        if (id !== requestId.current) return
        if (result.error === 'DELIVERY_OUT_OF_RANGE') {
          measured.current = null
          setState({ ...IDLE, status: 'error', error: 'OUT_OF_RANGE', distanceKm: result.distanceKm ?? null, maxDistanceKm: result.maxDistanceKm ?? null })
          return
        }
        if (result.error || !result.quoteId || result.distanceKm == null) {
          measured.current = null
          setState({ ...IDLE, status: 'error', error: 'UNAVAILABLE' })
          return
        }
        measured.current = { key: pinKey, quoteId: result.quoteId, distanceKm: result.distanceKm }
      }
      const current = measured.current
      if (!current) return
      const priced = await quote({
        branchId,
        quoteId: current.quoteId,
        vehicle: preference ?? undefined,
        items,
        latitude: pin.latitude,
        longitude: pin.longitude,
      })
      if (id !== requestId.current) return
      setState({
        status: 'ready',
        feeIdr: priced.feeIdr,
        vehicle: priced.vehicle ?? null,
        forcedReason: priced.forcedReason ?? null,
        distanceKm: priced.distanceKm ?? current.distanceKm,
        quoteId: current.quoteId,
        maxDistanceKm: priced.maxDistanceKm ?? null,
        motorMaxItems: priced.motorMaxItems ?? null,
        error: null,
      })
    } catch (error) {
      if (id !== requestId.current) return
      // Quotes last 30 minutes; measure again once instead of failing.
      if (!forceMeasure && isExpired(error)) { void run(true); return }
      measured.current = null
      setState({ ...IDLE, status: 'error', error: 'UNAVAILABLE' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, branchId, pinKey, itemsKey, preference])

  useEffect(() => {
    const timer = setTimeout(() => { void run(false) }, enabled ? 500 : 0)
    return () => clearTimeout(timer)
  }, [run, enabled])

  return { ...state, preference, chooseVehicle: setPreference }
}
