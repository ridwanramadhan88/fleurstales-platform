/**
 * Guard: with Indonesian selected, the main screens of every role must not
 * show English UI words. Renders the real app shell with the translation
 * bridge, opens every menu item, and collects visible English words.
 */
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HomePage from '../pages/Home'
import { UiLanguageBridge } from '../i18n/UiLanguageBridge'
import { useUiLanguage } from '../i18n/uiLanguage'
import { useUserStore, type UserRole } from '../store/userStore'
import { useOrdersStore } from '../store/ordersStore'
import { makeOrder } from './factories/order'
import { useFinanceStore } from '../store/financeStore'

// Words that only appear in English UI copy. Business values (product and
// branch names, SKUs, WhatsApp, BCA, PDF, CSV) are not in this list.
const ENGLISH_WORDS = [
  'the', 'and', 'for', 'with', 'your', 'this', 'only', 'all', 'view', 'review', 'pending',
  'waiting', 'order', 'orders', 'today', 'tomorrow', 'manage', 'details', 'items', 'staff',
  'payment', 'add', 'needs', 'attention', 'settings', 'period', 'caught', 'up', 'no', 'not',
  'open', 'show', 'hide', 'select', 'choose', 'search', 'save', 'cancel', 'close', 'edit',
  'delete', 'new', 'time', 'date', 'florist', 'customer', 'customers', 'schedule',
  'attendance', 'payroll', 'points', 'adjustments', 'employment', 'dates', 'access', 'section',
  'yet', 'available', 'required', 'optional', 'loading', 'empty', 'found', 'export',
  'cleanup', 'legacy', 'rows', 'blockers', 'blocker', 'default', 'role', 'roles', 'employee', 'employees',
  'base', 'salary', 'monthly', 'correction', 'awaiting', 'refunds', 'ready', 'pay', 'paid',
  'unpaid', 'waiting', 'completion', 'account', 'accounts', 'balance', 'history', 'week', 'month',
]
const ENGLISH = new RegExp(`\\b(${ENGLISH_WORDS.join('|')})\\b`, 'i')
// Brand and business names that contain an English word.
// "People" is the agreed name of the staff workspace (see the wording
// contract in naturalTranslations.ts), not a leftover.
const ALLOWED = [/^Fleurstales Florist$/]
// Raw ISO dates ("2026-10-03") are machine format; staff read "3 Okt".
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/
const isEnglish = (text: string): boolean =>
  (ENGLISH.test(text) || ISO_DATE.test(text)) && !ALLOWED.some((pattern) => pattern.test(text))

const collectEnglish = (root: HTMLElement): string[] => {
  const found = new Set<string>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    const parent = node.parentElement
    if (!text || !parent || parent.closest('script, style, [data-no-translate], .sr-only')) continue
    if (isEnglish(text)) found.add(text)
  }
  for (const element of Array.from(root.querySelectorAll('[placeholder], [aria-label], [title]'))) {
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
      const value = element.getAttribute(attribute)
      if (value && isEnglish(value)) found.add(`[${attribute}] ${value}`)
    }
  }
  return [...found]
}

const originalRole = useUserStore.getState().role
const originalOrders = useOrdersStore.getState().orders
const originalTransactions = useFinanceStore.getState().transactions
afterEach(() => {
  useUserStore.getState().setRole(originalRole)
  useOrdersStore.setState({ orders: originalOrders })
  useFinanceStore.setState({ transactions: originalTransactions })
})

const ROLES: UserRole[] = ['owner', 'admin', 'finance', 'hr', 'florist']

