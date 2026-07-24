import type { NewOrderFormValues } from './useNewOrderForm'

/**
 * @file newOrderGuide.ts
 * @description Drives the "fill me next" guided highlight for the New Order
 * form. Instead of tinting every empty field with the primary accent at once, we walk an
 * ordered checklist of fields (grouped into workflow sections) and surface
 * only the *next* unfilled one. The section that field lives in is what
 * gets the moving card highlight — unless the user has manually
 * clicked/focused into a different section, in which case that takes over
 * (see `useNewOrderGuide`'s `focusedSection`).
 *
 * Order note is the final section-only destination: after Payment is
 * complete its card receives the dark section ring, but the textarea is not
 * auto-highlighted with the primary accent until the user enters it. The catalog product picker
 * also never
 * gets its own primary field ring (there's nothing to tint on a dropdown you
 * haven't opened yet), but it still counts toward the Order items section's
 * highlight so that card doesn't sit unguided in catalog mode.
 */

export type GuideSection = 'customer' | 'items' | 'structure' | 'payment' | 'greetingCard' | 'notes'

interface GuideStep {
  key: string
  section: GuideSection
  isApplicable: (values: NewOrderFormValues) => boolean
  isFilled: (values: NewOrderFormValues) => boolean
}

const hasText = (value: string) => value.trim().length > 0

// Order here IS the fill-order the guide follows: 1) Customer,
// 2) Order items (custom mode only — catalog picks are never highlighted),
// 3) Order structure, 4) Payment.
const GUIDE_STEPS: GuideStep[] = [
  {
    key: 'customerName',
    section: 'customer',
    isApplicable: () => true,
    isFilled: (v) => hasText(v.customerName),
  },
  {
    key: 'customerWhatsappNumber',
    section: 'customer',
    isApplicable: () => true,
    isFilled: (v) => hasText(v.customerWhatsappNumber),
  },

  {
    key: 'orderItemCustomName',
    section: 'items',
    isApplicable: (v) => v.orderItemMode === 'custom',
    isFilled: (v) => hasText(v.orderItemCustomName),
  },
  {
    key: 'orderItemCustomPrice',
    section: 'items',
    isApplicable: (v) => v.orderItemMode === 'custom',
    isFilled: (v) => hasText(v.orderItemCustomPrice),
  },
  {
    key: 'orderItemCatalogId',
    section: 'items',
    isApplicable: (v) => v.orderItemMode === 'catalog',
    isFilled: (v) => hasText(v.orderItemCatalogId),
  },

  {
    key: 'orderType',
    section: 'structure',
    isApplicable: () => true,
    isFilled: (v) => Boolean(v.orderType),
  },
  {
    key: 'fulfillmentType',
    section: 'structure',
    isApplicable: () => true,
    isFilled: (v) => Boolean(v.fulfillmentType),
  },
  {
    key: 'pickupDate',
    section: 'structure',
    isApplicable: (v) => v.fulfillmentType === 'pickup',
    isFilled: (v) => hasText(v.pickupDate),
  },
  {
    key: 'pickupTime',
    section: 'structure',
    isApplicable: (v) => v.fulfillmentType === 'pickup',
    isFilled: (v) => hasText(v.pickupTime),
  },
  {
    key: 'deliveryDate',
    section: 'structure',
    isApplicable: (v) => v.fulfillmentType === 'delivery',
    isFilled: (v) => hasText(v.deliveryDate),
  },
  {
    key: 'deliveryTime',
    section: 'structure',
    isApplicable: (v) => v.fulfillmentType === 'delivery',
    isFilled: (v) => hasText(v.deliveryTime),
  },

  {
    key: 'deliveryAddress',
    section: 'structure',
    isApplicable: (v) => v.fulfillmentType === 'delivery',
    isFilled: (v) => hasText(v.deliveryAddress),
  },

  {
    key: 'paymentMethod',
    section: 'payment',
    isApplicable: () => true,
    isFilled: (v) => Boolean(v.paymentMethod),
  },
  {
    key: 'paymentStatus',
    section: 'payment',
    isApplicable: () => true,
    isFilled: (v) => Boolean(v.paymentStatus),
  },
]


/** Returns whether a named guide field is already complete. `null` means the
 * field is not part of the required guide (for example an optional note). */
export const isGuideFieldFilled = (
  field: string,
  values: NewOrderFormValues,
): boolean | null => {
  const step = GUIDE_STEPS.find((candidate) => candidate.key === field)
  if (!step || !step.isApplicable(values)) return null
  return step.isFilled(values)
}

export interface ActiveGuideStep {
  field: string
  section: GuideSection
}

/**
 * @description Returns the single next field the user should fill, walking
 * the checklist in workflow order. Returns `null` once every applicable
 * field has a value (nothing left to guide toward).
 */
export const getActiveGuideStep = (
  values: NewOrderFormValues,
): ActiveGuideStep | null => {
  for (const step of GUIDE_STEPS) {
    if (!step.isApplicable(values)) continue
    if (!step.isFilled(values)) return { field: step.key, section: step.section }
  }
  return null
}

/**
 * @description True once every applicable guided field inside `section` has
 * a value. Used so a section's highlight disappears the moment it's done,
 * even if the user is still focused inside it (e.g. clicking around after
 * finishing the last field).
 */
export const isGuideSectionComplete = (
  section: GuideSection,
  values: NewOrderFormValues,
): boolean =>
  GUIDE_STEPS.filter((step) => step.section === section && step.isApplicable(values)).every(
    (step) => step.isFilled(values),
  )
