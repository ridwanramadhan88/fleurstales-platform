import { test, expect, signIn } from './fixtures'
import { expectNoEnglish, openOrder, uniqueSuffix } from './orders'

/**
 * Delivery recipient, pin and landmark (Owner decisions, 8 Nov 2026): an
 * online-shop delivery shows who receives it, the landmark and an "Open in
 * Maps" link; the Admin can correct the details from the order window.
 */

const supabaseUrl = process.env.E2E_SUPABASE_URL
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY

const isoInDays = (days: number) => {
  const date = new Date(Date.now() + 7 * 3600_000 + days * 86_400_000)
  return date.toISOString().slice(0, 10)
}

const createDeliveryOrder = async (customerName: string) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/create_storefront_order`, {
    method: 'POST',
    headers: { apikey: publishableKey ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_idempotency_key: `e2e-delivery-${customerName}`,
      p_customer: { name: customerName, whatsappNumber: `0812${uniqueSuffix()}` },
      p_branch_id: 'Kedamaian',
      p_fulfillment: 'delivery',
      p_schedule_date: isoInDays(4 + (Date.now() % 20)),
      p_schedule_time: ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30'][Math.floor(Date.now() / 1000) % 6],
      p_items: [{ productId: 'catalog_pink_lily_002', variantId: 'catalog_pink_lily_002_variant_1', quantity: 1 }],
      p_delivery_address: 'E2E Jl. Teuku Umar 12, Kedaton',
      p_payment_method: 'transfer',
      p_delivery_details: {
        recipientName: 'Ibu Ratna',
        recipientPhone: '0812 7788 2010',
        latitude: -5.381,
        longitude: 105.258,
        landmark: 'Pagar hitam depan masjid',
      },
    }),
  })
  expect(response.ok, await response.clone().text()).toBe(true)
}

test('delivery order shows recipient, landmark and Maps link; Admin can correct them', async ({ page, problems }) => {
  void problems
  const customerName = `E2E Antar ${uniqueSuffix()}`
  await createDeliveryOrder(customerName)

  await signIn(page, 'admin')
  const details = await openOrder(page, customerName)

  await test.step('recipient, landmark and Maps link are visible', async () => {
    await expect(details).toContainText('Penerima')
    await expect(details).toContainText('Ibu Ratna')
    await expect(details).toContainText('Patokan: Pagar hitam depan masjid')
    const maps = details.getByRole('link', { name: /Buka di Maps/ })
    await expect(maps).toHaveAttribute('href', /query=-5\.381,105\.258/)
    await expectNoEnglish(page, 'delivery destination')
  })

  await test.step('Admin corrects the landmark and pin', async () => {
    await details.getByRole('button', { name: 'Ubah pengiriman' }).click()
    const dialog = page.getByRole('dialog', { name: 'Detail pengiriman' })
    await expect(dialog).toBeVisible()
    await expectNoEnglish(page, 'delivery details dialog')
    await dialog.getByLabel('Pin antar: link Google Maps atau koordinat').fill('-5.4, 105.27')
    await expect(dialog).toContainText('Pin terpasang')
    await dialog.getByLabel('Patokan & detail rumah').fill('Rumah biru, titip satpam')
    await dialog.getByRole('button', { name: 'Simpan' }).click()
    await expect(dialog).toBeHidden()
    await expect(details).toContainText('Patokan: Rumah biru, titip satpam')
    await expect(details.getByRole('link', { name: /Buka di Maps/ })).toHaveAttribute('href', /query=-5\.4,105\.27/)
  })
})
