import { test, expect, signIn, englishLines, type Page } from './fixtures'

/**
 * QRIS per branch (25 Nov 2026): the Owner uploads the branch's static QRIS
 * only so the browser can read the QR text; the server keeps it private and
 * the image is not stored. An image without a QR is rejected, and QRIS
 * cannot be turned on until the amount-embedded QR is released. Checkout
 * behaviour is covered by branch_qris_smoke.sql and the storefront unit tests.
 */

// Synthetic static QRIS (NMID ID1000000000001), same payload as branch_qris_smoke.sql.
const STATIC_QRIS_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAVYAAAFWAQAAAAAa1IguAAADMElEQVR42u1bQW7jQAyjKwM9yj/Yp0yerjylP5gcCyjgHqixu4cF9rpRDCNIW10sayiKVDfiX6/nB/79ese+Y9+x/38sSCHEICM9gAEPmyM9bA4jbQKAkfnqeTCSemTS5gBGYqSTEzZhcyjm9fOgh53DSHgYaQwqIR7KzKvn4Yp9Hnfgjsctcc/HDR42sQPZDEt2jwTggcdtO7A/bsKNPjgpfOAEnJwABicSI4HEYAt8+ADw3LbtwI5hX7cdwyZ2jM+Jzzk+J3bct23rUA+60kP90X7WhoedAa/fL4b6BTwSQ0dD3yszjBZ5YKyb6UEygQREq8SvOuRBD25kOhNFqODkHCIPohavn4c50iOdRpKxaCTgJAPepR5EmRIwIYN4NQZJTqgqrMe50NEAYBNVGxNwwgNAl3rAsAnOAb96B+cQcgoreuAD4DTWq09UJZxdgz36pig0PMhQbQCwOXRGesybwodAKTBMD04Yw+b1pyb4IHBIQO8dHpzj/GXhRo88XK3hPCzi2MUu2IM/8KqH6hooWJjD2AUnbUJDpeohAaOaxcDVMhr0Cy/J+mJQNWWEktOAT34AsK+b9PnPr9uO+/cxOIHH9jywHTASuGcH/2LRyB93tU5b6oT1wEnVw5+aZEiKqU7ahFeLS0tqmABQkyajBz4UVSBDNWCMdLk5UeMnRh/9QbKkuLRgQaRCWWrSLxLYPbZf8X1gf2wJ5ONmE8+jgr6PFv2ixChSmi2ACxZ0WHrgg+YLwUK5/06bSKfEfOvhX8jFE4tILzpR49UEMLLN/sN544cyqYmbbfYfpFHL7V1D1vnj0MTR41wspQUD5XIuTFiI0US3lyyZy9MUbIpW9ZkvxJ9T8FiqS5zOBTzY41yUrXlZmVGf1MTRZr5Y7JplZl2ThRASbfys9dKFBrUWZRPkWg5p42+qXZJrFcTD1j5Mm3oAMOrL0qYSWNp1Fz/rZFD6lB6VHqc0hzZ+1kkShJaoVKgY0Gfe1GI5ALmZWeNnDVzVVnrkAZe1vRCy9gG67D/YMjGLPTJq4naKUQhFm/QL035gyQ5jLUKMc4nupfOwvf9P7R37jn3H/uX6DZE8R2SVWSwyAAAAAElFTkSuQmCC', 'base64')
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR4nO3QMQ0AAAjAsPk3DTI46JIZaNWcPsdFgAABAgQIECBAgAABAgQIvBdYlEH2iEbFLs4AAAAASUVORK5CYII=', 'base64')

const openPaymentSettings = async (page: Page) => {
  await page.getByRole('navigation').first().locator('a:visible, button:visible').filter({ hasText: /^Pengaturan$/ }).first().click()
  await page.locator('main button:visible, main a:visible').filter({ hasText: /^Keuangan/ }).first().click()
}

test('owner saves a branch static QRIS from its image; it stays off until the amount-embedded QR ships', async ({ page, problems }) => {
  void problems
  await signIn(page, 'owner')
  await openPaymentSettings(page)
  const kedamaian = page.getByTestId('branch-qris-Kedamaian')
  await expect(kedamaian).toBeVisible()

  await kedamaian.getByLabel('QRIS statis Kedamaian').setInputFiles({ name: 'kosong.png', mimeType: 'image/png', buffer: BLANK_PNG })
  await expect(kedamaian.getByRole('alert')).toHaveText('QR tidak ditemukan di gambar ini. Gunakan gambar QRIS yang jelas dan tidak terpotong.')

  await kedamaian.getByLabel('QRIS statis Kedamaian').setInputFiles({ name: 'qris.png', mimeType: 'image/png', buffer: STATIC_QRIS_PNG })
  await expect(kedamaian.getByRole('status')).toHaveText('QRIS terbaca dan tersimpan.')
  const details = page.getByTestId('branch-qris-details-Kedamaian')
  await expect(details).toContainText('SMOKE FLORIST A')
  await expect(details).toContainText('ID1000000000001')
  await expect(details).toContainText('Usaha mikro (UMI)')
  await expect(kedamaian.getByText('Nonaktif', { exact: true })).toBeVisible()
  // The synthetic QRIS bank differs from the seeded bank account.
  await expect(page.getByTestId('branch-qris-bank-mismatch-Kedamaian')).toContainText('Bank QRIS dan bank rekening ini berbeda.')
  await expect(kedamaian.getByRole('img')).toHaveCount(0)

  // Turning it on before the amount-embedded QR ships is refused by the server
  // (QRIS_DYNAMIC_NOT_READY, covered by supabase/tests/branch_qris_smoke.sql).

  // Services Fee: adjustable, shown under the QRIS settings.
  const fee = page.getByTestId('qris-services-fee-settings')
  await expect(page.getByTestId('qris-services-fee-summary')).toHaveText('Pesanan di bawah Rp500.000: Rp1.000. Mulai Rp500.000: Rp2.000. Dihitung dari total pesanan sebelum potongan kode unik.')
  await fee.getByLabel('Biaya mulai batas', { exact: true }).fill('2500')
  await fee.getByRole('button', { name: 'Simpan Services Fee' }).click()
  await expect(fee.getByRole('status')).toHaveText('Services Fee tersimpan.')

  // Survives a reload (stored on the server, not in the browser).
  await page.reload()
  await openPaymentSettings(page)
  await expect(page.getByTestId('branch-qris-details-Kedamaian')).toContainText('ID1000000000001')
  await expect(page.getByTestId('qris-services-fee-summary')).toContainText('Mulai Rp500.000: Rp2.500.')
  expect(await englishLines(page)).toEqual([])
  // Restore the default fee for other runs.
  await page.getByTestId('qris-services-fee-settings').getByLabel('Biaya mulai batas', { exact: true }).fill('2000')
  await page.getByTestId('qris-services-fee-settings').getByRole('button', { name: 'Simpan Services Fee' }).click()
  await expect(page.getByTestId('qris-services-fee-settings').getByRole('status')).toHaveText('Services Fee tersimpan.')

  // Clean up so reruns start from "no QRIS".
  await page.getByTestId('branch-qris-Kedamaian').getByRole('button', { name: 'Hapus' }).click()
  await expect(page.getByTestId('branch-qris-Kedamaian').getByRole('status')).toHaveText('QRIS dihapus.')
})
