import { test, expect, signIn, signOut, expectNoAlert, visitAllSections, type StaffRole } from './fixtures'

const roles: StaffRole[] = ['owner', 'admin', 'finance', 'hr', 'florist']

for (const role of roles) {
  test(`${role}: every section opens without errors and without English copy`, async ({ page, problems }) => {
    void problems
    await signIn(page, role)
    await expectNoAlert(page)
    const findings = await visitAllSections(page)
    expect(findings, 'English UI text still visible').toEqual({})
  })
}

test('switching accounts in the same tab leaves no stale warning (SESSION_REQUIRED regression)', async ({ page, problems }) => {
  void problems
  await signIn(page, 'hr')
  await signOut(page)
  await signIn(page, 'finance')
  await page.waitForLoadState('networkidle')
  await expectNoAlert(page)
  await signOut(page)
  await signIn(page, 'owner')
  await page.waitForLoadState('networkidle')
  await expectNoAlert(page)
})

test('reloading a non-catalog role does not call admin-only catalog RPCs (403 regression)', async ({ page, problems }) => {
  void problems
  await signIn(page, 'hr')
  await page.reload()
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await expect(page.getByRole('navigation').first()).toContainText('Staf')
  // Give the post-sign-in hydration time to issue every request it is going to make.
  await page.waitForTimeout(3_000)
})
