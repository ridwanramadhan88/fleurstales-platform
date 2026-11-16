/**
 * @file financeUiStore.ts
 * @description Finance workspace UI state that more than one screen touches:
 * the selected month, the Tasks filter, which order/transaction sheet is
 * open, and deep-link focus from notifications. Replaces the old
 * `window.dispatchEvent` bridges so every hand-off is a typed store call.
 */

import { create } from 'zustand'
import { jakartaMonthKey } from '../../domain/financeDates'
import type { FinanceWorkspaceModule } from '../../domain/financeWorkspaceDomain'

export type FinanceTaskFilter = 'all' | 'requests' | 'purchases' | 'reconciliation' | 'refunds' | 'payroll' | 'accounts'

export type FinancePayrollView = 'review' | 'ready' | 'history'

/** A one-shot request for a screen to show something specific. */
export type FinanceFocus =
  | { module: 'tasks'; filter?: FinanceTaskFilter; orderNumber?: string }
  | { module: 'cash'; accountId?: string }
  | { module: 'payroll'; view?: FinancePayrollView; proposalId?: string }
  | { module: 'report' }

interface FinanceUiState {
  /** Selected business month (`YYYY-MM`, WIB) for Cash & Transactions and Reports. */
  month: string
  taskFilter: FinanceTaskFilter
  /** Order whose Finance review sheet is open. */
  reviewOrderNumber: string | null
  /** Ledger row whose detail sheet is open. */
  detailTransactionId: string | null
  /** Posted ledger row being edited. */
  editTransactionId: string | null
  /** Posted ledger row being voided. */
  voidTransactionId: string | null
  focus: FinanceFocus | null
  /** Bumped on every focus request so screens can react to repeats. */
  focusVersion: number

  setMonth: (month: string) => void
  setTaskFilter: (filter: FinanceTaskFilter) => void
  openOrderReview: (orderNumber: string | null) => void
  openTransactionDetail: (transactionId: string | null) => void
  openTransactionEdit: (transactionId: string | null) => void
  openTransactionVoid: (transactionId: string | null) => void
  requestFocus: (focus: FinanceFocus) => void
  /** Returns and clears the pending focus when it targets `module`. */
  consumeFocus: <M extends FinanceWorkspaceModule>(module: M) => Extract<FinanceFocus, { module: M }> | null
  reset: () => void
}

const initialState = () => ({
  month: jakartaMonthKey(),
  taskFilter: 'all' as FinanceTaskFilter,
  reviewOrderNumber: null,
  detailTransactionId: null,
  editTransactionId: null,
  voidTransactionId: null,
  focus: null,
  focusVersion: 0,
})

export const useFinanceUiStore = create<FinanceUiState>((set, get) => ({
  ...initialState(),
  setMonth: (month) => set({ month }),
  setTaskFilter: (taskFilter) => set({ taskFilter }),
  openOrderReview: (reviewOrderNumber) => set({ reviewOrderNumber }),
  openTransactionDetail: (detailTransactionId) => set({ detailTransactionId }),
  openTransactionEdit: (editTransactionId) => set({ editTransactionId, detailTransactionId: null }),
  openTransactionVoid: (voidTransactionId) => set({ voidTransactionId, detailTransactionId: null }),
  requestFocus: (focus) => set((state) => ({
    focus,
    focusVersion: state.focusVersion + 1,
    ...(focus.module === 'tasks' ? { taskFilter: focus.filter ?? 'all' } : {}),
    ...(focus.module === 'tasks' && focus.orderNumber ? { reviewOrderNumber: focus.orderNumber } : {}),
  })),
  consumeFocus: (module) => {
    const focus = get().focus
    if (!focus || focus.module !== module) return null
    set({ focus: null })
    return focus as Extract<FinanceFocus, { module: typeof module }>
  },
  reset: () => set(initialState()),
}))
