import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import type { Download } from '@playwright/test'
import { test, expect, signIn } from './fixtures'
import { expectNoEnglish } from './orders'

/**
 * Excel downloads (Owner request 2026-11-08): Pelanggan, Ulasan and the HR
 * monthly attendance report. Pesanan has its own spec (orders-export) and
 * Rekap gaji is checked in payroll-overtime. Column layouts are covered by
 * excelExports.test.ts.
 */

const readWorkbook = async (download: Download) => {
  await download.saveAs(test.info().outputPath(download.suggestedFilename()))
  const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)))
  return { workbook: strFromU8(files['xl/workbook.xml']), sheet1: strFromU8(files['xl/worksheets/sheet1.xml']) }
}

test('admin downloads the customer list and opens the review download', async ({ page, problems }) => {
  void problems
  await signIn(page, 'admin')
  await page.getByRole('navigation').first().getByText('Pelanggan', { exact: true }).click()

  const customersDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Unduh Excel' }).click()
  const customers = await customersDownload
  expect(customers.suggestedFilename()).toMatch(/^Pelanggan_\d{4}-\d{2}-\d{2}\.xlsx$/)
  const customerFile = await readWorkbook(customers)
  for (const sheet of ['Pelanggan', 'Ulang tahun per bulan', 'Info']) expect(customerFile.workbook).toContain(`name="${sheet}"`)
  for (const text of ['Nama', 'WhatsApp', 'Bulan ulang tahun', 'Total belanja terverifikasi (Rp)', 'Jumlah ulasan']) expect(customerFile.sheet1).toContain(text)

  await page.getByRole('button', { name: 'Ulasan Pelanggan', exact: true }).click()
  await page.getByRole('button', { name: 'Unduh Excel' }).click()
  const dialog = page.getByRole('dialog', { name: 'Unduh ulasan' })
  await dialog.getByLabel('Dari tanggal').fill('')
  await dialog.getByLabel('Sampai tanggal').fill('')
  await expect(dialog.getByRole('status')).toHaveText(/^\d+ ulasan$/)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expectNoEnglish(page, 'reviews export dialog')
  await page.screenshot({ path: test.info().outputPath('reviews-export.png') })
  // CI starts without reviews; a local stack may have some.
  const count = Number((await dialog.getByRole('status').textContent())?.match(/\d+/)?.[0] ?? 0)
  if (count > 0) {
    const reviewsDownload = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Unduh', exact: true }).click()
    const reviews = await readWorkbook(await reviewsDownload)
    for (const sheet of ['Ulasan', 'Per pertanyaan', 'Per florist', 'Per cabang', 'Info']) expect(reviews.workbook).toContain(`name="${sheet}"`)
  } else {
    await expect(dialog.getByRole('button', { name: 'Unduh', exact: true })).toBeDisabled()
  }
})

test('HR downloads the monthly attendance report from Kehadiran', async ({ page, problems }) => {
  void problems
  await signIn(page, 'hr')
  await page.getByRole('navigation').first().getByRole('button', { name: 'Staf', exact: true }).click()
  await page.locator('main').getByRole('button', { name: 'Kehadiran', exact: true }).click()
  await page.getByRole('button', { name: 'Unduh Excel' }).click()
  const dialog = page.getByRole('dialog', { name: 'Unduh absensi' })
  await expect(dialog.getByLabel('Bulan')).toHaveValue(/^\d{4}-\d{2}$/)
  await expectNoEnglish(page, 'attendance export dialog')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Unduh', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^Absensi_\d{4}-\d{2}.*\.xlsx$/)
  const { workbook, sheet1 } = await readWorkbook(file)
  for (const sheet of ['Ringkasan', 'Absensi harian', 'Peringatan &amp; lembur', 'Info']) expect(workbook).toContain(`name="${sheet}"`)
  for (const text of ['Nama', 'Hari hadir', 'Lembur disetujui']) expect(sheet1).toContain(text)
})
