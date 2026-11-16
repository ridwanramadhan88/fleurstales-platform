import { test, expect, signIn, signOut, type Page } from './fixtures'
import { assignFloristAndStart, confirmCashPayment, createCashPickupOrder, expectNoEnglish, openOrder, uniqueSuffix, visibleToasts } from './orders'

/**
 * Finance reconciliation must go through the audited server RPCs
 * (save_order_finance_reference + decide_order_finance_reconciliation).
 * Regression 2026-10-29: the production (Supabase-only) build took the local
 * demo path, dropping the reconciliation code and the audit activity.
 */

const finishPickupOrder = async (page: Page, customerName: string) => {
  await signIn(page, 'admin')
  await createCashPickupOrder(page, customerName, `0817${uniqueSuffix()}`)
  let details = await openOrder(page, customerName)
  await confirmCashPayment(page, details)
  await assignFloristAndStart(page, details)

  // Ready needs the finished-order photo first.
  details = await openOrder(page, customerName)
  await details.getByRole('button', { name: /Tandai siap/i }).click()
  const photo = page.getByRole('dialog', { name: /Foto pesanan selesai/ })
  await photo.locator('input[type="file"]').last().setInputFiles('e2e/assets/finish-photo.jpg')
  await photo.getByRole('button', { name: 'Gunakan foto ini' }).click()
  await expect(photo).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /Pesanan siap/ })).toBeVisible()

  details = await openOrder(page, customerName)
  await details.getByRole('button', { name: 'Sudah diambil' }).click()
  await expect(page.getByRole('dialog', { name: /Pesanan selesai/ })).toBeVisible()
  await expectNoEnglish(page, 'review request dialog')
  await signOut(page)
}

test('finance reconciles a picked-up order through the server with its reference code', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Rekonsiliasi ${uniqueSuffix()}`
  const reference = `E2E-${uniqueSuffix()}`
  await finishPickupOrder(page, customerName)

  await signIn(page, 'finance')
  await page.getByRole('navigation').first().getByRole('button', { name: 'Keuangan', exact: true }).click()
  // Finance lands on Tugas; tapping the payment opens its review with the evidence.
  const toReconcile = page.getByRole('region', { name: 'Pembayaran untuk dicocokkan' })
  const row = toReconcile.getByRole('button', { name: new RegExp(customerName) })
  await expect(row).toBeVisible()
  await expectNoEnglish(page, 'finance tasks')
  await row.click()

  const review = page.getByRole('dialog').last()
  await review.getByRole('button', { name: 'Rekonsiliasi Pesanan' }).click()
  const confirm = page.getByRole('dialog').last()
  await confirm.locator('input,textarea').first().fill(reference)
  await expectNoEnglish(page, 'reconciliation dialog')

  const referenceRpc = page.waitForResponse((r) => r.url().includes('/rpc/save_order_finance_reference') && r.ok())
  const decisionRpc = page.waitForResponse((r) => r.url().includes('/rpc/decide_order_finance_reconciliation') && r.ok())
  await confirm.getByRole('button', { name: 'Simpan & Rekonsiliasi' }).click()
  await referenceRpc
  const decision = await (await decisionRpc).json() as { financeVerified?: boolean }
  expect(decision.financeVerified).toBe(true)
  await expect.poll(() => visibleToasts(page)).not.toContainEqual(expect.stringMatching(/tidak direkonsiliasi/i))

  // After a reload the order has left Tugas, and its ledger row carries the code.
  await page.reload()
  await page.getByRole('navigation').first().getByRole('button', { name: 'Keuangan', exact: true }).click()
  await expect(page.locator('main').getByText(customerName)).toHaveCount(0)
  await page.getByRole('tablist', { name: 'Keuangan' }).getByRole('tab', { name: 'Kas & Transaksi' }).click()
  await page.locator('input[type="search"]:visible').first().fill(reference)
  const ledgerRow = page.getByRole('list', { name: 'Buku kas' }).getByRole('button').first()
  await expect(ledgerRow).toBeVisible()
  await expectNoEnglish(page, 'reconciled ledger row')
  await ledgerRow.click()
  await expect(page.getByRole('dialog').last()).toContainText(reference)
})
