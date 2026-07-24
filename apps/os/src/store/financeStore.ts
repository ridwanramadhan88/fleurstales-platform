/**
 * @file financeStore.ts
 * @description Finance transactions with manual entries, protected automatic
 * order/refund/payroll postings, and user-managed expense categories.
 */

import { create } from 'zustand'
import type { BranchId, PaymentMethod } from '../types/orders'
import type { UserRole } from './userStore'
import { canMakeFinanceTransactionDecision } from '../domain/financeTransactionStatusDomain'
import { canCreateFinanceTransaction } from '../domain/financeTransactionCreationDomain'
import { generateId } from '../lib/id'
import { isActionAuthorized } from '../config/authorization'
import {
  normalizeFinancePaymentMethod,
  validateCustomExpenseCategoryName,
} from '../domain/financeTransactionCategoryDomain'
import type {
  FinanceTransaction,
  FinanceCategory,
  FinanceCustomCategory,
  FinancePaymentMethod,
  FinanceTransactionType,
  FinanceTransactionScope,
  FinanceScopePolicy,
  FinanceCategoryOverride,
  FinanceBuiltInCategory,
} from './financeStoreTypes'

interface FinanceActor { name: string; role: UserRole }
interface CategoryActor { name: string; role: UserRole }
interface CategoryMutationResult { allowed: boolean; reason?: string; categoryId?: string }

export interface FinanceStoreState {
  transactions: FinanceTransaction[]
  customCategories: FinanceCustomCategory[]
  categoryOverrides: FinanceCategoryOverride[]
  addTransaction: (params: {
    type: FinanceTransactionType
    category: FinanceCategory
    branch?: BranchId | ''
    scope?: FinanceTransactionScope
    amount: number
    method?: FinancePaymentMethod
    name: string
    note?: string
    manualEntryReason?: string
    transactionDate?: string
    description?: string
    orderNumber?: string
    actor: FinanceActor
  }) => { allowed: boolean; reason?: string; field?: string; transactionId?: string }
  updateBuiltInCategory: (params: {
    categoryId: FinanceBuiltInCategory
    name: string
    description?: string
    scopePolicy: FinanceScopePolicy
    allowScopeOverride: boolean
    placeholder?: string
    active?: boolean
    actor: CategoryActor
  }) => CategoryMutationResult
  addExpenseCategory: (params: {
    name: string
    description?: string
    branchRequired: boolean
    scopePolicy?: FinanceScopePolicy
    allowScopeOverride?: boolean
    paymentMethodRequired: boolean
    defaultPaymentMethod?: FinancePaymentMethod
    placeholder?: string
    actor: CategoryActor
  }) => CategoryMutationResult
  updateExpenseCategory: (params: {
    categoryId: string
    name: string
    description?: string
    branchRequired: boolean
    scopePolicy?: FinanceScopePolicy
    allowScopeOverride?: boolean
    paymentMethodRequired: boolean
    defaultPaymentMethod?: FinancePaymentMethod
    placeholder?: string
    active?: boolean
    actor: CategoryActor
  }) => CategoryMutationResult
  deactivateExpenseCategory: (params: { categoryId: string; actor: CategoryActor }) => CategoryMutationResult
  removeExpenseCategory: (params: { categoryId: string; actor: CategoryActor }) => CategoryMutationResult
  recordOrderPayment: (params: {
    orderNumber: string
    branch: BranchId
    amount: number
    method?: PaymentMethod
    sourceEventId: string
    idempotencyKey: string
    actor: string
    occurredAt: string
    note?: string
  }) => { allowed: boolean; reason?: string; transactionId?: string; duplicate?: boolean }
  recordOrderRefund: (params: {
    orderNumber: string
    branch: BranchId
    amount: number
    method?: PaymentMethod
    sourceEventId: string
    idempotencyKey: string
    actor: string
    occurredAt: string
    note?: string
    status?: 'pending' | 'verified'
  }) => { allowed: boolean; reason?: string; transactionId?: string; duplicate?: boolean }
  recordPayrollExpense: (params: {
    payrollProposalId: string
    payrollPeriodId: string
    periodLabel: string
    amount: number
    paymentDate: string
    paymentMethod: string
    paymentReference: string
    note?: string
    idempotencyKey: string
    actor: string
  }) => { allowed: boolean; reason?: string; transactionId?: string; duplicate?: boolean }
  verifyOrderTransactions: (params: { orderNumber: string; actor: FinanceActor; completedAt?: string }) => { allowed: boolean; reason?: string; verifiedCount?: number }
  verifyTransaction: (params: { transactionId: string; actor: FinanceActor }) => { allowed: boolean; reason?: string }
  rejectTransaction: (params: { transactionId: string; actor: FinanceActor }) => { allowed: boolean; reason?: string }
}

