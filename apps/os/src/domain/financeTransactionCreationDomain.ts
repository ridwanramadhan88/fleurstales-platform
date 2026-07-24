import type { BranchId } from '../types/orders'
import type { UserRole } from '../store/userStore'
import type {
  FinanceCategory,
  FinanceCategoryOverride,
  FinanceCustomCategory,
  FinancePaymentMethod,
  FinanceTransactionScope,
  FinanceTransactionType,
} from '../store/financeStoreTypes'
import { getFinanceCategoryDefinition } from './financeTransactionCategoryDomain'

interface FinanceActor { name: string; role: UserRole }

export interface FinanceTransactionCreationInput {
  type: FinanceTransactionType
  category: FinanceCategory
  branch?: BranchId | ''
  scope?: FinanceTransactionScope
  amount: number
  method?: FinancePaymentMethod
  name: string
  note?: string
  manualEntryReason?: string
  description?: string
  actor: FinanceActor
  customCategories?: FinanceCustomCategory[]
  categoryOverrides?: FinanceCategoryOverride[]
}

export type FinanceTransactionCreationResult =
  | { allowed: true }
  | { allowed: false; reason: string; field?: 'type' | 'category' | 'branch' | 'amount' | 'method' | 'name' | 'manualEntryReason' }

export const canCreateFinanceTransaction = ({
  type, category, branch, scope = 'company', amount, method, name, manualEntryReason, actor,
  customCategories = [], categoryOverrides = [],
}: FinanceTransactionCreationInput): FinanceTransactionCreationResult => {
  if (actor.role !== 'finance' && actor.role !== 'owner') return { allowed:false, reason:'Only Finance or Owner can create transactions.' }
  const definition = getFinanceCategoryDefinition(category, customCategories, categoryOverrides)
  if (!definition || !definition.active) return { allowed:false, reason:'Select an active transaction category.', field:'category' }
  if (definition.direction !== type) return { allowed:false, reason:'The selected category does not match Money In / Money Out.', field:'category' }
  if (!name.trim()) return { allowed:false, reason:'Transaction is required.', field:'name' }
  if (!Number.isFinite(amount) || amount <= 0) return { allowed:false, reason:'Amount must be greater than zero.', field:'amount' }
  if (scope === 'branch' && (!branch || branch === 'All')) return { allowed:false, reason:'Select a Branch.', field:'branch' }
  if (definition.scopePolicy === 'branch' && scope !== 'branch' && definition.allowScopeOverride === false) return { allowed:false, reason:'This category requires a branch.', field:'branch' }
  if (definition.paymentMethodRequired && !method) return { allowed:false, reason:'Select a payment method.', field:'method' }
  if (definition.linkedWorkflow && (manualEntryReason ?? '').trim().length < 6) return { allowed:false, reason:'Explain why this automatic category is being entered manually.', field:'manualEntryReason' }
  return { allowed:true }
}
