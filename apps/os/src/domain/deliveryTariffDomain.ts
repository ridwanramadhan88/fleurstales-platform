import type { DeliveryTariff, DeliveryVehicle } from '../data/shared/contracts'

/** Owner's example from 8 Nov 2026: motor Rp10.000 first 3 km then Rp2.500/km. */
export const DEFAULT_DELIVERY_TARIFF: DeliveryTariff = {
  enabled: false,
  motor: { baseIdr: 10000, includedKm: 3, perKmIdr: 2500 },
  car: { baseIdr: 25000, includedKm: 3, perKmIdr: 4000 },
  maxKm: 25,
  motorMaxItems: null,
}

/** Same rule as the database: chargeable distance is rounded up to whole km. */
export const deliveryFeeForDistance = (
  tariff: DeliveryTariff,
  vehicle: DeliveryVehicle,
  distanceKm: number,
): number => {
  const rule = tariff[vehicle]
  return rule.baseIdr + Math.ceil(Math.max(0, distanceKm - rule.includedKm)) * rule.perKmIdr
}

export const validateDeliveryTariff = (tariff: DeliveryTariff | undefined): string | null => {
  if (!tariff || !tariff.enabled) return null
  const rules = [tariff.motor, tariff.car]
  for (const rule of rules) {
    if (![rule.baseIdr, rule.includedKm, rule.perKmIdr].every((value) => Number.isFinite(value) && value >= 0)) {
      return 'Tariff values must be zero or greater.'
    }
  }
  if (!Number.isFinite(tariff.maxKm) || tariff.maxKm <= 0 || tariff.maxKm > 100) {
    return 'Maximum distance must be between 1 and 100 km.'
  }
  if (tariff.motorMaxItems !== null && (!Number.isInteger(tariff.motorMaxItems) || tariff.motorMaxItems < 1)) {
    return 'Motor product limit must be a whole number of at least 1.'
  }
  return null
}
