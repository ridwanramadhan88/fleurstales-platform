import type { Browser, Locator } from '@playwright/test'
import { test, expect, signIn, signOut, expectNoAlert, englishLines, type Page } from './fixtures'
import { uniqueSuffix } from './orders'

/**
 * Staff account lifecycle through the real UI and the staff-admin Edge Function.
 *
 * Regressions covered (production, 6 Nov 2026):
 *  - a login re-activated itself when "Save profile" ran after "Deactivate"
 *    (the details sheet re-sent a stale `isActive: true`);
 *  - a username changed on the login but not in HR (two separate writes);
 *  - removing an employee left the HR writer on a stale revision (conflict).
 */

const openPeople = async (page: Page) => {
  await page.getByRole('navigation').first().locator('a:visible, button:visible').filter({ hasText: /^Staf$/ }).first().click()
  await page.locator('main button:visible').filter({ hasText: /^Karyawan$/ }).first().click()
  await page.waitForLoadState('networkidle')
}

const employeeCard = (page: Page, name: string): Locator =>
  page.locator('main').getByText(name, { exact: true }).locator('xpath=ancestor::*[.//button[normalize-space()="Detail"]][1]')

const openDetails = async (page: Page, name: string): Promise<Locator> => {
  await employeeCard(page, name).getByRole('button', { name: 'Detail' }).click()
  const details = page.getByRole('dialog', { name: /Detail karyawan/ })
  await expect(details).toBeVisible()
  return details
}

const field = (scope: Locator, label: RegExp): Locator =>
  scope.locator('label').filter({ hasText: label }).locator('input, select').first()

