import { test, expect, signIn, signOut, type Page } from './fixtures'
import { createCashPickupOrder, expectNoEnglish, openOrder, uniqueSuffix } from './orders'

/**
 * Transfer proofs live in the private `order-payment-proofs` bucket. Admin
 * attaches one while confirming a transfer payment; Finance must be able to
 * see it in the reconciliation review and from the ledger row, always through
 * a short-lived signed link.
 */

const SIGNED_PROOF = /\/storage\/v1\/object\/sign\/order-payment-proofs\//

/** Clicks a control that opens the proof in a new tab and checks the image is served. */
const expectProofOpensInNewTab = async (page: Page, click: () => Promise<void>): Promise<string> => {
  const popupPromise = page.waitForEvent('popup')
  await click()
  const popup = await popupPromise
  await popup.waitForURL(SIGNED_PROOF)
  const response = await page.request.get(popup.url())
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^image\//)
  const objectPath = decodeURIComponent(new URL(popup.url()).pathname.split('/order-payment-proofs/')[1] ?? '')
  await popup.close()
  return objectPath
}

/** Asks Storage directly, with the signed-in user's own token, to sign the proof. */
const signProofAsCurrentUser = async (page: Page, objectPath: string) => {
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? ''
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        return (JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token?: string }).access_token ?? ''
      }
    }
    return ''
  })
  expect(token, 'signed-in Supabase session').not.toBe('')
  const apiUrl = process.env.E2E_SUPABASE_URL
  const apiKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY
  if (!apiUrl || !apiKey) throw new Error('Run through scripts/run-os-e2e.sh (E2E_SUPABASE_URL / E2E_SUPABASE_PUBLISHABLE_KEY).')
  return page.request.post(`${apiUrl}/storage/v1/object/sign/order-payment-proofs/${objectPath}`, {
    headers: { authorization: `Bearer ${token}`, apikey: apiKey },
    data: { expiresIn: 60 },
  })
}

test('finance can see the transfer proof the admin attached', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Bukti ${uniqueSuffix()}`

  await signIn(page, 'admin')
  await createCashPickupOrder(page, customerName, `0818${uniqueSuffix()}`, 'Transfer Bank')
  const details = await openOrder(page, customerName)
  await details.getByRole('button', { name: /Konfirmasi pembayaran/i }).click()
  const payment = page.getByRole('dialog', { name: 'Konfirmasi Pembayaran' })
  await expect(payment.getByRole('button', { name: 'Konfirmasi Lunas' })).toBeDisabled()
  await payment.locator('input[type="file"]').setInputFiles('e2e/assets/finish-photo.jpg')
  await expect(payment.getByRole('img', { name: /bukti transfer/i })).toBeVisible()
  await expectNoEnglish(page, 'transfer payment confirmation')
  await payment.getByRole('button', { name: 'Konfirmasi Lunas' }).click()
  await expect(payment).toHaveCount(0)
  await signOut(page)

  await signIn(page, 'finance')
  await page.getByRole('navigation').first().getByRole('button', { name: 'Keuangan', exact: true }).click()
  const row = page.locator('main').getByText(customerName, { exact: true }).locator('xpath=ancestor::*[.//button[contains(., "Tinjau pembayaran")]][1]')
  await row.getByRole('button', { name: /Tinjau pembayaran/ }).click()

  // Reconciliation review: inline preview through a signed link, plus full view.
  const review = page.getByRole('dialog').last()
  const preview = review.locator('img[src*="/object/sign/order-payment-proofs/"]')
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expectNoEnglish(page, 'finance proof review')
  await expectProofOpensInNewTab(page, () => review.getByRole('button', { name: 'Buka bukti lengkap' }).click())
  await page.keyboard.press('Escape')

  // Ledger: the order payment row carries the same proof.
  await page.getByRole('tab', { name: /Transaksi/ }).or(page.getByRole('button', { name: /^Transaksi$/ })).first().click()
  const ledgerRow = page.locator('main').getByText(/^Pesanan KDM-/).first().locator('xpath=ancestor::*[.//button[normalize-space()="Bukti"]][1]')
  await expect(ledgerRow).toContainText('Pembayaran pesanan')
  await expectNoEnglish(page, 'finance ledger')
  const objectPath = await expectProofOpensInNewTab(page, () => ledgerRow.getByRole('button', { name: 'Bukti', exact: true }).click())
  expect(objectPath).toMatch(/^order_[^/]+\/proof-.+\.jpg$/)
  expect((await signProofAsCurrentUser(page, objectPath)).status()).toBe(200)
  await signOut(page)

  // Florists never get a signed link, even when they ask Storage directly.
  await signIn(page, 'florist')
  expect((await signProofAsCurrentUser(page, objectPath)).ok()).toBe(false)
})