const nowIso = (): string => new Date().toISOString()
const mapPaymentMethod = (method?: PaymentMethod): FinancePaymentMethod =>
  method === 'cash' ? 'cash' : method === 'transfer' ? 'transfer' : 'other'

const mapPayrollPaymentMethod = (method: string): FinancePaymentMethod => {
  const normalized = method.trim().toLowerCase()
  if (normalized.includes('cash')) return 'cash'
  if (normalized.includes('card')) return 'card'
  if (normalized.includes('transfer') || normalized.includes('bank')) return 'transfer'
  return 'other'
}

const INITIAL_TRANSACTIONS: FinanceTransaction[] = []
const INITIAL_CUSTOM_CATEGORIES: FinanceCustomCategory[] = []
const INITIAL_CATEGORY_OVERRIDES: FinanceCategoryOverride[] = []
const canManageCategories = (role: UserRole): boolean => role === 'finance' || role === 'owner'

const findDuplicate = (transactions: FinanceTransaction[], idempotencyKey: string): FinanceTransaction | undefined =>
  transactions.find((item) => item.idempotencyKey === idempotencyKey)

const validateIdempotentReplay = ({
  duplicate, orderNumber, branch, amount, category, method,
}: {
  duplicate: FinanceTransaction
  orderNumber: string
  branch: BranchId
  amount: number
  category: 'order_payment' | 'order_refund'
  method?: PaymentMethod
}): { allowed: true; transactionId: string; duplicate: true } | { allowed: false; reason: string } => {
  const sameCommand = duplicate.orderNumber === orderNumber && duplicate.branch === branch && duplicate.amount === amount && duplicate.category === category && duplicate.method === mapPaymentMethod(method)
  return sameCommand
    ? { allowed:true, transactionId:duplicate.id, duplicate:true }
    : { allowed:false, reason:'Idempotency key is already attached to a different ledger command.' }
}