/** Signs in with a separate, unwatched browser context (an expected failure must not fail the test). */
const canSignIn = async (browser: Browser, baseURL: string, email: string, password: string): Promise<boolean> => {
  const context = await browser.newContext({ baseURL, locale: 'id-ID', timezoneId: 'Asia/Jakarta' })
  try {
    const page = await context.newPage()
    await page.route('https://unpkg.com/**', (route) => route.abort())
    await page.goto('/')
    await page.locator('input[autocomplete="username"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    return await page.getByRole('navigation').first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)
  } finally {
    await context.close()
  }
}

test('owner: create, edit, deactivate, reactivate and remove a staff account keeps login and HR in sync', async ({ page, browser, baseURL, problems }) => {
  void problems
  const run = uniqueSuffix()
  const name = `E2E Staf ${run}`
  const username = `e2e-staf-${run}`
  const email = `e2e-staf-${run}@fleurstales.test`
  const password = `Rahasia${run}`

  await test.step('owner creates a florist account', async () => {
    await signIn(page, 'owner')
    await openPeople(page)
    await page.locator('main').getByRole('button', { name: 'Buat akun staf' }).click()
    const sheet = page.getByRole('dialog').filter({ has: page.locator('button[type="submit"]') }).last()
    await field(sheet, /^Nama/).fill(name)
    await field(sheet, /^Peran/).selectOption('florist')
    await field(sheet, /^Email pemulihan/).fill(email)
    await field(sheet, /^Nama Pengguna/).fill(username)
    await field(sheet, /^Kata Sandi/).fill(password)
    expect(await englishLines(page), 'create staff sheet').toEqual([])
    await sheet.locator('button[type="submit"]').click()
    await expect(sheet).toHaveCount(0)
    await expect(employeeCard(page, name)).toBeVisible()
  })

  await test.step('the employee is stored on the server (survives a reload) and can sign in', async () => {
    await page.reload()
    await openPeople(page)
    await expect(employeeCard(page, name)).toBeVisible()
    expect(await canSignIn(browser, baseURL!, email, password)).toBe(true)
  })

  await test.step('deactivate, then "Save profile" must not re-activate the login', async () => {
    const details = await openDetails(page, name)
    await details.getByRole('button', { name: 'Nonaktifkan' }).click()
    const confirm = page.getByRole('alertdialog', { name: /Nonaktifkan karyawan/ })
    expect(await englishLines(page), 'deactivate dialog').toEqual([])
    await confirm.getByRole('button', { name: 'Konfirmasi' }).click()
    await expect(confirm).toHaveCount(0)
    await expect(details.getByRole('button', { name: 'Aktifkan' })).toBeVisible()
    await field(details, /^WhatsApp/).fill('081299990000')
    await details.getByRole('button', { name: 'Simpan profil' }).click()
    await expect(details).toContainText('Profil tersimpan.')
    await expect(details.getByRole('alert')).toHaveCount(0)
    await expect(details.getByRole('button', { name: 'Aktifkan' })).toBeVisible()
    expect(await canSignIn(browser, baseURL!, email, password), 'deactivated login must stay disabled after a profile save').toBe(false)
  })

  await test.step('reactivate and change the username: login and HR change together', async () => {
    const details = page.getByRole('dialog', { name: /Detail karyawan/ })
    await details.getByRole('button', { name: 'Aktifkan' }).click()
    const confirm = page.getByRole('alertdialog', { name: /Aktifkan karyawan/ })
    await confirm.getByRole('button', { name: 'Konfirmasi' }).click()
    await expect(confirm).toHaveCount(0)
    await expect(details.getByRole('button', { name: 'Nonaktifkan' })).toBeVisible()

    await details.getByRole('button', { name: /Akses/ }).first().click()
    await field(details, /^Nama Pengguna/).fill(`${username}-baru`)
    await details.getByRole('button', { name: 'Simpan akses' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Konfirmasi perubahan' }).click()
    await expect(details).toContainText('Perubahan akses tersimpan.')
    await expect(details.getByRole('alert')).toHaveCount(0)
    await expect(field(details, /^Nama Pengguna/)).toHaveValue(`${username}-baru`)
    expect(await canSignIn(browser, baseURL!, email, password)).toBe(true)
    await details.getByRole('button', { name: 'Tutup' }).first().click()
    await expect(details).toHaveCount(0)
  })

  await test.step('remove permanently: card disappears, no HR conflict, removal survives a reload', async () => {
    const details = await openDetails(page, name)
    await details.getByRole('button', { name: 'Profil', exact: true }).click()
    await details.getByRole('button', { name: 'Hapus permanen' }).click()
    const removal = page.getByRole('alertdialog').last()
    await removal.locator('input').nth(0).fill('Akun uji E2E')
    await removal.locator('input').nth(1).fill(name)
    expect(await englishLines(page), 'remove dialog').toEqual([])
    await removal.getByRole('button', { name: /Hapus permanen/ }).click()
    await expect(employeeCard(page, name)).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    await expectNoAlert(page)
    await page.reload()
    await openPeople(page)
    await expect(employeeCard(page, name)).toHaveCount(0)
    await expectNoAlert(page)
    expect(await canSignIn(browser, baseURL!, email, password)).toBe(false)
  })

  await signOut(page)
})

test('hr: edits a florist without a login and the change is stored', async ({ page, problems }) => {
  void problems
  const run = uniqueSuffix()
  await signIn(page, 'hr')
  await openPeople(page)
  const details = await openDetails(page, 'E2E Tanpa Login')
  await field(details, /^WhatsApp/).fill(`0813${run}`.slice(0, 13))
  await details.getByRole('button', { name: 'Simpan profil' }).click()
  await expect(details).toContainText('Profil tersimpan.')
  await expect(details.getByRole('alert')).toHaveCount(0)
  await details.getByRole('button', { name: 'Tutup' }).first().click()
  await page.reload()
  await openPeople(page)
  await expect(employeeCard(page, 'E2E Tanpa Login')).toContainText(`0813${run}`.slice(0, 13))
  expect(await englishLines(page)).toEqual([])
})

const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324'

test('hr emails a password reset link to a florist; the email arrives', async ({ page, problems }) => {
  void problems
  await signIn(page, 'hr')
  await openPeople(page)
  const details = await openDetails(page, 'E2E Florist')
  await details.getByRole('button', { name: /Akses/ }).first().click()
  expect(await englishLines(page), 'access tab').toEqual([])
  const before = Date.now()
  await details.getByRole('button', { name: 'Kirim tautan atur ulang sandi' }).click()
  await expect(details).toContainText('Tautan atur ulang sandi dikirim ke e2***@fleurstales.test')
  await expect(details.getByRole('alert')).toHaveCount(0)
  await expect.poll(async () => {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:e2e-florist@fleurstales.test')}`)
    const body = await response.json() as { messages?: Array<{ Created: string }> }
    return (body.messages ?? []).some((message) => Date.parse(message.Created) >= before - 5_000)
  }, { timeout: 20_000, message: 'reset email for e2e-florist did not arrive in mailpit' }).toBe(true)
})
