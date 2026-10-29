import { test as base, expect, type Page } from '@playwright/test'

export type StaffRole = 'owner' | 'admin' | 'finance' | 'hr' | 'florist'

const password = process.env.E2E_STAFF_PASSWORD
if (!password) throw new Error('E2E_STAFF_PASSWORD is required (the throwaway password used by e2e/seed.sql).')

export const staffEmail = (role: StaffRole) => `e2e-${role}@fleurstales.test`

/** Problems that make a test fail at the end even if every assertion passed. */
export interface PageProblems {
  consoleErrors: string[]
  failedResponses: string[]
}

/**
 * Known noise that is not an application defect. Keep this list short and
 * explain every entry.
 */
const IGNORED_CONSOLE = [
  // Wrong-password attempts are exercised on purpose in some flows.
  /Fleurstales OS sign-in failed/,
  // The CDN map library is blocked on purpose (see the route above).
  /unpkg\.com\/leaflet/,
]

const watch = (page: Page): PageProblems => {
  const problems: PageProblems = { consoleErrors: [], failedResponses: [] }
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return
    // Chromium logs failed HTTP responses as console errors; those are tracked below.
    if (/^Failed to load resource: the server responded with a status of/.test(text)) return
    if (/^Failed to load resource: net::ERR_FAILED/.test(text) && /unpkg\.com/.test(message.location().url)) return
    problems.consoleErrors.push(text)
  })
  page.on('pageerror', (error) => problems.consoleErrors.push(`pageerror: ${error.message}`))
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith('http://127.0.0.1:54321') || response.status() < 400) return
    const body = await response.text().catch(() => '')
    const code = /"message":"([^"]+)"/.exec(body)?.[1]
    problems.failedResponses.push(`${response.status()} ${response.request().method()} ${url.replace('http://127.0.0.1:54321', '').split('?')[0]}${code ? ` ${code}` : ''}`)
  })
  return problems
}

export const test = base.extend<{ problems: PageProblems }>({
  problems: async ({ page }, use) => {
    // The map library is loaded from a CDN with SRI; the suite never needs a real map.
    await page.route('https://unpkg.com/**', (route) => route.abort())
    const problems = watch(page)
    await use(problems)
    expect(problems.failedResponses, 'Supabase requests that failed (4xx/5xx)').toEqual([])
    expect(problems.consoleErrors, 'Console errors').toEqual([])
  },
})

export { expect }
export type { Page }

export const signIn = async (page: Page, role: StaffRole) => {
  await page.goto('/')
  await page.locator('input[autocomplete="username"]').fill(staffEmail(role))
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('input[type="password"]')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByRole('navigation').first()).toBeVisible()
}

export const signOut = async (page: Page) => {
  // A reload closes any open dialog while keeping the session.
  await page.reload()
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await page.locator('header button[aria-haspopup="menu"]').first().click()
  await page.getByRole('button', { name: /keluar|sign out/i }).click()
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 30_000 })
}

/** No persistent error/warning notice may be on screen. */
/** Clicks every sidebar section (and its visible tabs) and returns English UI lines found. */
export const visitAllSections = async (page: Page): Promise<Record<string, string[]>> => {
  const findings: Record<string, string[]> = {}
  const nav = page.getByRole('navigation').first()
  const labels = (await nav.locator('a:visible, button:visible').allInnerTexts()).map((label) => label.trim().split('\n')[0]).filter(Boolean)
  for (const label of labels) {
    await nav.locator('a:visible, button:visible').filter({ hasText: label }).first().click()
    await page.waitForLoadState('networkidle')
    await expectNoAlert(page)
    const tabs = [...new Set((await page.locator('main [role="tab"]:visible').allInnerTexts()).map((tab) => tab.trim().split('\n')[0].trim()).filter(Boolean))]
    if (process.env.E2E_DEBUG) console.log('SECTION', label, JSON.stringify(tabs))
    const sections = tabs.length > 0 ? tabs : ['']
    for (const tab of sections) {
      if (tab) {
        // Some tabs swap the tab set (e.g. Keuangan › Pengembalian dana); skip tabs that disappeared.
        const target = page.locator('main [role="tab"]:visible').filter({ hasText: tab }).first()
        if (await target.count() === 0) continue
        await target.click({ timeout: 10_000 })
        await page.waitForLoadState('networkidle')
        await expectNoAlert(page)
      }
      const lines = await englishLines(page)
      if (lines.length > 0) findings[tab ? `${label} › ${tab}` : label] = lines
    }
  }
  return findings
}

export const expectNoAlert = async (page: Page) => {
  await expect(page.getByRole('alert')).toHaveCount(0)
}

const ENGLISH_UI = /\b(the|and|with|your|yet|please|unable|failed|required|cannot|should|must|been|this|that|these|which|will|would|could|there|here|only|already|not|available|unavailable|loading|saving|select|choose|upload|remove|delete|edit|cancel|confirm|submit|view|show|hide|details|settings|joined|left|missing|unassigned|payments?|orders?|customers?|employees?|schedule|reconcile|no)\b/i
// Only month abbreviations that differ from Indonesian (Jan, Feb, Mar, Apr, Jun, Jul, Sep, Nov are shared).
const MONTHS_EN = /\b\d{1,2} (May|Aug|Sept|Oct|Dec)\b/
/** Visible text that is data, not UI copy. */
const DATA_ALLOWLIST = [
  /^E2E /,
  /@fleurstales\.test$/,
  // Customer WhatsApp templates are Indonesian copy that carries a tracking URL.
  /^Hi kak /,
]

/** Returns visible UI lines that still contain English. */
export const englishLines = async (page: Page): Promise<string[]> => {
  // Toasts render outside <main>; include them so untranslated feedback is caught.
  const text = await page.locator('main, [role="dialog"], [role="region"] ol > li').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).innerText).join('\n'))
  return [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))]
    .filter((line) => !DATA_ALLOWLIST.some((pattern) => pattern.test(line)))
    .filter((line) => ENGLISH_UI.test(line) || MONTHS_EN.test(line))
}