export const useFinanceStore = create<FinanceStoreState>((set, get) => ({
  transactions: INITIAL_TRANSACTIONS,
  customCategories: INITIAL_CUSTOM_CATEGORIES,
  categoryOverrides: INITIAL_CATEGORY_OVERRIDES,

  addTransaction: ({ type, category, branch, scope = 'company', amount, method, name, note, manualEntryReason, transactionDate, description, orderNumber, actor }) => {
    if (!isActionAuthorized(actor.role, 'finance.create_ledger_entry')) {
      return { allowed:false, reason:'You do not have permission to create transactions.' }
    }
    const customCategories = get().customCategories
    const categoryOverrides = get().categoryOverrides
    const result = canCreateFinanceTransaction({ type, category, branch, scope, amount, method, name, note, manualEntryReason, actor, customCategories, categoryOverrides })
    if (!result.allowed) return result
    const timestamp = nowIso()
    const transactionId = generateId('txn')
    const normalizedNote = (note ?? description ?? '').trim()
    const newTransaction: FinanceTransaction = {
      id:transactionId,
      type,
      category,
      branch:(scope === 'branch' ? branch : 'All') as BranchId,
      scope,
      amount,
      method:normalizeFinancePaymentMethod(method),
      status:'pending',
      name:name.trim(),
      description:normalizedNote,
      note:normalizedNote || undefined,
      orderNumber,
      source:'manual',
      entryMode:'manual',
      transactionDate:transactionDate || timestamp,
      manualEntryReason:manualEntryReason?.trim() || undefined,
      actor:actor.name.trim(),
      createdAt:timestamp,
      updatedAt:timestamp,
    }
    set((state) => ({ transactions:[newTransaction, ...state.transactions] }))
    return { allowed:true, transactionId }
  },

  updateBuiltInCategory: ({ categoryId, name, description, scopePolicy, allowScopeOverride, placeholder, active, actor }) => {
    if (!canManageCategories(actor.role)) return { allowed:false, reason:'Only Finance or Owner can manage transaction categories.' }
    const nameError = validateCustomExpenseCategoryName(name, get().customCategories, categoryId, get().categoryOverrides)
    if (nameError) return { allowed:false, reason:nameError }
    const timestamp = nowIso()
    const override: FinanceCategoryOverride = {
      categoryId, label:name.trim(), description:description?.trim() || undefined, scopePolicy, allowScopeOverride,
      placeholder:placeholder?.trim() || undefined, active:active ?? true, updatedBy:actor.name.trim(), updatedAt:timestamp,
    }
    set((state) => ({ categoryOverrides:[...state.categoryOverrides.filter((item) => item.categoryId !== categoryId), override] }))
    return { allowed:true, categoryId }
  },

  addExpenseCategory: ({ name, description, branchRequired, scopePolicy, allowScopeOverride, paymentMethodRequired, defaultPaymentMethod, placeholder, actor }) => {
    if (!canManageCategories(actor.role)) return { allowed:false, reason:'Only Finance or Owner can manage transaction categories.' }
    const error = validateCustomExpenseCategoryName(name, get().customCategories, undefined, get().categoryOverrides)
    if (error) return { allowed:false, reason:error }
    const timestamp = nowIso()
    const categoryId = `custom:${generateId('expense-category')}` as const
    const category: FinanceCustomCategory = {
      id:categoryId,
      name:name.trim(),
      description:description?.trim() || undefined,
      direction:'expense',
      active:true,
      branchRequired:(scopePolicy ?? (branchRequired ? 'branch' : 'company')) === 'branch',
      scopePolicy:scopePolicy ?? (branchRequired ? 'branch' : 'company'),
      allowScopeOverride:allowScopeOverride ?? true,
      paymentMethodRequired,
      defaultPaymentMethod:paymentMethodRequired ? normalizeFinancePaymentMethod(defaultPaymentMethod) : undefined,
      placeholder:placeholder?.trim() || `e.g. ${name.trim()}`,
      createdBy:actor.name.trim(),
      createdAt:timestamp,
      updatedAt:timestamp,
      updatedBy:actor.name.trim(),
    }
    set((state) => ({ customCategories:[...state.customCategories, category] }))
    return { allowed:true, categoryId }
  },

  updateExpenseCategory: ({ categoryId, name, description, branchRequired, scopePolicy, allowScopeOverride, paymentMethodRequired, defaultPaymentMethod, placeholder, active, actor }) => {
    if (!canManageCategories(actor.role)) return { allowed:false, reason:'Only Finance or Owner can manage transaction categories.' }
    const current = get().customCategories.find((item) => item.id === categoryId)
    if (!current) return { allowed:false, reason:'Custom expense category not found.' }
    const error = validateCustomExpenseCategoryName(name, get().customCategories, categoryId, get().categoryOverrides)
    if (error) return { allowed:false, reason:error }
    set((state) => ({
      customCategories:state.customCategories.map((item) => item.id === categoryId ? {
        ...item,
        name:name.trim(),
        description:description?.trim() || undefined,
        branchRequired:(scopePolicy ?? (branchRequired ? 'branch' : 'company')) === 'branch',
        scopePolicy:scopePolicy ?? (branchRequired ? 'branch' : 'company'),
        allowScopeOverride:allowScopeOverride ?? item.allowScopeOverride ?? true,
        paymentMethodRequired,
        defaultPaymentMethod:paymentMethodRequired ? normalizeFinancePaymentMethod(defaultPaymentMethod) : undefined,
        placeholder:placeholder?.trim() || `e.g. ${name.trim()}`,
        active:active ?? item.active,
        updatedAt:nowIso(),
        updatedBy:actor.name.trim(),
      } : item),
    }))
    return { allowed:true, categoryId }
  },

  deactivateExpenseCategory: ({ categoryId, actor }) => {
    if (!canManageCategories(actor.role)) return { allowed:false, reason:'Only Finance or Owner can manage transaction categories.' }
    const current = get().customCategories.find((item) => item.id === categoryId)
    if (!current) return { allowed:false, reason:'Custom expense category not found.' }
    set((state) => ({ customCategories:state.customCategories.map((item) => item.id === categoryId ? { ...item, active:false, updatedAt:nowIso(), updatedBy:actor.name.trim() } : item) }))
    return { allowed:true, categoryId }
  },

  removeExpenseCategory: ({ categoryId, actor }) => {
    if (!canManageCategories(actor.role)) return { allowed:false, reason:'Only Finance or Owner can manage transaction categories.' }
    const current = get().customCategories.find((item) => item.id === categoryId)
    if (!current) return { allowed:false, reason:'Custom expense category not found.' }
    const inUse = get().transactions.some((transaction) => transaction.category === categoryId)
    if (inUse) return { allowed:false, reason:'This category is already used by transactions. Deactivate it instead.' }
    set((state) => ({ customCategories:state.customCategories.filter((item) => item.id !== categoryId) }))
    return { allowed:true, categoryId }
  },

  recordOrderPayment: ({ orderNumber, branch, amount, method, sourceEventId, idempotencyKey, actor, occurredAt, note }) => {
    if (!(amount > 0)) return { allowed:false, reason:'Payment transaction amount must be greater than zero.' }
    const duplicate = findDuplicate(get().transactions, idempotencyKey)
    if (duplicate) return validateIdempotentReplay({ duplicate, orderNumber, branch, amount, category:'order_payment', method })
    const transactionId = generateId('txn')
    const timestamp = nowIso()
    const transaction: FinanceTransaction = {
      id:transactionId, type:'income', category:'order_payment', branch, scope:'branch', amount, method:mapPaymentMethod(method), status:'pending',
      description:`Order payment · ${orderNumber}`, orderNumber, source:'order_payment', entryMode:'automatic', transactionDate:occurredAt, groupType:'order_day', groupKey:occurredAt.slice(0,10), groupLabel:occurredAt.slice(0,10), sourceEventId, idempotencyKey, isSystemGenerated:true,
      note, actor, createdAt:timestamp, updatedAt:timestamp,
    }
    set((state) => ({ transactions:[transaction, ...state.transactions] }))
    return { allowed:true, transactionId }
  },

  recordOrderRefund: ({ orderNumber, branch, amount, method, sourceEventId, idempotencyKey, actor, occurredAt, note, status = 'pending' }) => {
    if (!(amount > 0)) return { allowed:false, reason:'Refund transaction amount must be greater than zero.' }
    const duplicate = findDuplicate(get().transactions, idempotencyKey)
    if (duplicate) return validateIdempotentReplay({ duplicate, orderNumber, branch, amount, category:'order_refund', method })
    const transactionId = generateId('txn')
    const timestamp = nowIso()
    const transaction: FinanceTransaction = {
      id:transactionId, type:'expense', category:'order_refund', branch, scope:'branch', amount, method:mapPaymentMethod(method), status,
      description:`Order refund · ${orderNumber}`, orderNumber, source:'order_refund', entryMode:'automatic', transactionDate:occurredAt, groupType:'refund_day', groupKey:occurredAt.slice(0,10), groupLabel:occurredAt.slice(0,10), sourceEventId, idempotencyKey, isSystemGenerated:true,
      note, actor, createdAt:timestamp, updatedAt:timestamp,
    }
    set((state) => ({ transactions:[transaction, ...state.transactions] }))
    return { allowed:true, transactionId }
  },

  recordPayrollExpense: ({ payrollProposalId, payrollPeriodId, periodLabel, amount, paymentDate, paymentMethod, paymentReference, note, idempotencyKey, actor }) => {
    if (!(amount > 0)) return { allowed:false, reason:'Payroll expense amount must be greater than zero.' }
    const normalizedMethod = paymentMethod.trim()
    const normalizedReference = paymentReference.trim()
    if (!normalizedMethod || !normalizedReference) return { allowed:false, reason:'Payroll payment method and reference are required.' }
    const occurredAt = `${paymentDate}T12:00:00+07:00`
    const mappedMethod = mapPayrollPaymentMethod(normalizedMethod)
    const duplicate = findDuplicate(get().transactions, idempotencyKey)
    if (duplicate) {
      if (duplicate.source !== 'payroll' || duplicate.payrollProposalId !== payrollProposalId) return { allowed:false, reason:'Idempotency key is already attached to a different ledger command.' }
      set((state) => ({ transactions:state.transactions.map((item) => item.id === duplicate.id ? {
        ...item, amount, method:mappedMethod, status:'verified' as const, name:`Payroll ${periodLabel}`, description:`Payroll payment · ${periodLabel}`,
        payrollPeriodId, reference:normalizedReference, note, actor, transactionDate:occurredAt, groupType:'payroll_cycle', groupKey:payrollPeriodId, groupLabel:periodLabel, entryMode:'automatic', scope:'company', updatedAt:nowIso(),
      } : item) }))
      return { allowed:true, transactionId:duplicate.id, duplicate:true }
    }
    const transactionId = generateId('txn')
    const timestamp = nowIso()
    const transaction: FinanceTransaction = {
      id:transactionId, type:'expense', category:'payroll', branch:'All', scope:'company', amount, method:mappedMethod, status:'verified',
      name:`Payroll ${periodLabel}`, description:`Payroll payment · ${periodLabel}`, payrollProposalId, payrollPeriodId,
      reference:normalizedReference, source:'payroll', entryMode:'automatic', transactionDate:occurredAt, groupType:'payroll_cycle', groupKey:payrollPeriodId, groupLabel:periodLabel, sourceEventId:payrollProposalId, idempotencyKey, isSystemGenerated:true,
      note, actor, createdAt:timestamp, updatedAt:timestamp,
    }
    set((state) => ({ transactions:[transaction, ...state.transactions] }))
    return { allowed:true, transactionId }
  },

  verifyOrderTransactions: ({ orderNumber, actor, completedAt }) => {
    if (!isActionAuthorized(actor.role, 'finance.verify_order')) return { allowed:false, reason:'Only Finance or Owner can verify order transaction entries.' }
    const matchingPending = get().transactions.filter((item) =>
      item.orderNumber === orderNumber && item.isSystemGenerated && item.status === 'pending',
    )
    if (matchingPending.length === 0) return { allowed:true, verifiedCount:0 }
    const completionTime = completedAt ? new Date(completedAt) : null
    if (!completionTime || Number.isNaN(completionTime.getTime())) {
      const timestamp = nowIso()
      set((state) => ({
        transactions:state.transactions.map((item) =>
          item.orderNumber === orderNumber && item.isSystemGenerated && item.status === 'pending'
            ? { ...item, dataWarning:'Order completion time is missing. Correct the order before confirming this transaction.', updatedAt:timestamp }
            : item,
        ),
      }))
      return { allowed:false, reason:'Order completion time is missing. Correct the order before confirming its transaction.', verifiedCount:0 }
    }
    const completionIso = completedAt as string
    const timestamp = nowIso()
    let verifiedCount = 0
    set((state) => ({ transactions:state.transactions.map((item) => {
      if (item.orderNumber !== orderNumber || !item.isSystemGenerated || item.status !== 'pending') return item
      verifiedCount += 1
      return {
        ...item,
        status:'verified' as const,
        actor:actor.name,
        transactionDate:completionIso,
        groupType:'order_day' as const,
        groupKey:completionIso.slice(0,10),
        groupLabel:completionIso.slice(0,10),
        dataWarning:undefined,
        updatedAt:timestamp,
      }
    }) }))
    return { allowed:true, verifiedCount }
  },

  verifyTransaction: ({ transactionId, actor }) => {
    let result: { allowed:boolean; reason?:string } = { allowed:false, reason:'Transaction not found.' }
    set((state) => {
      const transaction = state.transactions.find((item) => item.id === transactionId)
      result = canMakeFinanceTransactionDecision({ transaction, role:actor.role, decision:'verify', capabilityAllowed:isActionAuthorized(actor.role, 'finance.verify_ledger_entry') })
      if (!result.allowed) return state
      const timestamp = nowIso()
      return { transactions:state.transactions.map((item) => item.id === transactionId ? { ...item, status:'verified' as const, actor:actor.name, updatedAt:timestamp } : item) }
    })
    return result
  },

  rejectTransaction: ({ transactionId, actor }) => {
    let result: { allowed:boolean; reason?:string } = { allowed:false, reason:'Transaction not found.' }
    set((state) => {
      const transaction = state.transactions.find((item) => item.id === transactionId)
      if (transaction?.isSystemGenerated) {
        result = { allowed:false, reason:'Automatic transactions are immutable. Correct the linked workflow instead.' }
        return state
      }
      result = canMakeFinanceTransactionDecision({ transaction, role:actor.role, decision:'reject', capabilityAllowed:isActionAuthorized(actor.role, 'finance.verify_ledger_entry') })
      if (!result.allowed) return state
      const timestamp = nowIso()
      return { transactions:state.transactions.map((item) => item.id === transactionId ? { ...item, status:'rejected' as const, actor:actor.name, updatedAt:timestamp } : item) }
    })
    return result
  },
}))
