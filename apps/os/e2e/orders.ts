import { expect, englishLines, type Page } from './fixtures'

export const expectNoEnglish = async (page: Page, where: string) => {
  expect(await englishLines(page), `English UI text in ${where}`).toEqual([])
}

/** Unique enough per run so earlier runs never collide. */
export const uniqueSuffix = () => Date.now().toString().slice(-8)

export const createCashPickupOrder = async (page: Page, customerName: string, whatsapp: string) => {
  await page.getByRole('navigation').first().getByText('Pesanan', { exact: true }).click()
  await page.getByRole('button', { name: /Pesanan baru/ }).first().click()
  const form = page.getByRole('dialog', { name: 'Pesanan baru' })
  await form.getByRole('textbox', { name: 'Nama*' }).fill(customerName)
  await form.getByRole('textbox', { name: 'WhatsApp*' }).fill(whatsapp)
  await form.getByRole('combobox', { name: 'Pilih produk dari katalog' }).click()
  await page.getByRole('option', { name: /^Pink Lily/ }).click()
  await form.getByRole('group', { name: 'Sumber pesanan' }).getByRole('button', { name: 'WhatsApp' }).click()
  await form.getByRole('group', { name: 'Pemenuhan' }).getByRole('button', { name: 'Pengambilan di Toko' }).click()
  await form.getByRole('button', { name: 'Tanggal pengambilan' }).click()
  await page.getByRole('button', { name: 'Bulan berikutnya' }).click()
  // Days 10–24 never repeat in the previous/next-month filler cells, and
  // spreading runs over days keeps earlier runs from exhausting a slot.
  await page.getByRole('gridcell', { name: String(10 + (Date.now() % 15)), exact: true }).click()
  await form.getByRole('button', { name: 'Waktu pengambilan' }).click()
  await page.getByRole('listbox', { name: 'Waktu' }).getByRole('option').first().click()
  await form.getByRole('combobox', { name: 'Metode pembayaran' }).click()
  await page.getByRole('option', { name: 'Tunai' }).click()
  await expectNoEnglish(page, 'new order form')
  await form.getByRole('button', { name: /Tinjau Pesanan/ }).click()
  await expect(form.getByRole('heading', { name: 'Tinjau Pesanan' })).toBeVisible()
  await expectNoEnglish(page, 'order review')
  await form.getByRole('button', { name: /Konfirmasi & buat/ }).click()
  await expect(form).toHaveCount(0)
}

/** Opens an order's detail dialog from a fresh Orders page. */
export const openOrder = async (page: Page, customerName: string) => {
  await page.reload()
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await page.getByRole('navigation').first().getByText('Pesanan', { exact: true }).click()
  await page.getByRole('tab', { name: /Mendatang/ }).click().catch(() => undefined)
  await page.getByRole('button', { name: new RegExp(customerName) }).first().click()
  const details = page.getByRole('dialog', { name: /Detail pesanan/ }).first()
  await expect(details).toBeVisible()
  return details
}

export const confirmCashPayment = async (page: Page, details: ReturnType<Page['getByRole']>) => {
  await details.getByRole('button', { name: /Konfirmasi pembayaran/i }).click()
  const payment = page.getByRole('dialog', { name: 'Konfirmasi Pembayaran' })
  await expect(payment).toContainText('Tunai')
  await expectNoEnglish(page, 'payment confirmation')
  await payment.getByRole('button', { name: 'Konfirmasi Lunas' }).click()
  await expect(payment).toHaveCount(0)
  await expect(details.getByRole('button', { name: /Tugaskan & mulai/ })).toBeVisible()
}

export const assignFloristAndStart = async (page: Page, details: ReturnType<Page['getByRole']>) => {
  await details.getByRole('button', { name: /Tugaskan & mulai/ }).click()
  const assign = page.getByRole('dialog', { name: 'Proses Pesanan' })
  await expect(assign).toContainText('Pembayaran dikonfirmasi')
  const showAll = assign.getByRole('button', { name: /Tampilkan semua Perangkai Bunga/ })
  if (await showAll.count()) await showAll.click()
  await assign.getByText('E2E Florist', { exact: true }).click()
  await assign.getByRole('button', { name: 'Mulai Proses' }).click()
  const keepAssigning = page.getByRole('button', { name: 'Tetap tugaskan' })
  if (await keepAssigning.count()) await keepAssigning.click()
  await expect(assign).toHaveCount(0)
  await expect(details).toContainText('Diproses')
}

/** Every toast currently on screen (title + description). */
export const visibleToasts = (page: Page) =>
  page.locator('[role="region"] ol > li').allInnerTexts()
