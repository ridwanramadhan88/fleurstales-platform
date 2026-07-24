/**
 * @file customerStoreTypes.ts
 * @description Shared type definitions for the customer store and domain/events.
 * Store modules only hold raw state and CRUD logic; types live here to avoid
 * circular dependencies.
 */

import type { BranchId } from '../types/orders'

export type CustomerCreatedSource = 'storefront' | 'admin'

/** Missing CRM values discovered while taking an order from an existing customer. */
export interface CustomerProfileSuggestions {
  birthday?: string
  email?: string
  preferredBranchId?: BranchId
}

/**
 * @description Core customer profile stored in the CRM.
 * Orders link through the stable customer id; normalized WhatsApp is the
 * primary lookup key during intake and search.
 */
export interface CustomerProfile {
  /** Stable internal id. */
  id: string
  /** Optimistic concurrency revision for future shared CRM writes. */
  revision?: number
  /** ISO timestamps retained when the CRM moves to the shared backend. */
  createdAt?: string
  updatedAt?: string
  /** Display name, aligned with order rows. */
  name: string
  /** Customer-facing WhatsApp number. */
  whatsappNumber: string
  /** Canonical WhatsApp digits used for duplicate-safe matching. */
  normalizedWhatsappNumber: string
  /** @deprecated Legacy persisted alias. Migrated to whatsappNumber. */
  phone?: string
  /** Optional email for promotions and receipts. */
  email?: string
  /** Optional birthday in YYYY-MM-DD, used for birthday promos. */
  birthday?: string
  /** Preferred branch for this customer, if any. */
  preferredBranch?: BranchId
  /** Free-form tags (e.g. "VIP", "Corporate"). */
  tags?: string[]
  /** Internal notes for staff context (not shown to customer). */
  notes?: string
  /** Optional active promo code for this customer, managed in the CRM. */
  promoCode?: string
  /** Intake source that first created the CRM profile. */
  createdSource?: CustomerCreatedSource
}

export interface CustomerCreateInput {
  name: string
  whatsappNumber: string
  email?: string
  birthday?: string
  preferredBranch?: BranchId
  tags?: string[]
  notes?: string
  promoCode?: string
  createdSource?: CustomerCreatedSource
}

export interface CustomerIntakeInput extends CustomerCreateInput {
  /** Existing-profile suggestions explicitly accepted by Admin. */
  acceptedSuggestions?: Partial<CustomerProfileSuggestions>
}

export interface CustomerIntakeResult {
  customer: CustomerProfile
  isNew: boolean
  suggestions: CustomerProfileSuggestions
}

/**
 * @description How the VIP threshold rules combine when a customer meets
 * only one of the two conditions (spend / order count).
 * - 'either': VIP if spend OR order count threshold is met.
 * - 'both': VIP only if spend AND order count thresholds are both met.
 * - 'spend': VIP based on lifetime spend only.
 * - 'orders': VIP based on order count only.
 */
export type VipRuleMode = 'either' | 'both' | 'spend' | 'orders'

/**
 * @description Owner-configurable rule for what makes a customer "VIP".
 * Surfaced in the Customers tab settings and consumed by customerDomain's
 * segmentation logic — UI must not hardcode these thresholds.
 */
export interface CustomerSegmentRules {
  /** Which condition(s) below must be met to count as VIP. */
  mode: VipRuleMode
  /** Minimum lifetime spend (IDR) to qualify as VIP. */
  minLifetimeSpend: number
  /** Minimum order count to qualify as VIP. */
  minOrderCount: number
}
