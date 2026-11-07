import { test, expect, signIn } from './fixtures'
import { expectNoEnglish } from './orders'

/**
 * Lembur dari check-out (Owner decision 2026-11-08): the seeded E2E Florist
 * checked out 95 minutes after the shift and chose "Lembur". HR confirms it
 * with an amount, and it lands in the payroll additions without another step.
 * HR can also add fees/allowances/deductions as separate lines.
 */
test('HR approves claimed overtime and it becomes a payroll addition', async ({ page, problems }) => {
  void problems
  await signIn(page, 'hr')
  await page.getByRole('navigation').first().getByRole('button', { name: 'Staf', exact: true }).click()
  const main = page.locator('main')
  await main.getByRole('button', { name: 'Kehadiran', exact: true }).click()

  const reviews = main.getByRole('region', { name: 'Tinjauan kehadiran' })
  const overtimeCase = reviews.locator('article').filter({ hasText: 'E2E Florist' }).filter({ hasText: 'Lembur' }).first()
  await expect(overtimeCase).toContainText('Karyawan mengajukan lembur: check-out 1 jam 35 menit setelah jam shift selesai.')
  await expect(overtimeCase).toContainText('Merangkai pesanan wedding')
  await overtimeCase.getByRole('button', { name: 'Tinjau' }).click()

  const approval = page.getByTestId('overtime-approval')
  await expect(approval.getByLabel('Durasi lembur (menit)')).toHaveValue('95')
  await approval.getByLabel('Durasi lembur (menit)').fill('90')
  await approval.getByLabel('Nominal lembur (Rp)').fill('45000')
  await expectNoEnglish(page, 'overtime approval')
  await page.screenshot({ path: test.info().outputPath('overtime-approval.png') })
  await page.getByRole('button', { name: 'Setujui lembur' }).click()
  await expect(reviews.getByRole('status')).toContainText('Lembur disetujui')

  await reviews.getByRole('button', { name: /^Selesai/ }).first().click()
  await expect(reviews.locator('article').filter({ hasText: 'E2E Florist' }).first()).toContainText('Lembur disetujui · 1 jam 30 menit · Rp 45.000')

  // Payroll: generating the period pulls in the approved overtime.
  await main.getByRole('button', { name: 'Penggajian', exact: true }).click()
  await expect(main).toContainText(/November|Desember|Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober/)
  await main.getByRole('button', { name: /staff payroll|gaji staf|penggajian staf/i }).first().click()
  const row = main.locator('article').filter({ hasText: 'E2E Florist' }).first()
  await expect(row).toContainText('Tambahan Rp45.000')
  await row.getByRole('button', { name: 'Tambahan & potongan' }).click()

  const editor = page.getByTestId('payroll-additions-editor')
  await expect(editor).toContainText('Lembur · 1 jam 30 menit')
  await expect(editor).toContainText('Rp 45.000')
  await editor.getByLabel('Jenis baris').selectOption({ label: 'Fee / komisi' })
  await editor.getByLabel('Nominal baris').fill('150000')
  await editor.getByLabel('Alasan baris').fill('Fee instalasi Hotel X')
  await editor.getByRole('button', { name: 'Tambah', exact: true }).click()
  await expect(editor).toContainText('Fee instalasi Hotel X')
  await expect(editor).toContainText('Rp 195.000')
  // Overtime is removed through attendance review, not here.
  await expect(editor.getByRole('button', { name: 'Hapus Lembur' })).toHaveCount(0)
  await expectNoEnglish(page, 'payroll additions')
  await page.screenshot({ path: test.info().outputPath('payroll-additions.png') })
})
