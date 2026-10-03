# Business OS UI/UX clean-up plan

Audit date: 3 Oct 2026. Audited app: `apps/os` (Business OS), on `main` at `df86772` (after PR #117).
Scope: all five roles (owner, admin, finance, hr, florist), at phone size (390px) and desktop size (1440px).

This file is a hand-off for a new Claude Code session. It is self-contained: read it top to bottom, then do one PR at a time in the order below.

---

## 0. Ground rules (must follow)

- **Never run or apply SQL migrations by hand.** Migrations only reach production through the release workflow.
- **Never use `--admin`** or bypass branch protection or a failing check.
- **Releases only via the "Release production" GitHub workflow** (`.github/workflows/release-production.yml`, run on `main`). Never merge a new PR while a release is running.
- **Vercel previews for PRs connect to the production Supabase.** Any save made on a preview is a real save. Tell the owner this before they test.
- **One PR per item below.** Each PR has its own tests, preview and release. Merge and release only when the owner says "go".
- **Before every push:** run the checks in §5 and make sure they exit 0. Do not push while `check:os` is failing.
- **Keep the two apps in step.** Some files exist in both `apps/os` and `apps/storefront` and must stay identical. `npm run check:shared-parity` enforces this. `naturalTranslations.ts` and the i18n files are among them.
- **UI language is Indonesian.** The owner reviews screens in Indonesian. Screenshots for review should use Indonesian (see §6).

---

## 1. What we learned from the catalog / size-chart clean-up (PR #117)

Use these as the checklist for every screen.

1. **One setting, one place.** The size chart could be set in two places, and nobody could tell which one applied. Pick a value where it is used.
2. **Never silently change what the user typed.** The editor added "Koleksi - " to product names, so a rename looked like a failed save. If the app shapes a value, show it before saving.
3. **Rules apply only to what the user is changing.** A new rule blocked renames because of old, untouched data. Old records must never block an unrelated edit.
4. **Long multi-part forms become steps.** Use one clear path (Lanjut / Kembali / Simpan), mark optional parts "opsional" and give them "Lewati". Avoid tabs that each have their own apply button.
5. **List first, details on demand.** Show a list, open one item, and keep sub-items collapsed.
6. **Warnings must say what to do and let you do it in place.** Use "Pilih ukuran baru" with a dropdown on the row, not "Ukuran tidak cocok".
7. **Prove each step:** a failing test first, then all checks, then a preview, then the release workflow, then a production check.

---

## 2. Audit findings

Method: a local copy of Business OS with demo data and demo orders, driven by Playwright as each role, at both sizes. An automatic sweep collected visible English text. See §6 to reproduce it.

Caveat: some warnings come from the demo accounts and will not show for real staff. Examples are "No active admin/florist data staf terhubung ke akun ini" and "Belum Ditugaskan" on seeded orders. Ignore them.

### 2.1 Wrong or contradictory numbers (bugs)

| # | Finding | Where | Root cause |
|---|---|---|---|
| B1 | Finance home says "N completed order(s) waiting for reconciliation", but the Reconciliation screen says "All caught up". | `apps/os/src/components/dashboard/RoleFocusNotice.tsx:21-28` | It counts `status === 'pending_verification' && !financeVerified`, which means **new orders waiting for admin confirmation**, not orders waiting for finance reconciliation. The finance workspace uses its own, correct "attention" queue (`components/finance/FinanceCashFlowOverview.tsx`, `attention.total`). |
| B2 | The "Mendatang" badge counts today's later orders, and the Mendatang list shows them too, labelled "Today · 14:00". The same order appears under both Hari ini and Mendatang. | `apps/os/src/domain/futureOrderBadgeDomain.ts:12-16` (badge: scheduled after *now*) vs `apps/os/src/domain/orderTimingDomain.ts:126-136` `isFutureOrder` (date after *today*). Also check the list filter used by the Mendatang sub-tab. | Two definitions of "upcoming". |
| B3 | Finance's menu item "Rekonsiliasi" (phone) / "Rekonsiliasi Pesanan" (desktop) opens the **Ringkasan** (balance) tab, not reconciliation. | Label: `apps/os/src/config/navigationGroups.ts:99-103`. Module: `apps/os/src/domain/financeWorkspaceDomain.ts:18,38-42` (`MODULE_ORDER[0]` is `'balance'`). Wiring: `apps/os/src/pages/Home.tsx` (`financeModule` state). | The label promises reconciliation, but the default module is the first in `MODULE_ORDER`. |

### 2.2 Blocked with no visible reason

| # | Finding | Where |
|---|---|---|
| U1 | Orders page: a grey "Pesanan baru tidak tersedia" button. The reason ("No branch is assigned for your current shift…" or "Select a specific branch…") only appears as a tooltip after tapping a button that looks disabled. Owners on "Semua" must find the branch picker themselves. | `apps/os/src/components/orders/OrdersTabHeader.tsx:68-101`, `apps/os/src/pages/Home.tsx:214-234`, `apps/os/src/components/ui/guarded-action.tsx` |

### 2.3 Mixed English and Indonesian (most screens)

Examples seen: "Lihat orders", "Lihat all orders", "Tinjau & confirm", "Today · 11:00", "Today's orders and issues.", "Selesai 1 highlighted field before review.", "+ Add birthday", "+ Add promo code", "Pilih a date to see available hours.", "Konfirmasi pembayaran penuh saat Process Pesanan…". Also:
- the whole **Process Order** dialog ("Process Order", "Payment is already confirmed…", "Use Show all florists…");
- the Finance overview ("Accounting period", "Manage periods", "Needs Attention", "All caught up", "Finance settings", the "Reconciliation" tab);
- HR ("Attendance review", "Point adjustments", "Employment dates", "0 staff · 0 manual");
- access settings ("Lihat Only", "Lihat access details", "Lihat Orders", "Lihat Assigned Work", "Business owner with protected governance access", "Tinjau the current Section Access…");
- orders table headers on desktop ("ORDER, TIME, FLORIST, TOTAL" next to "PEMENUHAN, STATUS");
- catalog "172 products · 30/172".

Dates show raw ISO ("2026-10-03", "2026-09-21–2026-10-20") instead of "Hari ini", "3 Okt" or "21 Sep – 20 Okt".

**Root cause:** components are written in English and translated at runtime by `apps/os/src/i18n/UiLanguageBridge.tsx`. It rewrites DOM text nodes using `translateUiText.ts`, which looks strings up in dictionaries (`strictIndonesianTranslations.ts`, `indonesianTranslations.ts`, `reviewedTranslationSource.ts`, plus phrase/term passes in `finalizeIndonesianCopy.ts`). Any string not in a dictionary stays English. A sentence split across several text nodes or JSX expressions gets translated only partly. Nothing tests for leftovers. Some components also hard-code Indonesian (for example `components/finance/OrderFinanceReviewSheet.tsx`, `AddInternalTransaction.tsx`).

Related files:
- `orderTableScheduleLabels.ts` and `OrdersSubTabs.tsx` produce "Today · …";
- `components/finance/FinanceDateScopeTabs.tsx`, `TransactionLedger.tsx` and `notifications/NotificationCenter.tsx` also build "Today" labels.

### 2.4 Orders (most-used daily flow)

**New Order** (`components/orders/NewOrderSheet.tsx`, `NewOrderStructureSection.tsx` and related `NewOrder*` files):
- About four phone screens of scrolling. Section order: Pelanggan → Item → "Struktur pesanan" (source, fulfillment) → delivery fields → Kartu Ucapan → Pembayaran → Catatan.
- A walk-in pickup still shows pickup date and time, greeting card and payment fields.
- The primary "Tinjau Pesanan · Rp X" button is styled like secondary/plain text, especially on desktop. "Simpan draft" looks like the main action.
- "Struktur pesanan" is jargon. Its labels ("Sumber pesanan", "Pemenuhan") wrap awkwardly on phones.
- Desktop: the two-column layout works; keep it.

**Order details** (`components/orders/OrderDetailsPanel.tsx`):
- The next-step button is labelled with a status name ("Diproses →", "Dikonfirmasi →") in pale green. The admin home list already uses clear actions ("Tinjau & confirm", "Tugaskan & mulai", "Tandai Siap", "Mulai Pengiriman"). Use the same labels and primary styling.
- "Pelanggan & pemenuhan" (phone, address) starts collapsed, but staff need it for deliveries.
- The header says "Pesanan" twice (breadcrumb and subtitle).
- Desktop: the wide dialog is mostly empty with a large blank product image. Use two columns: order on the left, customer and delivery on the right.

**Process Order dialog:**
- Fully in English.
- The "Perangkai Bunga terjadwal / 0 direkomendasikan · 0 aktif" label column is squeezed.
- Dates show as ISO.

### 2.5 Role home screens don't show each role's work

- **Admin "Hari ini":** the good "Prioritas pesanan hari ini" list (with action buttons) sits **below** large "Kehadiran saya" and "Jadwal saya" cards, about 900px down on a phone.
- **Florist "Pekerjaan saya":** the same problem. Attendance and schedule come before "Pesanan saya yang ditugaskan".
- **Finance home:** shortcuts to Pelanggan and Katalog (not finance work), plus the miscounted card (B1).
- **HR home:** one counter on an empty page.
- **Owner desktop home:** three number cards and an empty page.
- Role priorities live in `apps/os/src/config/mobileNavigation.ts` (`ROLE_PRIMARY_PRIORITY`) and `apps/os/src/components/dashboard/*` (`DashboardTab.tsx`, `RoleFocusNotice.tsx`).

### 2.6 Navigation inconsistencies

- **HR has two menus for the same pages on desktop:**
  - sidebar: Ringkasan, Kehadiran, Penjadwalan, Karyawan, Laporan, Penggajian, Poin;
  - page tabs: Staf, Jadwal, Kehadiran, Penggajian.

  They are the same places under different names. See `components/hr/HrTabContent.tsx`, `PeopleWorkspaceUI.tsx` and `config/navigationGroups.ts`.
- **Phone and desktop menus use different names and items.** Finance has "Ringkasan" on the phone but not on desktop, and "Rekonsiliasi" vs "Rekonsiliasi Pesanan". Labels come from `getNavigationLabel` in `config/navigationGroups.ts`.
- **Desktop orders table:** words get cut off ("Pengambil…", "Menunggu Konfi…") although the Order column has lots of spare width.

### 2.7 Same task split across places

- **Payroll** is prepared in HR (`components/hr/HrPayrollSection.tsx`) and reviewed in Finance (`components/finance/FinancePayrollReview.tsx`), and both have their own "Monthly payroll proposal".
- On the HR side, "Tambah penerima manual" sits above or next to the main "Buat penggajian staf" button.
- The readiness checklist shows every item, including passed ones, in a red box.

### 2.8 Access settings

- `components/settings/PermissionMatrixPanel.tsx`: each role has 10 section switches plus 25 detailed feature permissions, mostly in mixed language. Owner-only and rarely used.

### 2.9 Fine as is

Pendapatan (revenue), Pelanggan (customers), the overall layout of Pengaturan (settings), the admin home's action buttons, and the desktop sidebar and top search.

---

## 3. Plan: one PR each, in this order

Every PR must work at **phone (390px) and desktop (1440px)**. Attach before/after screenshots at both sizes for the owner (§6).

### PR 1: Correct numbers and clear blockers (S)

- **B1:** the Finance home card counts what the finance workspace counts as needing attention: orders awaiting reconciliation, plus refunds or payroll if the card mentions them. Reuse the same selector as `FinanceCashFlowOverview`; don't write a second formula. Fix the label to match ("N pesanan menunggu rekonsiliasi"). Make the card open the reconciliation module.
- **B2:** one definition of "upcoming": **from tomorrow** (date after today in Asia/Jakarta). The badge, the calendar dots and the Mendatang list all use it. Today's later orders stay only in Hari ini.
- **B3:** the "Rekonsiliasi" / "Rekonsiliasi Pesanan" menu item opens the `order_verification` module. Either pass the module when navigating, or make the finance role's default module `order_verification`. Keep "Ringkasan" reachable as a tab.
- **U1:** when New Order is blocked, show the reason as visible text under the button, not only as a tooltip. For owners on "Semua", show an inline branch picker ("Pilih cabang untuk membuat pesanan") that sets the branch and enables the button. For admins with no shift, say who to ask.
- **Tests:**
  - a unit test for the finance count (a `pending_verification` order must **not** count; an order waiting for reconciliation must);
  - a unit test for upcoming (an order later today is not upcoming; one tomorrow is);
  - a component test that the finance nav lands on reconciliation;
  - a component test that the blocked reason is visible.

  Each test must fail on the old code.

### PR 2: Indonesian everywhere (M)

- **Add a guard test:** render each main screen for each role (reuse the app shell, or render workspace components with seeded stores) with `useUiLanguage` set to `'id'`. Collect visible text and fail on English words from a stopword list (the, and, for, with, your, this, only, all, view, review, pending, waiting, order(s), today, manage, details, items, staff, payment…). Allow-list business values (product names, branch names, SKUs, "WhatsApp", "BCA", "PDF", "CSV"). Run it at both sizes if layout changes the text.
- **Fix every string it finds.** Add dictionary entries, or better, make the sentence one translatable string instead of fragments ("Lihat semua pesanan", not "Lihat" + "all orders"). Fix the Process Order dialog, the Finance overview, HR payroll and attendance, access settings, the orders table headers and the catalog count.
- **Human dates in one shared helper:** "Hari ini · 14:00", "Besok · 09:00", "3 Okt", "21 Sep – 20 Okt". Replace ISO dates shown to users.
- **Keep the two apps identical** where the files are shared. Run `check:i18n` and `check:shared-parity`.

### PR 3: New Order clean-up (M)

- Order the form as **Pelanggan → Produk → Ambil / Kirim + waktu → Pembayaran → Tinjau**, and rename "Struktur pesanan".
- Optionally use a stepper on phones, like the variant editor in PR #117. Keep two columns on desktop.
- **Walk-in pickup:** hide pickup date and time (default to now) and the greeting card. Pick a sensible payment default and still show it.
- **Optional parts:** greeting card, notes, birthday and promo code become "+ Tambah …" links that expand.
- **"Tinjau Pesanan · Rp X"** becomes the solid blue primary button on both sizes. "Simpan draft" becomes secondary.
- **Errors:** the summary is one clear Indonesian sentence and scrolls to the first field.
- **Tests:**
  - the walk-in pickup path needs no date, time or card;
  - the delivery path still requires address, date and time;
  - the primary button has primary styling or role.

### PR 4: Order details and Process Order (S–M)

- The next-step button uses the action labels from the admin home list ("Tinjau & konfirmasi", "Tugaskan & mulai", "Tandai siap", "Mulai pengiriman", "Selesaikan") in primary style. Share one label map between the list and the panel.
- The top shows customer name, phone (tap to WhatsApp) and, for delivery, address and time, without opening a collapsed section.
- Remove the duplicate "Pesanan" heading.
- **Desktop:** two columns (order and items | customer, delivery, payment). Hide the large placeholder image when there is no photo.
- **Process Order dialog:** Indonesian text, a stacked label layout that doesn't squeeze, human dates.
- **Tests:** label mapping per status; the key customer fields are visible without expanding.

### PR 5: A home screen that shows each role's work (M)

- **Admin and florist:** the order list first; attendance and schedule become a compact one-line status ("Belum absen · Shift 08:00–16:00 · Absen") that expands on tap.
- **Finance:** cards "Perlu diverifikasi", "Menunggu rekonsiliasi" and "Refund", each opening its queue. Remove the Pelanggan and Katalog shortcuts from the finance home.
- **HR:** attendance issues today, schedule gaps this week, and payroll status for the period, each opening its screen.
- **Owner desktop:** fill the empty page with today's priority orders (the same component as admin), items needing attention and a small revenue trend.
- **Tests:** per role, the home shows the expected work cards in order.

### PR 6: Payroll as one flow (L)

- Show stages **HR menyiapkan → Keuangan meninjau → Keuangan membayar** on one screen. Each role sees all stages but can act only on its own.
- The main action comes first; "Tambah penerima manual" becomes secondary or overflow.
- The readiness checklist shows only blockers. Passed items collapse into "5 dari 6 siap".
- Do not change payroll data rules or the database. This is UI only. If a backend change seems needed, stop and ask the owner.

### PR 7: Access settings (M)

- Start from role presets (Pemilik, Admin, Keuangan, SDM, Perangkai Bunga). Show only the exceptions the owner changed, with "Kembalikan ke bawaan".
- Use plain Indonesian for every section and feature label.
- No change to how permissions are enforced.

### PR 8: One menu (S–M)

- **HR on desktop:** one set of names in one place. Either keep the sidebar and drop the page tabs, or the reverse. Use the same names on phone and desktop (for example Staf, Jadwal, Kehadiran, Penggajian, Laporan, Poin).
- **Same destinations and names on both sizes for every role.** Finance gets "Ringkasan" on desktop too, or drop it on the phone; just be consistent.
- **Desktop orders table:** size the columns so status and fulfillment don't get cut off; give the Order column less width.

Recommended grouping if the owner wants visible results fast: **PR 1 + 3 + 4 together as an "Orders clean-up" PR**, then PR 2.

---

## 4. Definition of done (every PR)

- Before/after screenshots at 390px and 1440px for every changed screen, sent to the owner before merge.
- New tests fail on the old code and pass on the new code.
- The checks in §5 all pass locally, and CI is green.
- The PR description says what changed, in plain words, with the screenshots.
- After the owner says "go": merge (no `--admin`), run "Release production", wait for it to pass, then check production if the PR touched data.

---

## 5. Checks to run before pushing

```bash
npm run check:i18n
npm run check:shared-parity
npm run check:os          # Business OS typecheck + tests + build (must exit 0)
npm run check:storefront  # when anything shared or storefront changed
# full suite (CI runs the relevant parts):
npm run check
```

There is no ESLint config. Tests are vitest with @testing-library/react (`apps/os/src/**/*.test.ts(x)`).

---

## 6. How to reproduce the audit screenshots (local only, never commit)

The audit used a temporary harness that renders the real `HomePage` with demo data and a chosen role. **Do not commit these files.** Copy them in, build, then delete them.

1. Create `apps/os/src/__uiHarness.tsx`:

```tsx
// TEMPORARY local UI harness for audit screenshots. Not committed.
import { createRoot } from 'react-dom/client'
import './shadcn.css'
import { useUserStore, type UserRole } from './store/userStore'
import { UiLanguageBridge } from './i18n/UiLanguageBridge'
import HomePage from './pages/Home'
import { useOrdersStore } from './store/ordersStore'
import { makeOrder } from './test/factories/order'
import { initializeBusinessOsCatalogBridge } from './data/shared/catalogBridge'
import { initializeBusinessOsStoreBridge } from './data/shared/storeBridge'

const params = new URLSearchParams(location.search)
useUserStore.getState().setRole((params.get('role') ?? 'owner') as UserRole)
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
const seed = () => useOrdersStore.setState({ orders: [
  makeOrder({ id: 'o1', orderNumber: 'KDM-2026-0101', customerName: 'Dita Anjani', source: 'whatsapp', fulfillment: 'delivery', status: 'pending_verification', totalIdr: 190000, deliveryFeeIdr: 15000, paymentStatus: 'paid', paymentMethod: 'transfer', paidAmountIdr: 190000, scheduleDate: today, scheduleTime: '14:00', deliveryAddress: 'Jl. Ahmad Yani 12', productName: 'Petite Rainbow' } as never),
  makeOrder({ id: 'o2', orderNumber: 'KDM-2026-0102', customerName: 'Rudi Hartono', source: 'walk_in', fulfillment: 'pickup', status: 'processing', totalIdr: 350000, paymentStatus: 'paid', paymentMethod: 'cash', paidAmountIdr: 350000, scheduleDate: today, scheduleTime: '16:00', florist: 'Agus', productName: 'Classic Rose - 20 Roses' } as never),
  makeOrder({ id: 'o3', orderNumber: 'KDM-2026-0103', customerName: 'Maya Sari', source: 'whatsapp', fulfillment: 'delivery', status: 'ready', totalIdr: 525000, paymentStatus: 'partial', paymentMethod: 'transfer', paidAmountIdr: 250000, scheduleDate: today, scheduleTime: '17:30', florist: 'Agus', deliveryAddress: 'Jl. Pahoman 3', productName: 'Thumbelina - Large Fresh' } as never),
  makeOrder({ id: 'o4', orderNumber: 'KDM-2026-0104', customerName: 'Andi Wijaya', source: 'whatsapp', fulfillment: 'pickup', status: 'confirmed', totalIdr: 275000, paymentStatus: 'paid', paymentMethod: 'transfer', paidAmountIdr: 275000, scheduleDate: today, scheduleTime: '11:00', productName: 'Omakase Small', financeVerified: true } as never),
  makeOrder({ id: 'o5', orderNumber: 'KDM-2026-0105', customerName: 'Lina Kusuma', source: 'whatsapp', fulfillment: 'delivery', status: 'delivered', totalIdr: 410000, paymentStatus: 'paid', paymentMethod: 'transfer', paidAmountIdr: 410000, scheduleDate: today, scheduleTime: '09:00', florist: 'Agus', productName: 'Jana - XL Jana', financeVerified: true } as never),
] })
const start = async () => {
  await initializeBusinessOsStoreBridge()
  await initializeBusinessOsCatalogBridge()
  seed()
  createRoot(document.getElementById('app')!).render(<><UiLanguageBridge /><HomePage initialBranch={(params.get('branch') ?? 'All') as never} /></>)
}
void start()
```

2. Create `apps/os/scripts/__harness-build.mjs`:

```js
import * as esbuild from 'esbuild'
import stylePlugin from 'esbuild-style-plugin'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import { writeFileSync } from 'node:fs'
const out = process.argv[2]
await esbuild.build({
  entryPoints: ['src/__uiHarness.tsx'], outdir: out, entryNames: 'harness', bundle: true, format: 'iife',
  jsx: 'automatic', loader: { '.png': 'file' }, sourcemap: false,
  plugins: [stylePlugin({ postcss: { plugins: [tailwindcss, autoprefixer] } })],
})
writeFileSync(out + '/index.html', '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="harness.css"></head><body><div id="app"></div><script src="harness.js"></script></body></html>')
```

3. Build, delete the harness files, and serve:

```bash
cd apps/os
node scripts/__harness-build.mjs /path/to/scratch/out
rm src/__uiHarness.tsx scripts/__harness-build.mjs   # never commit them
git status --short                                     # must be clean of harness files
cd /path/to/scratch/out && python3 -m http.server 8765
```

4. Drive it with Playwright. In the cloud container, use `/opt/node-tools/node_modules/playwright/index.mjs` and `executablePath: '/opt/pw-browsers/chromium'`.
   - Open `http://localhost:8765/?role=admin&branch=Kedamaian`.
   - Roles are `owner`, `admin`, `finance`, `hr`, `florist`. `branch` is `Kedamaian`, `Pahoman` or omitted for "Semua".
   - Viewports: `{ width: 390, height: 844 }` and `{ width: 1440, height: 900 }`.
   - Use `page.goto(url, { waitUntil: 'domcontentloaded' })`. The full `load` event can hang because external fonts are blocked.
   - On desktop, don't click the branch picker at the top of the sidebar, or its dropdown covers the menu.
   - Some elements use `aria-disabled` (for example a blocked New Order button). Click them with `{ force: true }`.
   - Orders render twice (a phone list and a desktop table). Use `locator('text=… >> visible=true')`.
