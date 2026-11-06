import { test, expect, signIn } from './fixtures'
import { uniqueSuffix } from './orders'

/**
 * Vouchers can be a Rupiah discount (Owner request 6 Nov 2026) and the review
 * reward is Rp20.000 (min. order Rp300.000). Server-side discount maths are
 * covered by voucher_amount_review_reward_smoke.sql.
 */

test('admin creates a Rupiah voucher and it is listed as -Rp20.000', async ({ page, problems }) => {
  void problems
  const code = `RP${uniqueSuffix()}`
  await signIn(page, 'admin')
  await page.getByRole('navigation').first().getByText('Pelanggan', { exact: true }).click()
  await page.getByRole('button', { name: /Kelola voucher/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Kelola voucher' })
  await expect(dialog).toContainText('potongan Rupiah atau persen')
  await dialog.getByRole('button', { name: /Voucher baru/ }).click()
  await dialog.locator('input.uppercase').first().fill(code)
  await dialog.getByRole('group', { name: 'Jenis diskon' }).getByRole('button', { name: '-Rp' }).click()
  await dialog.getByLabel('Potongan Rupiah').fill('20000')
  await dialog.getByRole('button', { name: /Buat voucher/ }).click()
  const row = dialog.locator('div').filter({ hasText: code }).filter({ hasText: '-Rp20.000' }).first()
  await expect(row).toBeVisible()
})

test('review promo settings show the Rp20.000 reward', async ({ page, problems }) => {
  void problems
  await signIn(page, 'admin')
  await page.getByRole('navigation').first().getByText('Pelanggan', { exact: true }).click()
  await page.getByRole('button', { name: 'Ulasan Pelanggan', exact: true }).click()
  await page.getByRole('button', { name: 'Ulasan & promo', exact: true }).click()
  const group = page.getByRole('group', { name: 'Jenis diskon' })
  await expect(group.getByRole('button', { name: '-Rp' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Potongan Rupiah')).toHaveValue('20000')
})
