import { test, expect, signIn, signOut, expectNoAlert, visitAllSections, type StaffRole } from './fixtures'

const roles: StaffRole[] = ['owner', 'admin', 'finance', 'hr', 'florist', 'manager']

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

test('manager: sees every order, the catalog and customers, but not Finance, Staff or Settings', async ({ page, problems }) => {
  void problems
  await signIn(page, 'manager')
  await expectNoAlert(page)
  const nav = page.getByRole('navigation').first()
  for (const label of ['Pesanan', 'Katalog', 'Pelanggan']) await expect(nav).toContainText(label)
  for (const label of ['Keuangan', 'Staf', 'Pengaturan']) await expect(nav).not.toContainText(label)

  // M2: the daily attendance photo board lists every scheduled-or-not staff member.
  const board = page.getByTestId('attendance-photo-board')
  await expect(board).toBeVisible()
  await board.getByRole('button').first().click()
  await expect(board).toContainText('E2E Florist')
  await expect(board).toContainText('E2E Admin')
})

test('manager: opens the Flower of the Month picker from the catalog', async ({ page, problems }) => {
  void problems
  await signIn(page, 'manager')
  await page.getByRole('navigation').first().getByText('Katalog', { exact: true }).click()
  await page.getByRole('button', { name: /More catalog actions|lainnya/i }).click()
  await page.getByRole('menuitem', { name: 'Flower of the Month' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Flower of the Month')
  await expect(dialog).toContainText('Terpilih (0/6)')
  await expectNoAlert(page)
})
