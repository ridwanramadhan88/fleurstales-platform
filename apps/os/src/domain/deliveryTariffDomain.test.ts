import { describe, expect, it } from 'vitest'
import { DEFAULT_DELIVERY_TARIFF, deliveryFeeForDistance, validateDeliveryTariff } from './deliveryTariffDomain'

describe('deliveryTariffDomain', () => {
  const tariff = { ...DEFAULT_DELIVERY_TARIFF, enabled: true }

  it('prices motor and car by chargeable whole kilometres', () => {
    expect(deliveryFeeForDistance(tariff, 'motor', 2)).toBe(10000)
    expect(deliveryFeeForDistance(tariff, 'motor', 7.2)).toBe(22500)
    expect(deliveryFeeForDistance(tariff, 'car', 7.2)).toBe(45000)
  })

  it('accepts a disabled tariff without checking values', () => {
    expect(validateDeliveryTariff({ ...tariff, enabled: false, maxKm: -1 })).toBeNull()
  })

  it('rejects impossible values when enabled', () => {
    expect(validateDeliveryTariff({ ...tariff, maxKm: 0 })).toMatch(/Maximum distance/)
    expect(validateDeliveryTariff({ ...tariff, motorMaxItems: 0 })).toMatch(/Motor product limit/)
    expect(validateDeliveryTariff({ ...tariff, car: { ...tariff.car, perKmIdr: -1 } })).toMatch(/zero or greater/)
    expect(validateDeliveryTariff(tariff)).toBeNull()
  })
})
