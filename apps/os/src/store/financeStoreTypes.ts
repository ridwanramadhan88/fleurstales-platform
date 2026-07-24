/**
 * @file financeStoreTypes.ts
 * @description Shared type definitions for Finance transactions and the
 * category registry used by creation, filtering, exports, and history.
 */

import type { BranchId } from '../types/orders'

export type FinanceTransactionType = 'income' | 'expense'

export type FinanceBuiltInCategory =
  | 'order_payment'
  | 'walk_in_sale'
  | 'other_income'
  | 'reimbursement_received'
  | 'owner_deposit'
  | 'order_refund'
  | 'supplies'
  | 'payroll'
  | 'rent'
  | 'utilities'
  | 'other'

export type FinanceCustomCategoryId = `custom:${string}`
export type FinanceCategory = FinanceBuiltInCategory | FinanceCustomCategoryId

export type FinanceCategoryWorkflow = 'orders' | 'payroll' | 'refunds'
export type FinanceTransactionScope = 'company' | 'branch'
export type FinanceScopePolicy = 'company' | 'branch' | 'user_choice'
export type FinanceTransactionEntryMode = 'manual' | 'automatic'
export type FinanceTransactionGroupType = 'order_day' | 'payroll_cycle' | 'refund_day' | 'source_batch'

export interface FinanceCategoryDefinition {
  id: FinanceCategory
  label: string
  direction: FinanceTransactionType
  kind: 'system' | 'manual' | 'custom'
  active: boolean
  manuallyCreatable: boolean
  branchRequired: boolean
  scopePolicy?: FinanceScopePolicy
  allowScopeOverride?: boolean
  paymentMethodRequired: boolean
  placeholder: string
  description?: string
  linkedWorkflow?: FinanceCategoryWorkflow
  systemKey?: string
}

export interface FinanceCategoryOverride {
  categoryId: FinanceBuiltInCategory
  label?: string
  description?: string
  active?: boolean
  scopePolicy?: FinanceScopePolicy
  allowScopeOverride?: boolean
  placeholder?: string
  updatedBy: string
  updatedAt: string
}

export interface FinanceCustomCategory {
  id: FinanceCustomCategoryId
  name: string
  description?: string
  direction: 'expense'
  active: boolean
  branchRequired: boolean
  scopePolicy?: FinanceScopePolicy
  allowScopeOverride?: boolean
  paymentMethodRequired: boolean
  defaultPaymentMethod?: FinancePaymentMethod
  placeholder: string
  createdBy: string
  createdAt: string
  updatedAt: string
  updatedBy?: string
}

export type FinancePaymentMethod = 'cash' | 'transfer' | 'card' | 'other'
export type FinanceTransactionStatus = 'pending' | 'verified' | 'rejected'
export type FinanceTransactionSource = 'manual' | 'order_payment' | 'order_refund' | 'payroll'

export interface FinanceTransaction {
  id: string
  type: FinanceTransactionType
  category: FinanceCategory
  branch: BranchId
  scope?: FinanceTransactionScope
  amount: number
  method: FinancePaymentMethod
  status: FinanceTransactionStatus
  /** Human-readable transaction title. */
  name?: string
  /** Optional supporting context retained for backwards compatibility. */
  description: string
  orderNumber?: string
  payrollProposalId?: string
  payrollPeriodId?: string
  reference?: string
  source?: FinanceTransactionSource
  entryMode?: FinanceTransactionEntryMode
  transactionDate?: string
  groupType?: FinanceTransactionGroupType
  groupKey?: string
  groupLabel?: string
  manualEntryReason?: string
  /** Data-quality issue that keeps an automatic transaction pending. */
  dataWarning?: string
  sourceEventId?: string
  idempotencyKey?: string
  isSystemGenerated?: boolean
  reversalOfTransactionId?: string
  note?: string
  actor: string
  createdAt: string
  updatedAt: string
}
