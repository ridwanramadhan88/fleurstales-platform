import { test, expect, signIn } from './fixtures'

/**
 * Daily customer-birthday notification for Admins (Owner request 6 Nov 2026).
 * The seed adds a customer born today and runs private.notify_customer_birthdays()
 * (the 08:00 WIB cron job); recipients, dedupe and 29 Feb are covered by
 * customer_birthday_notifications_smoke.sql.
 */
test('admin sees today\'s customer birthday and it opens Customers', async ({ page, problems }) => {
  void problems
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Notifikasi' }).first().click()
  const item = page.getByText('Ulang tahun pelanggan hari ini').first()
  await expect(item).toBeVisible()
  await expect(page.getByText(/E2E Ulang Tahun · 081277770001/).first()).toBeVisible()
  await item.click()
  await expect(page.locator('main')).toContainText('E2E Ulang Tahun')
})

test('florist does not get customer birthday notifications', async ({ page, problems }) => {
  void problems
  await signIn(page, 'florist')
  await page.getByRole('button', { name: 'Notifikasi' }).first().click()
  await expect(page.getByText('Ulang tahun pelanggan hari ini')).toHaveCount(0)
})
