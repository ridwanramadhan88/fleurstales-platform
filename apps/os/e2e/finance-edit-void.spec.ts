import { test, expect, signIn, signOut, type Page } from './fixtures'
import { confirmCashPayment, createCashPickupOrder, expectNoEnglish, openOrder, uniqueSuffix } from './orders'

/**
 * Finance edits and voids every ledger row (Owner decision 2026-11-07):
 * editing an order payment changes the order's paid amount, voiding it cancels
 * the order. Both go through the audited server RPCs.
 */

const ledgerRow = (page: Page, orderNumber: string) =>
  page.getByRole('list', { name: 'Buku kas' }).getByRole('button').filter({ hasText: orderNumber }).first()

const openTransactions = async (page: Page, orderNumber: string) => {
  await page.getByRole('navigation').first().getByRole('button', { name: 'Keuangan', exact: true }).click()
  await page.getByRole('navigation', { name: 'Keuangan' }).getByRole('button', { name: 'Kas & Transaksi' }).click()
  await page.locator('input[type="search"]:visible').first().fill(orderNumber)
  const row = ledgerRow(page, orderNumber)
  await expect(row).toBeVisible()
  return row
}

/** Opens a ledger row's detail sheet. */
const openDetail = async (page: Page, orderNumber: string) => {
  await ledgerRow(page, orderNumber).click()
  const sheet = page.getByRole('dialog').last()
  await expect(sheet).toContainText(orderNumber)
  return sheet
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
  await openTransactions(page, orderNumber!)

  // Edit: lower the received amount.
  let sheet = await openDetail(page, orderNumber!)
  await sheet.getByRole('button', { name: /Ubah transaksi/ }).click()
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
  await expect(ledgerRow(page, orderNumber!)).toContainText('50.000')
  await expect(ledgerRow(page, orderNumber!)).toContainText(/Diedit 1×/)

  // Void: the order is cancelled.
  sheet = await openDetail(page, orderNumber!)
  await sheet.getByRole('button', { name: 'Void', exact: true }).click()
  const voidForm = page.getByTestId('finance-void-transaction-form')
  await expect(voidForm).toContainText(`Pesanan ${orderNumber} akan dibatalkan`)
  await voidForm.getByLabel('Alasan void').fill('Pembayaran tidak pernah masuk')
  await expectNoEnglish(page, 'finance void dialog')
  await page.screenshot({ path: test.info().outputPath('void-dialog.png') })
  const voidRpc = page.waitForResponse((r) => r.url().includes('/rpc/void_finance_transaction_guarded'))
  await voidForm.getByRole('button', { name: 'Void transaksi' }).click()
  expect((await voidRpc).ok()).toBe(true)
  await expect(voidForm).toHaveCount(0)
  await expect(ledgerRow(page, orderNumber!)).toContainText('Void')
  await ledgerRow(page, orderNumber!).screenshot({ path: test.info().outputPath('voided-row.png') })

  // The detail keeps the reason, offers no second void, and links the cancelled order.
  sheet = await openDetail(page, orderNumber!)
  await expect(sheet).toContainText('Pembayaran tidak pernah masuk')
  await expect(sheet.getByRole('button', { name: 'Void', exact: true })).toHaveCount(0)
  await sheet.getByRole('button', { name: /Buka pesanan/ }).click()
  const order = page.getByRole('dialog').last()
  await expect(order).toContainText(/Tercatat dibayar\s*Rp 0/)
  await order.getByRole('tab', { name: 'Aktivitas' }).or(order.getByRole('button', { name: 'Aktivitas' })).first().click()
  await expect(order).toContainText(/Dibatalkan\s*Sekarang/)
  await page.screenshot({ path: test.info().outputPath('voided-order.png') })
})
