import { test, expect, signIn, englishLines } from './fixtures'

/**
 * Static QRIS per branch (Owner request 6 Nov 2026): Owner uploads a square
 * image for a branch and links it to a bank account. Non-square images are
 * rejected. Checkout behaviour is covered by branch_qris_smoke.sql and the
 * storefront unit tests.
 */

const SQUARE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR4nO3QMQ0AAAjAsPk3DTI46JIZaNWcPsdFgAABAgQIECBAgAABAgQIvBdYlEH2iEbFLs4AAAAASUVORK5CYII=', 'base64')
const WIDE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/Rn+7AAAAMklEQVR4nO3QgQkAAAiAMP9/us6wQMEHBjCnn+OhCyWYoC2UYIK2UIIJ2kIJJmgLfRdcnjvImhG2dCEAAAAASUVORK5CYII=', 'base64')

test('owner uploads a square QRIS for a branch; a non-square image is rejected', async ({ page, problems }) => {
  void problems
  await signIn(page, 'owner')
  await page.getByRole('navigation').first().locator('a:visible, button:visible').filter({ hasText: /^Pengaturan$/ }).first().click()
  await page.locator('main button:visible, main a:visible').filter({ hasText: /^Keuangan/ }).first().click()
  const kedamaian = page.getByTestId('branch-qris-Kedamaian')
  await expect(kedamaian).toBeVisible()

  await kedamaian.getByLabel('Gambar QRIS Kedamaian').setInputFiles({ name: 'lebar.png', mimeType: 'image/png', buffer: WIDE_PNG })
  await expect(kedamaian.getByRole('alert')).toHaveText('Gambar QRIS harus persegi (1:1).')

  await kedamaian.getByLabel('Gambar QRIS Kedamaian').setInputFiles({ name: 'qris.png', mimeType: 'image/png', buffer: SQUARE_PNG })
  await expect(kedamaian.getByRole('status')).toHaveText('QRIS tersimpan.')
  await expect(kedamaian.getByText('Aktif', { exact: true })).toBeVisible()
  await expect(kedamaian.getByRole('img', { name: 'QRIS Kedamaian' })).toBeVisible()

  // Survives a reload (stored on the server, not in the browser).
  await page.reload()
  await page.getByRole('navigation').first().locator('a:visible, button:visible').filter({ hasText: /^Pengaturan$/ }).first().click()
  await page.locator('main button:visible, main a:visible').filter({ hasText: /^Keuangan/ }).first().click()
  await expect(page.getByTestId('branch-qris-Kedamaian').getByRole('img', { name: 'QRIS Kedamaian' })).toBeVisible()
  expect(await englishLines(page)).toEqual([])

  // Clean up so reruns start from "no QRIS".
  await page.getByTestId('branch-qris-Kedamaian').getByRole('button', { name: 'Hapus' }).click()
  await expect(page.getByTestId('branch-qris-Kedamaian').getByRole('status')).toHaveText('QRIS dihapus.')
})
