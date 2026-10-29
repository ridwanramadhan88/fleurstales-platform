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
  await details.getByRole('button', { name: /Tandai Siap/ }).click()
  const photo = page.getByRole('dialog', { name: /Foto pesanan selesai/ })
  await photo.locator('input[type="file"]').last().setInputFiles('e2e/assets/finish-photo.jpg')
  await photo.getByRole('button', { name: 'Gunakan foto ini' }).click()
  await expect(photo).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /Pesanan siap/ })).toBeVisible()

  details = await openOrder(page, customerName)
  await details.getByRole('button', { name: 'Selesaikan pengambilan' }).click()
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
  await page.getByRole('button', { name: /Menunggu tinjauan/ }).first().click().catch(() => undefined)
  const row = page.locator('main').getByText(customerName, { exact: true }).locator('xpath=ancestor::*[.//button[contains(., "Tinjau pembayaran")]][1]')
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: /Tinjau pembayaran/ }).click()

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

  // After a reload the server copy shows the order as reconciled with its code.
  await page.reload()
  await page.getByRole('navigation').first().getByRole('button', { name: 'Keuangan', exact: true }).click()
  await page.getByRole('button', { name: /Sudah direkonsiliasi/ }).first().click()
  const reconciled = page.locator('main').getByText(customerName, { exact: true }).locator('xpath=ancestor::*[.//*[contains(., "Referensi")]][1]')
  await expect(reconciled).toContainText(reference)
  await expectNoEnglish(page, 'reconciled list')
})
