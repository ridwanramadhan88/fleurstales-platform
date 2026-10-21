import { test, expect, signIn, signOut, type Page } from './fixtures'
import { assignFloristAndStart, confirmCashPayment, createCashPickupOrder, expectNoEnglish, openOrder, uniqueSuffix, visibleToasts } from './orders'

/**
 * Refund authority (2026-10-22): Finance and Owner start refunds on any paid
 * order, cancelling a paid order queues its refund automatically, and only
 * Finance completes a refund from the account the money leaves.
 */

const createPaidOrder = async (page: Page, customerName: string, startProduction: boolean) => {
  await signIn(page, 'admin')
  await createCashPickupOrder(page, customerName, `0815${uniqueSuffix()}`)
  const details = await openOrder(page, customerName)
  await confirmCashPayment(page, details)
  if (startProduction) await assignFloristAndStart(page, details)
  await signOut(page)
}

const startRefundFromOrder = async (page: Page, customerName: string) => {
  const details = await openOrder(page, customerName)
  await details.locator('button[aria-haspopup="menu"]').first().click()
  await page.getByRole('menuitem', { name: /Mulai pengembalian dana/ }).click()
  const dialog = page.getByRole('dialog', { name: /Mulai pengembalian dana penuh/ })
  await dialog.locator('textarea').fill('Pelanggan membatalkan pesanan (uji E2E).')
  await expectNoEnglish(page, 'start refund dialog')
  await dialog.getByRole('button', { name: 'Mulai pengembalian dana' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => visibleToasts(page)).not.toContainEqual(expect.stringMatching(/tidak tersimpan/i))
}

const completeRefundAsFinance = async (page: Page, customerName: string) => {
  await signIn(page, 'finance')
  await page.getByRole('navigation').first().getByRole('button', { name: 'Keuangan', exact: true }).click()
  await page.getByRole('tab', { name: /Pengembalian dana/ }).first().click()
  const card = page.locator('main article').filter({ hasText: customerName })
  await expect(card).toBeVisible()
  await expectNoEnglish(page, 'refund queue')
  await card.getByRole('button', { name: /Selesaikan|Complete/ }).first().click()
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).last()
  await confirm.getByRole('combobox', { name: 'Dibayar dari akun' }).selectOption({ label: 'Tunai' })
  await expectNoEnglish(page, 'complete refund dialog')
  await confirm.getByRole('button', { name: /Selesaikan Pengembalian dana/ }).click()
  await expect(confirm).toHaveCount(0)
  await expect.poll(() => visibleToasts(page)).toContainEqual(expect.stringContaining('dikembalikan'))
}

test('finance starts a refund on an active paid order and completes it', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Refund Keuangan ${uniqueSuffix()}`
  await createPaidOrder(page, customerName, true)

  await test.step('finance starts the refund from the order (regression: FINANCE_GENERAL_ORDERS_READ_ONLY)', async () => {
    await signIn(page, 'finance')
    await startRefundFromOrder(page, customerName)
    await signOut(page)
  })

  await test.step('finance completes the refund from the refund queue', async () => {
    await completeRefundAsFinance(page, customerName)
  })
})

test('owner can start a refund; finance completes it', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Refund Owner ${uniqueSuffix()}`
  await createPaidOrder(page, customerName, false)

  await test.step('owner starts the refund', async () => {
    await signIn(page, 'owner')
    await startRefundFromOrder(page, customerName)
    await signOut(page)
  })

  await test.step('finance completes it', async () => {
    await completeRefundAsFinance(page, customerName)
  })
})

test('cancelling a paid order queues its refund for finance', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Batal Lunas ${uniqueSuffix()}`
  await createPaidOrder(page, customerName, false)

  await test.step('admin cancels the paid order', async () => {
    await signIn(page, 'admin')
    const details = await openOrder(page, customerName)
    await details.locator('button[aria-haspopup="menu"]').first().click()
    await page.getByRole('menuitem', { name: /Batalkan Pesanan/ }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText('antrean pengembalian dana')
    await expectNoEnglish(page, 'cancel paid order dialog')
    await confirm.getByRole('button').filter({ hasText: /Batalkan pesanan/i }).last().click()
    await expect.poll(() => visibleToasts(page)).toContainEqual(expect.stringContaining('antrean pengembalian dana'))
    await signOut(page)
  })

  await test.step('finance completes the queued refund', async () => {
    await completeRefundAsFinance(page, customerName)
  })
})
