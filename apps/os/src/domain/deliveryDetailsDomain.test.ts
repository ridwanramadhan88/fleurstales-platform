import { describe, expect, it } from 'vitest'
import {
  EMPTY_DELIVERY_DETAILS,
  isShortMapsLink,
  parseMapsLocation,
  toDeliveryDetailsInput,
  validateDeliveryDetails,
} from './deliveryDetailsDomain'

describe('parseMapsLocation', () => {
  it('reads coordinates from common Google Maps link shapes', () => {
    expect(parseMapsLocation('https://www.google.com/maps/place/X/@-5.381,105.258,17z')).toEqual({ latitude: -5.381, longitude: 105.258 })
    expect(parseMapsLocation('https://www.google.com/maps/place/X/data=!3d-5.3810123!4d105.2580456')).toEqual({ latitude: -5.381012, longitude: 105.258046 })
    expect(parseMapsLocation('https://maps.google.com/?q=-5.381,105.258')).toEqual({ latitude: -5.381, longitude: 105.258 })
    expect(parseMapsLocation('https://www.google.com/maps/search/?api=1&query=-5.381%2C105.258')).toEqual({ latitude: -5.381, longitude: 105.258 })
    expect(parseMapsLocation(' -5.381 , 105.258 ')).toEqual({ latitude: -5.381, longitude: 105.258 })
  })

  it('rejects text without usable coordinates', () => {
    expect(parseMapsLocation('Jl. Teuku Umar No. 12')).toBeNull()
    expect(parseMapsLocation('https://maps.app.goo.gl/abc123')).toBeNull()
    expect(parseMapsLocation('95.1, 105.2')).toBeNull()
    expect(parseMapsLocation('0.0, 0.0')).toBeNull()
    expect(isShortMapsLink('https://maps.app.goo.gl/abc123')).toBe(true)
  })
})

describe('validateDeliveryDetails', () => {
  const pin = { latitude: -5.381, longitude: 105.258 }

  it('needs recipient name and phone only when sending to someone else', () => {
    expect(validateDeliveryDetails({ ...EMPTY_DELIVERY_DETAILS, pin, landmark: 'Pagar hitam' })).toBeNull()
    expect(validateDeliveryDetails({ ...EMPTY_DELIVERY_DETAILS, sendToOther: true, pin, landmark: 'x' })).toBe('Please add the recipient name.')
    expect(validateDeliveryDetails({ ...EMPTY_DELIVERY_DETAILS, sendToOther: true, recipientName: 'Ratna', recipientPhone: '12', pin, landmark: 'x' }))
      .toBe('Please add a valid recipient WhatsApp number.')
  })

  it('needs a pin and a landmark', () => {
    expect(validateDeliveryDetails({ ...EMPTY_DELIVERY_DETAILS, landmark: 'x' })).toBe('Please set the delivery pin on the map.')
    expect(validateDeliveryDetails({ ...EMPTY_DELIVERY_DETAILS, pin, landmark: '  ' })).toBe('Please add a landmark or house detail.')
  })

  it('uses the customer as recipient by default', () => {
    expect(toDeliveryDetailsInput({ ...EMPTY_DELIVERY_DETAILS, pin, landmark: ' Pagar hitam ' }, { name: 'Siti', whatsappNumber: '0813' }))
      .toEqual({ recipientName: 'Siti', recipientPhone: '0813', latitude: -5.381, longitude: 105.258, landmark: 'Pagar hitam' })
  })
})
