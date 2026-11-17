/**
 * Guard: Finance dialogs and sheets (opened from Tasks and Cash &
 * Transactions) show no English UI words with Indonesian selected. The
 * screen-level guard only sees closed screens; this one opens the overlays.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HomePage from '../pages/Home'
import { UiLanguageBridge } from '../i18n/UiLanguageBridge'
import { useUiLanguage } from '../i18n/uiLanguage'
import { useUserStore } from '../store/userStore'
import { useOrdersStore } from '../store/ordersStore'
import { useFinanceStore } from '../store/financeStore'
import { useFinanceUiStore } from '../components/finance/financeUiStore'
import { makeOrder } from './factories/order'
import { makeFinanceTransaction } from './factories/financeTransaction'

const ENGLISH_WORDS = [
  'the', 'and', 'for', 'with', 'your', 'this', 'only', 'all', 'view', 'review', 'pending',
  'waiting', 'order', 'orders', 'today', 'manage', 'details', 'payment', 'add', 'needs',
  'settings', 'period', 'no', 'not', 'open', 'show', 'select', 'choose', 'search', 'save',
  'cancel', 'close', 'edit', 'delete', 'new', 'date', 'customer', 'payroll', 'yet',
  'available', 'required', 'optional', 'loading', 'found', 'legacy', 'correction',
  'refund', 'refunds', 'ready', 'paid', 'account', 'accounts', 'balance', 'history',
  'reference', 'entry', 'transaction', 'code', 'amount', 'category', 'branch', 'proof',
  'source', 'automatic', 'reason', 'note', 'money', 'record', 'evidence', 'ledger',
]
const ENGLISH = new RegExp(`\\b(${ENGLISH_WORDS.join('|')})\\b`, 'i')

const collectEnglish = (root: HTMLElement): string[] => {
  const found = new Set<string>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    const parent = node.parentElement
    if (!text || !parent || parent.closest('script, style, [data-no-translate], .sr-only')) continue
    if (ENGLISH.test(text)) found.add(text)
  }
  for (const element of Array.from(root.querySelectorAll('[placeholder], [title]'))) {
    for (const attribute of ['placeholder', 'title']) {
      const value = element.getAttribute(attribute)
      if (value && ENGLISH.test(value)) found.add(`[${attribute}] ${value}`)
    }
  }
  return [...found]
}

const originalOrders = useOrdersStore.getState().orders
const originalTransactions = useFinanceStore.getState().transactions
const originalRole = useUserStore.getState().role
afterEach(() => {
  cleanup()
  useUserStore.getState().setRole(originalRole)
  useOrdersStore.setState({ orders: originalOrders })
  useFinanceStore.setState({ transactions: originalTransactions })
})

const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) }) }
const dialog = (): HTMLElement => {
  const open = [...screen.queryAllByRole('dialog'), ...screen.queryAllByRole('alertdialog')]
  if (open.length === 0) throw new Error('No dialog is open')
  return open[open.length - 1]
}

describe('Finance dialogs copy guard', () => {
  it('shows no English words in Finance dialogs', { timeout: 60_000 }, async () => {
    useUiLanguage.getState().setLanguage('id')
    useFinanceUiStore.getState().reset()
    useOrdersStore.setState({ orders: [
      makeOrder({ id: 'g1', orderNumber: 'KDM-2026-9201', customerName: 'Guard Lunas', status: 'delivered', paymentStatus: 'paid', paidAmountIdr: 250_000, totalIdr: 250_000 }),
      makeOrder({ id: 'g2', orderNumber: 'KDM-2026-9202', customerName: 'Guard Refund', status: 'cancelled', paymentStatus: 'refund_pending', refundAmountIdr: 100_000, refundReason: 'Order cancelled after payment.' }),
    ] })
    useFinanceStore.setState({ transactions: [
      makeFinanceTransaction({ id: 'g-pay', source: 'order_payment', entryMode: 'automatic', orderNumber: 'KDM-2026-9201', name: 'Order payment', amount: 250_000, transactionDate: new Date().toISOString() }),
      makeFinanceTransaction({ id: 'g-man', type: 'expense', category: 'utilities' as never, name: 'Listrik', description: 'Tagihan listrik', amount: 90_000, transactionDate: new Date().toISOString() }),
    ] })
    useUserStore.getState().setRole('finance')
    render(<><UiLanguageBridge /><HomePage initialBranch="All" /></>)
    await settle()

    const leftovers = new Map<string, string[]>()
    const check = async (name: string) => {
      await settle()
      const words = collectEnglish(dialog())
      if (words.length) leftovers.set(name, words)
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
      await settle()
    }

    const tabs = () => screen.getByRole('tablist', { name: 'Keuangan' })
    const menu = screen.queryAllByRole('button', { name: /^(Finance|Keuangan)$/ })[0]
    if (menu) fireEvent.click(menu)
    await settle()

    // Tasks → payment review sheet, refund dialog.
    fireEvent.click(screen.getByRole('button', { name: /KDM-2026-9201 · Guard Lunas/ }))
    await check('order review sheet')
    fireEvent.click(screen.getByRole('button', { name: 'Selesaikan' }))
    await check('refund dialog')

    // Cash & Transactions → detail sheet and the Record dialogs.
    fireEvent.click(within(tabs()).getByRole('tab', { name: 'Kas & Transaksi' }))
    await settle()
    fireEvent.click(within(screen.getByRole('list', { name: 'Buku kas' })).getByText('Listrik'))
    await check('transaction detail sheet')
    for (const item of ['Uang keluar', 'Transfer antar rekening', 'Sesuaikan saldo']) {
      fireEvent.pointerDown(screen.getByRole('button', { name: /^Catat/ }), { button: 0, pointerType: 'mouse' })
      await settle()
      fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(item) }))
      await check(`record: ${item}`)
    }

    const report = [...leftovers].map(([name, words]) => `${name}\n${words.map((word) => `  - ${word}`).join('\n')}`).join('\n')
    expect(report).toBe('')
  })
})
