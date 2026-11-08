import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { test, expect, signIn } from './fixtures'
import { confirmCashPayment, createCashPickupOrder, expectNoEnglish, openOrder, uniqueSuffix } from './orders'

/**
 * Pesanan → Unduh Excel: every status, a date range, and the "Data pesanan
 * lengkap" / "Data pelanggan lengkap" options.
 */

const downloadOrders = async (page: Parameters<typeof signIn>[0], options: { fullOrder: boolean; fullCustomer: boolean }) => {
  await page.getByRole('button', { name: 'Unduh Excel' }).click()
  const dialog = page.getByRole('dialog', { name: 'Unduh pesanan' })
  await dialog.getByLabel('Dari tanggal').fill('')
  await dialog.getByLabel('Sampai tanggal').fill('')
  await dialog.getByLabel('Status').selectOption({ label: 'Semua status' })
  const fullOrder = dialog.getByRole('checkbox', { name: 'Data pesanan lengkap' })
  const fullCustomer = dialog.getByRole('checkbox', { name: 'Data pelanggan lengkap' })
  if ((await fullOrder.getAttribute('data-state') === 'checked') !== options.fullOrder) await fullOrder.click()
  if ((await fullCustomer.getAttribute('data-state') === 'checked') !== options.fullCustomer) await fullCustomer.click()
  await expect(dialog.getByRole('status')).not.toHaveText('0 pesanan')
  await expectNoEnglish(page, 'orders export dialog')
  await page.screenshot({ path: test.info().outputPath(`orders-export-${options.fullOrder ? 'lengkap' : 'ringkas'}.png`) })
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Unduh', exact: true }).click()
  const file = await download
  await file.saveAs(test.info().outputPath(file.suggestedFilename()))
  const files = unzipSync(new Uint8Array(readFileSync((await file.path())!)))
  return { name: file.suggestedFilename(), workbook: strFromU8(files['xl/workbook.xml']), pesanan: strFromU8(files['xl/worksheets/sheet1.xml']), files }
}

test('admin downloads orders with complete order and customer data', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Unduh ${uniqueSuffix()}`
  await signIn(page, 'admin')
  await createCashPickupOrder(page, customerName, `0816${uniqueSuffix()}`)
  const details = await openOrder(page, customerName)
  await confirmCashPayment(page, details)
  await page.keyboard.press('Escape')

  const complete = await downloadOrders(page, { fullOrder: true, fullCustomer: true })
  expect(complete.name).toMatch(/^Pesanan_.*_semua-tanggal_lengkap\.xlsx$/)
  for (const sheet of ['Pesanan', 'Item', 'Pembayaran', 'Pelanggan', 'Info']) expect(complete.workbook).toContain(`name="${sheet}"`)
  for (const text of [customerName, 'No. pesanan', 'Metode bayar', 'Tunai', 'Verifikasi Finance', 'Email', 'Ulang tahun', 'Total belanja terverifikasi (Rp)']) {
    expect(complete.pesanan).toContain(text)
  }
  expect(strFromU8(complete.files['xl/worksheets/sheet3.xml'])).toContain('Pembayaran diterima')

  const basic = await downloadOrders(page, { fullOrder: false, fullCustomer: false })
  expect(basic.name).toMatch(/^Pesanan_.*_semua-tanggal\.xlsx$/)
  expect(basic.workbook).not.toContain('name="Item"')
  expect(basic.pesanan).toContain(customerName)
  expect(basic.pesanan).not.toContain('Metode bayar')
  expect(basic.pesanan).not.toContain('Ulang tahun')
})
