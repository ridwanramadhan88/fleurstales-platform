import { test, expect, signIn } from './fixtures'
import { expectNoEnglish, openOrder, uniqueSuffix } from './orders'

/**
 * An online-shop order opens in the review window: note, greeting card,
 * items, destination and the confirm action are all visible at once. After
 * the Admin confirms (and the WhatsApp preview is sent), the order leaves
 * review and moves to the payment step.
 */

const supabaseUrl = process.env.E2E_SUPABASE_URL
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY

const isoInDays = (days: number) => {
  const date = new Date(Date.now() + 7 * 3600_000 + days * 86_400_000)
  return date.toISOString().slice(0, 10)
}

const createOnlineShopOrder = async (customerName: string) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/create_storefront_order`, {
    method: 'POST',
    headers: { apikey: publishableKey ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_idempotency_key: `e2e-review-${customerName}`,
      p_customer: { name: customerName, whatsappNumber: `0812${uniqueSuffix()}` },
      p_branch_id: 'Kedamaian',
      p_fulfillment: 'delivery',
      // Spread runs over days and slots so earlier runs never fill a slot.
      p_schedule_date: isoInDays(3 + (Date.now() % 20)),
      p_schedule_time: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'][Math.floor(Date.now() / 1000) % 6],
      p_items: [{ productId: 'catalog_pink_lily_002', variantId: 'catalog_pink_lily_002_variant_1', quantity: 1 }],
      p_delivery_address: 'E2E Jl. Mawar 21, Teluk Betung',
      p_order_note: 'Tanpa baby breath, penerima alergi',
      p_greeting_message: 'Selamat ulang tahun, Mama',
      p_greeting_card_name: 'Raka',
      p_payment_method: 'transfer',
    }),
  })
  expect(response.ok, await response.clone().text()).toBe(true)
}

test('online-shop order opens in the review window and confirming moves it to payment', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Tinjau ${uniqueSuffix()}`
  await createOnlineShopOrder(customerName)

  await signIn(page, 'admin')
  const details = await openOrder(page, customerName)

  await test.step('everything needed to judge the order is open at once', async () => {
    await expect(details).toContainText('Perlu dikonfirmasi')
    await expect(details).toContainText('Tanpa baby breath, penerima alergi')
    await expect(details).toContainText('Kartu ucapan dari Raka')
    await expect(details).toContainText('Selamat ulang tahun, Mama')
    await expect(details).toContainText('Pink Lily')
    await expect(details).toContainText('E2E Jl. Mawar 21')
    await expect(details).toContainText('Termasuk ongkir')
    await expect(details.getByRole('button', { name: 'Konfirmasi dan kabari pelanggan' })).toBeVisible()
    await expect(details.getByRole('button', { name: 'Tolak' })).toBeVisible()
    await expectNoEnglish(page, 'review window')
  })

  await test.step('confirming sends the WhatsApp preview and moves the order to payment', async () => {
    await details.getByRole('button', { name: 'Konfirmasi dan kabari pelanggan' }).click()
    const send = page.getByRole('button', { name: /Kirim WhatsApp|Send WhatsApp/ })
    await expect(send).toBeVisible()
    const popup = page.waitForEvent('popup').catch(() => null)
    await send.click()
    await (await popup)?.close()
    const after = page.getByRole('dialog', { name: /Detail pesanan/ }).first()
    await expect(after.getByRole('button', { name: /Konfirmasi Pembayaran/ })).toBeVisible()
    await expect(after).not.toContainText('Konfirmasi dan kabari pelanggan')
    await expect(after.getByText('Baru', { exact: true })).toHaveCount(0)
  })
})
