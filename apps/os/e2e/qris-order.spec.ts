import { test, expect, signIn, signOut, type Page } from './fixtures'
import { expectNoEnglish, openOrder, uniqueSuffix } from './orders'

/**
 * Amount-embedded QRIS (25 Nov 2026): the Owner saves the branch's static
 * QRIS and turns QRIS on; Admin creates an order paid by QRIS, opens its
 * "QR pembayaran" (the order's own QR with the exact amount), downloads the
 * QRIS image and confirms the payment with the unique-code discount.
 */

// Synthetic static QRIS (NMID ID1000000000001), same payload as branch_qris_smoke.sql.
const STATIC_QRIS_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAVYAAAFWAQAAAAAa1IguAAADMElEQVR42u1bQW7jQAyjKwM9yj/Yp0yerjylP5gcCyjgHqixu4cF9rpRDCNIW10sayiKVDfiX6/nB/79ese+Y9+x/38sSCHEICM9gAEPmyM9bA4jbQKAkfnqeTCSemTS5gBGYqSTEzZhcyjm9fOgh53DSHgYaQwqIR7KzKvn4Yp9Hnfgjsctcc/HDR42sQPZDEt2jwTggcdtO7A/bsKNPjgpfOAEnJwABicSI4HEYAt8+ADw3LbtwI5hX7cdwyZ2jM+Jzzk+J3bct23rUA+60kP90X7WhoedAa/fL4b6BTwSQ0dD3yszjBZ5YKyb6UEygQREq8SvOuRBD25kOhNFqODkHCIPohavn4c50iOdRpKxaCTgJAPepR5EmRIwIYN4NQZJTqgqrMe50NEAYBNVGxNwwgNAl3rAsAnOAb96B+cQcgoreuAD4DTWq09UJZxdgz36pig0PMhQbQCwOXRGesybwodAKTBMD04Yw+b1pyb4IHBIQO8dHpzj/GXhRo88XK3hPCzi2MUu2IM/8KqH6hooWJjD2AUnbUJDpeohAaOaxcDVMhr0Cy/J+mJQNWWEktOAT34AsK+b9PnPr9uO+/cxOIHH9jywHTASuGcH/2LRyB93tU5b6oT1wEnVw5+aZEiKqU7ahFeLS0tqmABQkyajBz4UVSBDNWCMdLk5UeMnRh/9QbKkuLRgQaRCWWrSLxLYPbZf8X1gf2wJ5ONmE8+jgr6PFv2ixChSmi2ACxZ0WHrgg+YLwUK5/06bSKfEfOvhX8jFE4tILzpR49UEMLLN/sN544cyqYmbbfYfpFHL7V1D1vnj0MTR41wspQUD5XIuTFiI0US3lyyZy9MUbIpW9ZkvxJ9T8FiqS5zOBTzY41yUrXlZmVGf1MTRZr5Y7JplZl2ThRASbfys9dKFBrUWZRPkWg5p42+qXZJrFcTD1j5Mm3oAMOrL0qYSWNp1Fz/rZFD6lB6VHqc0hzZ+1kkShJaoVKgY0Gfe1GI5ALmZWeNnDVzVVnrkAZe1vRCy9gG67D/YMjGLPTJq4naKUQhFm/QL035gyQ5jLUKMc4nupfOwvf9P7R37jn3H/uX6DZE8R2SVWSwyAAAAAElFTkSuQmCC', 'base64')

const openPaymentSettings = async (page: Page) => {
  await page.getByRole('navigation').first().locator('a:visible, button:visible').filter({ hasText: /^Pengaturan$/ }).first().click()
  await page.locator('main button:visible, main a:visible').filter({ hasText: /^Keuangan/ }).first().click()
}

