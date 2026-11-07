import { test, expect, signIn, signOut, type Page } from './fixtures'
import { confirmCashPayment, createCashPickupOrder, expectNoEnglish, openOrder, uniqueSuffix } from './orders'

/**
 * Finance edits and voids every ledger row (Owner decision 2026-11-07):
 * editing an order payment changes the order's paid amount, voiding it cancels
 * the order. Both go through the audited server RPCs.
 */

const openTransactions = async (page: Page, orderNumber: string) => {
  await page.getByRole('navigation').first().getByRole('button', { name: 'Keuangan', exact: true }).click()
  await page.getByRole('button', { name: /^Transaksi/ }).first().click()
  await page.getByRole('textbox', { name: /transaksi/i }).first().fill(orderNumber)
  const row = page.locator('main article').filter({ hasText: orderNumber }).first()
  await expect(row).toBeVisible()
  return row
}

test('finance edits a paid order payment, then voids it and the order is cancelled', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Void ${uniqueSuffix()}`
  await signIn(page, 'admin')
  await createCashPickupOrder(page, customerName, `0818${uniqueSuffix()}`)
  const details = await openOrder(page, customerName)
  await confirmCashPayment(page, details)
  const orderNumber = (await details.innerText()).match(/[A-Z]{3}-\d{4}-\d{4}/)?.[0]
  expect(orderNumber).toBeTruthy()
  await signOut(page)

  await signIn(page, 'finance')
  let row = await openTransactions(page, orderNumber!)

  // Edit: lower the received amount.
  await row.getByRole('button', { name: /Ubah transaksi/ }).click()
  const editor = page.getByTestId('finance-edit-transaction-form')
  await expect(editor).toContainText(`Jumlah dibayar pesanan ${orderNumber} ikut berubah`)
  await editor.getByLabel('Nominal (Rp)').fill('50000')
  await editor.getByLabel('Alasan koreksi').fill('Uang yang diterima kurang')
  await expectNoEnglish(page, 'finance edit dialog')
  await page.screenshot({ path: test.info().outputPath('edit-dialog.png') })
  const editRpc = page.waitForResponse((r) => r.url().includes('/rpc/edit_finance_transaction_v2_guarded'))
  await editor.getByRole('button', { name: 'Simpan koreksi' }).click()
  expect((await editRpc).ok()).toBe(true)
  await expect(editor).toHaveCount(0)
  row = page.locator('main article').filter({ hasText: orderNumber! }).first()
  await expect(row).toContainText('50.000')
  await expect(row).toContainText(/Diedit 1×/)

  // Void: the order is cancelled.
  await row.getByRole('button', { name: /Void transaksi/ }).click()
  const voidForm = page.getByTestId('finance-void-transaction-form')
  await expect(voidForm).toContainText(`Pesanan ${orderNumber} akan dibatalkan`)
  await voidForm.getByLabel('Alasan void').fill('Pembayaran tidak pernah masuk')
  await expectNoEnglish(page, 'finance void dialog')
  await page.screenshot({ path: test.info().outputPath('void-dialog.png') })
  const voidRpc = page.waitForResponse((r) => r.url().includes('/rpc/void_finance_transaction_guarded'))
  await voidForm.getByRole('button', { name: 'Void transaksi' }).click()
  expect((await voidRpc).ok()).toBe(true)
  await expect(voidForm).toHaveCount(0)
  row = page.locator('main article').filter({ hasText: orderNumber! }).first()
  await expect(row.getByTestId('finance-void-note')).toContainText('Pembayaran tidak pernah masuk')
  await expect(row.getByRole('button', { name: /Void transaksi/ })).toHaveCount(0)
  await row.screenshot({ path: test.info().outputPath('voided-row.png') })

  // The linked order is now cancelled.
  await row.getByRole('button', { name: /Buka pesanan/ }).click()
  const order = page.getByRole('dialog').last()
  await expect(order).toContainText(/Tercatat dibayar\s*Rp 0/)
  await order.getByRole('tab', { name: 'Aktivitas' }).or(order.getByRole('button', { name: 'Aktivitas' })).first().click()
  await expect(order).toContainText(/Dibatalkan\s*Sekarang/)
  await page.screenshot({ path: test.info().outputPath('voided-order.png') })
})
