import { test, expect, signIn, englishLines } from './fixtures'

/**
 * Pickup & delivery hours (Owner request 6 Nov 2026): Kedamaian 08.00-16.00,
 * separate from its opening hours 07.00-16.00 (which still drive attendance).
 * The migration seeds the window; the New order form must only offer times
 * inside it.
 */

test('admin: new order only offers pickup times inside the pickup & delivery hours', async ({ page, problems }) => {
  void problems
  await signIn(page, 'admin')
  await page.getByRole('navigation').first().getByText('Pesanan', { exact: true }).click()
  await page.getByRole('button', { name: /Pesanan baru/ }).first().click()
  const form = page.getByRole('dialog', { name: 'Pesanan baru' })
  await form.getByRole('group', { name: 'Pemenuhan' }).getByRole('button', { name: 'Pengambilan di Toko' }).click()
  await form.getByRole('button', { name: 'Tanggal pengambilan' }).click()
  await page.getByRole('button', { name: 'Bulan berikutnya' }).click()
  await page.getByRole('gridcell', { name: '12', exact: true }).click()
  await form.getByRole('button', { name: 'Waktu pengambilan' }).click()
  const options = await page.getByRole('listbox', { name: 'Waktu' }).getByRole('option').allInnerTexts()
  const times = options.map((text) => text.match(/\d{2}[:.]\d{2}/)?.[0]?.replace('.', ':')).filter(Boolean)
  expect(times[0]).toBe('08:00')
  expect(times.at(-1)).toBe('16:00')
  expect(times.some((time) => time! < '08:00')).toBe(false)
})

test('owner: branch settings show the pickup & delivery hours in Indonesian', async ({ page, problems }) => {
  void problems
  await signIn(page, 'owner')
  await page.getByRole('navigation').first().locator('a:visible, button:visible').filter({ hasText: /^Pengaturan$/ }).first().click()
  await page.locator('main button:visible, main a:visible').filter({ hasText: /^Cabang/ }).first().click()
  await expect(page.locator('main')).toContainText('Jam ambil & antar: 08:00–16:00')
  await expect(page.locator('main')).toContainText('Jam ambil & antar: 10:30–19:00')
  expect(await englishLines(page)).toEqual([])
})
