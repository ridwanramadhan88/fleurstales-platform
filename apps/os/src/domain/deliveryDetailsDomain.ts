/**
 * Delivery recipient, map pin and landmark (Owner decisions, 8 Nov 2026).
 *
 * The same rules run on the server (`private.apply_order_delivery_details`):
 * a new delivery order needs a recipient name + phone (the customer by
 * default), a map pin and a landmark / house detail.
 */

export interface DeliveryPin {
  latitude: number
  longitude: number
}

export interface DeliveryDetailsDraft {
  /** Sending to someone else; otherwise the customer receives it. */
  sendToOther: boolean
  recipientName: string
  recipientPhone: string
  pin: DeliveryPin | null
  landmark: string
}

export const EMPTY_DELIVERY_DETAILS: DeliveryDetailsDraft = {
  sendToOther: false,
  recipientName: '',
  recipientPhone: '',
  pin: null,
  landmark: '',
}

export const LANDMARK_MAX_LENGTH = 500

const isValidPin = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90 && latitude <= 90
  && longitude >= -180 && longitude <= 180
  && !(latitude === 0 && longitude === 0)

const roundCoordinate = (value: number): number => Number(value.toFixed(6))

const COORDINATE_PATTERNS: RegExp[] = [
  // .../@-5.3810,105.2580,17z
  /@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
  // ...!3d-5.3810!4d105.2580
  /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
  // ?q=-5.3810,105.2580 · query= · ll= · destination=
  /[?&](?:q|query|ll|destination|center)=(-?\d{1,2}(?:\.\d+)?)(?:,|%2C)\s*(-?\d{1,3}(?:\.\d+)?)/i,
  // plain "-5.3810, 105.2580"
  /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/,
]

/**
 * Reads a pin from a pasted Google Maps link or "lat, lng" text. Short share
 * links (maps.app.goo.gl) carry no coordinates and return null.
 */
export const parseMapsLocation = (input: string): DeliveryPin | null => {
  const text = input.trim()
  if (!text) return null
  for (const pattern of COORDINATE_PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const latitude = Number(match[1])
    const longitude = Number(match[2])
    if (isValidPin(latitude, longitude)) {
      return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }
    }
  }
  return null
}

export const isShortMapsLink = (input: string): boolean =>
  /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(input.trim())

export const toDeliveryPin = (latitude: number, longitude: number): DeliveryPin | null =>
  isValidPin(latitude, longitude)
    ? { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }
    : null

export const formatDeliveryPin = (pin: DeliveryPin): string =>
  `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`

export const googleMapsUrlForPin = (pin: DeliveryPin): string =>
  `https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`

const phoneDigits = (value: string): string => value.replace(/\D/g, '')

export const isValidRecipientPhone = (value: string): boolean => {
  const length = phoneDigits(value).length
  return length >= 8 && length <= 15
}

/** First problem with the delivery details, in checkout order, or null. */
export const validateDeliveryDetails = (draft: DeliveryDetailsDraft): string | null => {
  if (draft.sendToOther) {
    if (!draft.recipientName.trim()) return 'Please add the recipient name.'
    if (!isValidRecipientPhone(draft.recipientPhone)) return 'Please add a valid recipient WhatsApp number.'
  }
  if (!draft.pin) return 'Please set the delivery pin on the map.'
  if (!draft.landmark.trim()) return 'Please add a landmark or house detail.'
  if (draft.landmark.trim().length > LANDMARK_MAX_LENGTH) return 'The landmark is too long.'
  return null
}

/** Payload for create_storefront_order / create_internal_order. */
export const toDeliveryDetailsInput = (
  draft: DeliveryDetailsDraft,
  customer: { name: string; whatsappNumber: string },
) => ({
  recipientName: (draft.sendToOther ? draft.recipientName : customer.name).trim(),
  recipientPhone: (draft.sendToOther ? draft.recipientPhone : customer.whatsappNumber).trim(),
  ...(draft.pin ? { latitude: draft.pin.latitude, longitude: draft.pin.longitude } : {}),
  landmark: draft.landmark.trim(),
})