describe('Indonesian copy guard', () => {
  it.each(ROLES)('%s screens show no English UI words', { timeout: 60_000 }, async (role) => {
    useUiLanguage.getState().setLanguage('id')
    // Some work waiting, so cards that only show with data are checked too.
    useOrdersStore.setState({ orders: [
      makeOrder({ id: 'w1', orderNumber: 'KDM-2026-9101', customerName: 'Guard Lunas', status: 'delivered', paymentStatus: 'paid', financeVerified: false } as never),
      makeOrder({ id: 'w2', orderNumber: 'KDM-2026-9102', customerName: 'Guard Refund', status: 'cancelled', paymentStatus: 'refund_pending' } as never),
    ] })
    useFinanceStore.setState({ transactions: [
      { id: 'tx-w1', status: 'verified', source: 'order_payment', orderNumber: 'KDM-2026-9101', accountId: 'cash:main', type: 'income', category: 'order_payment', branch: 'Kedamaian', method: 'cash', description: 'Pembayaran pesanan', amount: 100000, createdAt: new Date().toISOString() } as never,
      { id: 'tx-lama', status: 'verified', source: 'manual', type: 'income', category: 'other_income', branch: 'Kedamaian', method: 'cash', description: 'Catatan lama', amount: 5000, createdAt: new Date().toISOString() } as never,
    ] })
    useUserStore.getState().setRole(role)
    const { container } = render(<><UiLanguageBridge /><HomePage initialBranch="All" /></>)
    const leftovers = new Map<string, string[]>()
    const nav = within(container).getByRole('navigation', { name: /Primary|Utama/ })
    const items = within(nav).getAllByRole('button').map((button) => button.textContent ?? '')
    for (const label of items) {
      const button = within(nav).getAllByRole('button').find((candidate) => candidate.textContent === label)
      if (!button) continue
      await act(async () => { fireEvent.click(button) })
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      const record = (screen: string) => {
        const english = collectEnglish(container)
        if (english.length) leftovers.set(screen, english)
      }
      record(label)
      // Then every tab inside the screen (Finance modules, sub-tabs).
      const tabLabels = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"], nav button'))
        .filter((tab) => !nav.contains(tab))
        .map((tab) => tab.textContent ?? '')
      for (const tabLabel of tabLabels) {
        const tab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"], nav button'))
          .find((candidate) => !nav.contains(candidate) && candidate.textContent === tabLabel)
        if (!tab) continue
        await act(async () => { fireEvent.click(tab) })
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
        record(`${label} › ${tabLabel}`)
      }
    }
    const report = [...leftovers].map(([screen, words]) => `${role} › ${screen}\n  - ${words.join('\n  - ')}`).join('\n')
    expect(report).toBe('')
  })

  it('order dialogs show no English UI words', { timeout: 60_000 }, async () => {
    useUiLanguage.getState().setLanguage('id')
    useUserStore.getState().setRole('owner')
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
    useOrdersStore.setState({ orders: [
      makeOrder({ id: 'g1', orderNumber: 'KDM-2026-9001', customerName: 'Guard Baru', status: 'pending_verification', fulfillment: 'delivery', deliveryAddress: 'Jl. Uji 1', scheduleDate: today, scheduleTime: '23:00', branch: 'Kedamaian' } as never),
      makeOrder({ id: 'g2', orderNumber: 'KDM-2026-9002', customerName: 'Guard Dikonfirmasi', status: 'confirmed', fulfillment: 'pickup', paymentStatus: 'unpaid', paymentMethod: 'transfer', scheduleDate: today, scheduleTime: '23:15', branch: 'Kedamaian' } as never),
      makeOrder({ id: 'g3', orderNumber: 'KDM-2026-9003', customerName: 'Guard Diproses', status: 'processing', fulfillment: 'pickup', paymentStatus: 'paid', florist: 'Agus', scheduleDate: today, scheduleTime: '23:30', branch: 'Kedamaian' } as never),
      makeOrder({ id: 'g5', orderNumber: 'KDM-2026-9005', customerName: 'Guard Storefront', source: 'customer_app', status: 'pending_verification', fulfillment: 'pickup', paymentStatus: 'unpaid', scheduleDate: today, scheduleTime: '22:45', branch: 'Kedamaian' } as never),
      makeOrder({ id: 'g4', orderNumber: 'KDM-2026-9004', customerName: 'Guard Siap', status: 'ready', fulfillment: 'delivery', paymentStatus: 'paid', deliveryAddress: 'Jl. Uji 4', florist: 'Agus', scheduleDate: today, scheduleTime: '23:45', branch: 'Kedamaian' } as never),
    ] })
    const { container } = render(<><UiLanguageBridge /><HomePage initialBranch="Kedamaian" /></>)
    const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const click = async (element: HTMLElement) => { await act(async () => { fireEvent.click(element) }); await settle() }
    const findButton = (pattern: RegExp, root: HTMLElement = document.body) =>
      within(root).getAllByRole('button').find((button) => pattern.test((button.textContent ?? '').trim()))
    const leftovers = new Map<string, string[]>()
    const opened: string[] = []
    const record = (screen: string) => {
      opened.push(screen)
      const english = collectEnglish(document.body)
      if (english.length) leftovers.set(screen, english)
    }

    const nav = within(container).getByRole('navigation', { name: /Primary|Utama/ })
    await click(findButton(/^Pesanan$/, nav)!)
    await click(findButton(/^Pesanan baru$/)!)
    const sheet = document.querySelector<HTMLElement>('[role="dialog"]')!
    for (const extra of [/Tambah kartu ucapan/, /Tambah catatan/]) {
      const button = findButton(extra, sheet)
      if (button) await click(button)
    }
    record('Pesanan baru')
    await click(findButton(/^Walk-in$/, sheet)!)
    record('Pesanan baru › Walk-in')
    await click(findButton(/^WhatsApp$/, sheet)!)
    await click(findButton(/^Pengiriman$/, sheet)!)
    record('Pesanan baru › Pengiriman')
    await click(within(sheet).getByRole('button', { name: /Tutup pesanan baru|Close new order/ }))

    // One order per step of the order process.
    const checkOrderPanels = async (who: string, root: HTMLElement) => {
      for (const name of ['Guard Baru', 'Guard Storefront', 'Guard Dikonfirmasi', 'Guard Diproses', 'Guard Siap']) {
        const row = Array.from(root.querySelectorAll<HTMLElement>('[role="button"]'))
          .find((candidate) => candidate.textContent?.includes(name))
        if (!row) {
          leftovers.set(name, ['(order row not found)'])
          continue
        }
        await click(row)
        record(`${who} › Detail pesanan › ${name}`)
        // Open each step dialog this order offers, then check it.
        const dialogs: Array<[string, RegExp, boolean]> = [
          ['Konfirmasi pembayaran', /^Konfirmasi Pembayaran$/, false],
          ['Tolak', /^Tolak$/, false],
          ['Batalkan pesanan', /^Batalkan pesanan$/i, true],
          ['Pengembalian dana', /^Mulai pengembalian dana$/i, true],
        ]
        for (const [dialogName, label, inMenu] of dialogs) {
          if (inMenu) {
            const menu = within(document.body).queryAllByRole('button', { name: /More order actions|Aksi pesanan lainnya/ })[0]
            if (!menu) continue
            await act(async () => { menu.focus(); fireEvent.keyDown(menu, { key: 'Enter' }) })
            await settle()
            const item = within(document.body).queryAllByRole('menuitem').find((entry) => label.test(entry.textContent?.trim() ?? ''))
            if (!item) { await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }) }); continue }
            await click(item)
          } else {
            const button = findButton(label)
            if (!button) continue
            await click(button)
          }
          record(`${who} › Detail pesanan › ${name} › ${dialogName}`)
          const cancel = within(document.body).queryAllByRole('button', { name: /^(Batal|Cancel|Kembali|Back)$/ }).at(-1)
          if (cancel) await click(cancel)
        }
        const close = within(document.body).queryAllByRole('button', { name: /^(Tutup|Close)$/ })[0]
        if (close) await click(close)
        else await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) })
      }
    }
    await checkOrderPanels('owner', container)

    // Refunds are Finance work: check the refund dialog as Finance.
    cleanup()
    useUserStore.getState().setRole('finance')
    const finance = render(<><UiLanguageBridge /><HomePage initialBranch="Kedamaian" /></>)
    const financeNav = within(finance.container).getByRole('navigation', { name: /Primary|Utama/ })
    await click(findButton(/^Pesanan$/, financeNav)!)
    await checkOrderPanels('finance', finance.container)

    const report = [...leftovers].map(([screen, words]) => `${screen}\n  - ${words.join('\n  - ')}`).join('\n')
    expect(report).toBe('')
    // Every step dialog was really opened and checked.
    expect(opened).toEqual(expect.arrayContaining([
      'owner › Detail pesanan › Guard Storefront › Tolak',
      'owner › Detail pesanan › Guard Dikonfirmasi › Konfirmasi pembayaran',
      'owner › Detail pesanan › Guard Dikonfirmasi › Batalkan pesanan',
      'finance › Detail pesanan › Guard Diproses › Pengembalian dana',
    ]))
  })
})
