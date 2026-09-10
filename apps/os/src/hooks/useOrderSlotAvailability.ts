import { useEffect, useMemo, useState } from 'react'
import { bootstrapSharedData } from '../data/shared/bootstrap'
import { getAvailableOrderSlots } from '../domain/orderScheduleAvailabilityDomain'
import { nowInJakarta } from '../domain/orderTimingDomain'
import { useOrdersStore } from '../store/ordersStore'

const normalizeTime = (value: string): string => value.slice(0, 5)

export const useOrderSlotAvailability = ({
  branchId,
  date,
  openingSlots,
}: {
  branchId: string
  date: string
  openingSlots: string[]
}) => {
  const orders = useOrdersStore((state) => state.orders)
  const sharedData = useMemo(() => bootstrapSharedData(), [])
  const [fullSlots, setFullSlots] = useState<string[]>([])
  const [now, setNow] = useState(() => nowInJakarta())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowInJakarta()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    let inFlight = false

    if (!branchId || !date) {
      setFullSlots([])
      setError(null)
      setLoading(false)
      return () => { active = false }
    }

    if (!sharedData.enabled) {
      setFullSlots([])
      setError(null)
      setLoading(false)
      return () => { active = false }
    }

    const refresh = async () => {
      if (inFlight) return
      inFlight = true
      setLoading(true)
      try {
        const rows = await sharedData.repositories.client.rpc<Array<{ schedule_time: string }>>(
          'get_unavailable_order_slots',
          { p_branch_id: branchId, p_schedule_date: date },
        )
        if (!active) return
        setFullSlots(rows.map((row) => normalizeTime(row.schedule_time)))
        setError(null)
      } catch {
        if (!active) return
        setError('Unable to check available times. Please try again.')
      } finally {
        inFlight = false
        if (active) setLoading(false)
      }
    }

    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30_000)
    const handleFocus = () => { void refresh() }
    window.addEventListener('focus', handleFocus)

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
    }
  }, [branchId, date, sharedData])

  const availableSlots = useMemo(() => {
    if (!branchId || !date) return []
    if (sharedData.enabled && error) return []
    return getAvailableOrderSlots({
      openingSlots,
      date,
      branchId,
      orders,
      fullSlots,
      now,
    })
  }, [branchId, date, error, fullSlots, now, openingSlots, orders, sharedData.enabled])

  return { availableSlots, fullSlots, loading, error }
}
