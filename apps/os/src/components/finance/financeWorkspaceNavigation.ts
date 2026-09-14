import type { FinanceWorkspaceModule } from '../../domain/financeWorkspaceDomain'

export type FinanceWorkspaceFocus =
  | { module: 'order_verification'; view: 'all' | 'needs_correction' }
  | { module: 'refunds'; view: 'pending' }
  | { module: 'payroll'; view: 'review' | 'ready' | 'history'; proposalId?: string }
  | { module: 'ledger'; view: 'legacy' }

const NAVIGATION_EVENT = 'finance-workspace-navigate'
let pendingFocus: FinanceWorkspaceFocus | null = null

export const requestFinanceWorkspaceNavigation = (focus: FinanceWorkspaceFocus): void => {
  pendingFocus = focus
  window.dispatchEvent(new CustomEvent<FinanceWorkspaceFocus>(NAVIGATION_EVENT, { detail: focus }))
}

export const subscribeFinanceWorkspaceNavigation = (
  listener: (module: FinanceWorkspaceModule) => void,
): (() => void) => {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<FinanceWorkspaceFocus>).detail
    if (detail?.module) listener(detail.module)
  }
  window.addEventListener(NAVIGATION_EVENT, handler)
  return () => window.removeEventListener(NAVIGATION_EVENT, handler)
}

export const consumeFinanceWorkspaceFocus = <M extends FinanceWorkspaceFocus['module']>(
  module: M,
): Extract<FinanceWorkspaceFocus, { module: M }> | null => {
  if (!pendingFocus || pendingFocus.module !== module) return null
  const focus = pendingFocus as Extract<FinanceWorkspaceFocus, { module: M }>
  pendingFocus = null
  return focus
}

export const subscribeFinanceWorkspaceFocus = <M extends FinanceWorkspaceFocus['module']>(
  module: M,
  listener: (focus: Extract<FinanceWorkspaceFocus, { module: M }>) => void,
): (() => void) => {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<FinanceWorkspaceFocus>).detail
    if (!detail || detail.module !== module) return
    pendingFocus = null
    listener(detail as Extract<FinanceWorkspaceFocus, { module: M }>)
  }
  window.addEventListener(NAVIGATION_EVENT, handler)
  return () => window.removeEventListener(NAVIGATION_EVENT, handler)
}
