import { test, expect, signIn, signOut } from './fixtures'
import { assignFloristAndStart, confirmCashPayment, createCashPickupOrder, expectNoEnglish, openOrder, uniqueSuffix, visibleToasts } from './orders'

const FINISH_PHOTO = 'e2e/assets/finish-photo.jpg'

/**
 * The full cash order lifecycle across roles. This is the flow that hid the
 * "internal cash order cannot be confirmed paid" bug (#145): every step must
 * succeed through the real UI against a real database.
 */

test('cash order: admin confirms payment and assigns florist, florist uploads the finish photo', async ({ page, problems }) => {
  const run = uniqueSuffix()
  const customerName = `E2E Tunai ${run}`
  void problems

  await test.step('admin creates a cash pickup order', async () => {
    await signIn(page, 'admin')
    await createCashPickupOrder(page, customerName, `0812${run}`)
  })

  await test.step('admin confirms the cash payment (regression #145) and sees the confirmation toast', async () => {
    const details = await openOrder(page, customerName)
    await confirmCashPayment(page, details)
    // Toasts were never rendered before 2026-10-22; feedback must be visible and Indonesian.
    await expect.poll(() => visibleToasts(page)).toContainEqual(expect.stringContaining('Pembayaran dikonfirmasi'))
  })

  await test.step('admin assigns the florist and starts production', async () => {
    const details = page.getByRole('dialog', { name: /Detail pesanan/ }).first()
    await assignFloristAndStart(page, details)
    await expect(details).toContainText('E2E Florist')
  })

  await test.step('florist sees the order and uploads the finish photo', async () => {
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
