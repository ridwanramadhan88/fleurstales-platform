import { test, expect, signIn, signOut, englishLines, type Page } from './fixtures'

const FINISH_PHOTO = 'e2e/assets/finish-photo.jpg'

/**
 * The full cash order lifecycle across roles. This is the flow that hid the
 * "internal cash order cannot be confirmed paid" bug (#145): every step must
 * succeed through the real UI against a real database.
 */

const expectNoEnglish = async (page: Page, where: string) => {
  expect(await englishLines(page), `English UI text in ${where}`).toEqual([])
}

const createCashPickupOrder = async (page: Page, customerName: string, whatsapp: string) => {
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
  // Spread runs over different days so earlier runs never exhaust a slot's capacity.
  const day = String(5 + (Date.now() % 20))
  await page.getByRole('gridcell', { name: day, exact: true }).click()
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

const openOrder = async (page: Page, customerName: string) => {
  await page.getByRole('navigation').first().getByText('Pesanan', { exact: true }).click()
  await page.getByRole('tab', { name: /Mendatang/ }).click().catch(() => undefined)
  await page.getByRole('button', { name: new RegExp(customerName) }).first().click()
  const details = page.getByRole('dialog', { name: /details|detail/i }).first()
  await expect(details).toBeVisible()
  return details
}

test('cash order: admin confirms payment and assigns florist, florist uploads the finish photo', async ({ page, problems }) => {
  const run = Date.now().toString().slice(-8)
  const customerName = `E2E Tunai ${run}`
  const whatsapp = `0812${run}`
  void problems

  await test.step('admin creates a cash pickup order', async () => {
    await signIn(page, 'admin')
    await createCashPickupOrder(page, customerName, whatsapp)
  })

  await test.step('admin confirms the cash payment (regression #145)', async () => {
    const details = await openOrder(page, customerName)
    await details.getByRole('button', { name: /Konfirmasi pembayaran/i }).click()
    const payment = page.getByRole('dialog', { name: 'Konfirmasi Pembayaran' })
    await expect(payment).toContainText('Tunai')
    await expectNoEnglish(page, 'payment confirmation')
    await payment.getByRole('button', { name: 'Konfirmasi Lunas' }).click()
    await expect(payment).toHaveCount(0)
    await expect(details.getByRole('button', { name: /Tugaskan & mulai/ })).toBeVisible()
  })

  await test.step('admin assigns the florist and starts production', async () => {
    const details = page.getByRole('dialog', { name: /details|detail/i }).first()
    await details.getByRole('button', { name: /Tugaskan & mulai/ }).click()
    const assign = page.getByRole('dialog', { name: 'Proses Pesanan' })
    await expect(assign).toContainText('Pembayaran dikonfirmasi')
    const showAll = assign.getByRole('button', { name: /Tampilkan semua Perangkai Bunga/ })
    if (await showAll.count()) await showAll.click()
    await assign.getByText('E2E Florist', { exact: true }).click()
    await assign.getByRole('button', { name: 'Mulai Proses' }).click()
    const outsideSchedule = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /di luar jadwal/i }))
    const keepAssigning = outsideSchedule.getByRole('button', { name: 'Tetap tugaskan' })
    if (await keepAssigning.count()) await keepAssigning.click()
    await expect(assign).toHaveCount(0)
    await expect(details).toContainText('Diproses')
    await expect(details).toContainText('E2E Florist')
  })

  await test.step('florist sees the order and uploads the finish photo', async () => {
    await page.keyboard.press('Escape')
    await signOut(page)
    await signIn(page, 'florist')
    const card = page.locator('main').getByText(customerName).locator('xpath=ancestor::*[.//button][1]')
    await expect(card).toContainText('Diproses')
    await expectNoEnglish(page, 'florist work list')
    await card.getByRole('button', { name: 'Unggah foto hasil' }).click()
    const photo = page.getByRole('dialog', { name: /Foto pesanan selesai/ })
    await photo.locator('input[type="file"]').first().setInputFiles(FINISH_PHOTO)
    await expect(photo.getByRole('button', { name: 'Gunakan foto ini' })).toBeEnabled()
    await expectNoEnglish(page, 'finish photo dialog')
    await photo.getByRole('button', { name: 'Gunakan foto ini' }).click()
    await expect(photo).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Ganti foto hasil' })).toBeVisible()
  })
})