test('admin creates a QRIS order, downloads its QR with the exact amount and confirms the payment', async ({ page, problems }) => {
  void problems
  const customerName = `E2E QRIS ${uniqueSuffix()}`

  // Owner: QRIS source for Kedamaian, switched on.
  await signIn(page, 'owner')
  await openPaymentSettings(page)
  const kedamaian = page.getByTestId('branch-qris-Kedamaian')
  await kedamaian.getByLabel('QRIS statis Kedamaian').setInputFiles({ name: 'qris.png', mimeType: 'image/png', buffer: STATIC_QRIS_PNG })
  await expect(kedamaian.getByRole('status')).toHaveText('QRIS terbaca dan tersimpan.')
  await kedamaian.getByRole('button', { name: 'Aktifkan' }).click()
  await expect(kedamaian.getByText('Aktif', { exact: true })).toBeVisible()
  await signOut(page)

  // Admin: new pickup order paid by transfer with QRIS.
  await signIn(page, 'admin')
  await page.getByRole('navigation').first().getByText('Pesanan', { exact: true }).click()
  await page.getByRole('button', { name: /Pesanan baru/ }).first().click()
  const form = page.getByRole('dialog', { name: 'Pesanan baru' })
  await form.getByRole('textbox', { name: 'Nama*' }).fill(customerName)
  await form.getByRole('textbox', { name: 'WhatsApp*' }).fill(`0819${uniqueSuffix()}`)
  await form.getByRole('combobox', { name: 'Pilih produk dari katalog' }).click()
  await page.getByRole('option', { name: /^Pink Lily/ }).click()
  await form.getByRole('group', { name: 'Sumber pesanan' }).getByRole('button', { name: 'WhatsApp' }).click()
  await form.getByRole('group', { name: 'Pemenuhan' }).getByRole('button', { name: 'Ambil di toko' }).click()
  await form.getByRole('button', { name: 'Tanggal pengambilan' }).click()
  await page.getByRole('button', { name: 'Bulan berikutnya' }).click()
  await page.getByRole('gridcell', { name: String(10 + (Date.now() % 15)), exact: true }).click()
  await form.getByRole('button', { name: 'Waktu pengambilan' }).click()
  await page.getByRole('listbox', { name: 'Waktu' }).getByRole('option').first().click()
  await form.getByRole('combobox', { name: 'Metode pembayaran' }).click()
  await page.getByRole('option', { name: 'Transfer Bank' }).click()
  await form.getByLabel('Bayar dengan QRIS (QR bernominal)').check()
  await form.getByRole('button', { name: /Tinjau Pesanan/ }).click()
  await expect(form.getByRole('heading', { name: 'Tinjau Pesanan' })).toBeVisible()
  await expect(form).toContainText('QRIS')
  await form.getByRole('button', { name: /Konfirmasi & buat/ }).click()
  await expect(form).toHaveCount(0)

  // The order's own QR with the exact amount.
  const details = await openOrder(page, customerName)
  const orderNumber = (await details.innerText()).match(/KDM-\d{2}-\d{2}-\d{2}-\d{3}/)?.[0]
  expect(orderNumber, 'daily order number').toBeTruthy()
  await details.getByRole('button', { name: 'QR pembayaran' }).click()
  const qr = page.getByTestId('order-qris-payment')
  await expect(qr.getByRole('img', { name: /^QRIS Rp/ }).locator('svg')).toBeVisible()
  const code = orderNumber!.slice(-3)
  // The amount ends in the order's 3-digit daily code.
  await expect(qr.getByText(new RegExp(`^Rp[\\d.]*${code}$`)).first()).toBeVisible()
  await expect(qr).toContainText('Potongan kode unik')
  await expect(qr).toContainText('ID1000000000001')
  await expectNoEnglish(page, 'QRIS payment QR')

  const downloadPromise = page.waitForEvent('download')
  await qr.getByRole('button', { name: 'Unduh QR' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(`QRIS-${orderNumber}.png`)
  await download.saveAs(test.info().outputPath('qris-card.png'))
  await page.keyboard.press('Escape')

  // Confirming payment shows the QRIS amount to match in Livin' Merchant.
  const reopened = await openOrder(page, customerName)
  await reopened.getByRole('button', { name: /Konfirmasi pembayaran/i }).click()
  const payment = page.getByRole('dialog', { name: 'Konfirmasi Pembayaran' })
  await expect(payment.getByTestId('payment-gate-qris-amount')).toContainText('Nominal QRIS')
  await page.keyboard.press('Escape')
  await signOut(page)

  // Clean up so reruns start from "no QRIS".
  await signIn(page, 'owner')
  await openPaymentSettings(page)
  await page.getByTestId('branch-qris-Kedamaian').getByRole('button', { name: 'Hapus' }).click()
  await expect(page.getByTestId('branch-qris-Kedamaian').getByRole('status')).toHaveText('QRIS dihapus.')
})
