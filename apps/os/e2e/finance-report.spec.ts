import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { test, expect, signIn, type Page } from './fixtures'
import { expectNoEnglish } from './orders'

/**
 * Laporan Keuangan in the company's LK layout: Finance opens it under
 * Keuangan → Laporan, the Owner under Pendapatan. Both download the workbook.
 */

const currentMonthLabel = (): string =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', month: 'long', year: 'numeric' }).format(new Date())

const downloadAndCheck = async (page: Page, panel: ReturnType<Page['getByTestId']>) => {
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Unduh Excel' }).click()
  const file = await download
  await file.saveAs(test.info().outputPath(file.suggestedFilename()))
  expect(file.suggestedFilename()).toMatch(/^LK_[A-Z][a-z]+_\d{4}\.xlsx$/)
  const files = unzipSync(new Uint8Array(readFileSync((await file.path())!)))
  const workbook = strFromU8(files['xl/workbook.xml'])
  for (const name of ['PNL', 'SR HO', 'SR Flambo', 'EXP HO', 'EXP Flambo', 'Catatan']) expect(workbook).toContain(`name="${name}"`)
  expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('LAPORAN LABA RUGI')
}

const pickCurrentMonth = async (panel: ReturnType<Page['getByTestId']>) => {
  const label = currentMonthLabel()
  await panel.getByLabel('Bulan laporan').selectOption({ label: label.charAt(0).toUpperCase() + label.slice(1) })
  await expect(panel.getByRole('table', { name: 'Ringkasan laba rugi' })).toBeVisible()
}

test('finance downloads the monthly LK report', async ({ page, problems }) => {
  void problems
  await signIn(page, 'finance')
  await page.getByRole('navigation').first().getByRole('button', { name: 'Keuangan', exact: true }).click()
  await page.getByRole('button', { name: /^Laporan/ }).first().click()
  const panel = page.getByTestId('finance-lk-report')
  await pickCurrentMonth(panel)
  const table = panel.getByRole('table', { name: 'Ringkasan laba rugi' })
  await expect(table).toContainText('Fleurstales')
  await expect(table).toContainText('Fleurstation')
  await expect(table).toContainText('PENDAPATAN BERSIH')
  await expect(table).toContainText('LABA BERSIH')
  await expectNoEnglish(page, 'finance report')
  await page.screenshot({ path: test.info().outputPath('finance-report.png') })
  await downloadAndCheck(page, panel)
})

test('owner sees and downloads the LK report from Revenue', async ({ page, problems }) => {
  void problems
  await signIn(page, 'owner')
  await page.getByRole('navigation').first().getByRole('button', { name: 'Pendapatan', exact: true }).click()
  const panel = page.getByTestId('finance-lk-report')
  await expect(panel.getByRole('heading', { name: 'Laporan Keuangan' })).toBeVisible()
  await pickCurrentMonth(panel)
  await expectNoEnglish(page, 'owner report')
  await downloadAndCheck(page, panel)
})
