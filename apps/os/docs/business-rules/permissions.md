# Permissions — Business Rules

> **Current source of truth:** Admin is branch-limited; Florist access is limited to assigned orders. Scheduling is a real protected AppSection.


See `entities.md` → "Roles & Permissions" for the one-paragraph summary.
This file is the full matrix plus every named exception found in code.

**The foundational fact this entire file sits on top of (see `gap-log.md`
§5): there is no real authentication.** `role` is a plain value in
`userStore.ts`, switchable from the UI with no backend involved. Every
"Required permission" below describes intended access; today it's enforced
only by conditional rendering (`canAccessSection` hides a nav entry,
`canEditSection` disables a control) — never by a request-level guard,
because there is no request yet. A backend implementation must treat this
whole file as the target authorization spec to build, not as a description
of an already-secure system.

---

## Roles

`UserRole = 'owner' | 'admin' | 'finance' | 'hr' | 'florist'`
(`src/store/userStore.ts`)

Display names shown in the UI while auth is mocked (`ROLE_NAMES`): Owner →
"Titi", Admin → "Tito", Finance → "Finance", HR → "Star", Florist →
"Budi". These are placeholder actor names used in order activity
timelines, not real account identities — see `gap-log.md` §5 and §7 (no
durable audit trail, no real user IDs).

**Which roles exist at all is itself owner-editable data**, not a fixed
list: `StaffRoleSettings.roles` in `types/settings.ts` names the assignable
roles in display order, with a separate `defaultRole` and an
`allowOwnerRoleAssignment` safety toggle (off by default, so Owner access
can't be reassigned by accident from the Staff & Roles panel). This is
distinct from `UserRole` the TypeScript union, which is the fixed superset —
`StaffRoleSettings.roles` can only be a subset/reordering of it, never add a
role the type system doesn't know about.

---

## Sections

`AppSection = 'dashboard' | 'orders' | 'stock' | 'catalog' | 'customers' |
'revenue' | 'finance' | 'hr' | 'tv_dashboard' | 'settings'`
(`src/config/permissions.ts`)

`finance` and `hr` are included in the type even though (per the code
comment) they were added ahead of those portals fully shipping — the access
model was designed not to need reshaping later.

## Access levels

`AccessLevel = 'none' | 'view' | 'edit'`

| Level | Meaning |
|---|---|
| `none` | Section hidden entirely — no nav entry, no route |
| `view` | Section visible/readable; **every mutating action must be disabled in the UI** |
| `edit` | Full read/write access |

Two helper functions, both pure lookups against the matrix:
- `canAccessSection(role, section)` → `true` for `view` or `edit`
- `canEditSection(role, section)` → `true` only for `edit`

**Gap:** because there is no backend, "must be disabled in the UI" for
`view` is a per-component discipline, not a structural guarantee. Any new
mutating control added to a `view`-level section must remember to call
`canEditSection` itself — nothing forces this. Worth a lint rule or a shared
wrapper component before backend cutover; tracked as a new gap-log entry
below (§14).

---

## Default access matrix

Source: `DEFAULT_ROLE_SECTION_ACCESS` in `src/config/permissions.ts`. This
is the *default* — the actual live matrix used by the app is
`useSettingsStore.permissions`, seeded from this default and owner-editable
from the Permission Matrix panel (see "Runtime mutability" below).

**Updated 2026-07-10** — two cells changed after a product review of this
file (see decisions below the table):

| Section | Owner | Admin | Finance | HR | Florist |
|---|---|---|---|---|---|
| `dashboard` | edit | edit | edit | view | view |
| `orders` | edit | edit | **view** *(was none)* | none | edit |
| `stock` | edit | edit | view | none | none |
| `catalog` | edit | edit | view | none | none |
| `customers` | edit | edit | view | none | none |
| `revenue` | edit | **view** *(was none)* | view | none | none |
| `finance` | view | **view** *(was none)* | edit | none | none |
| `hr` | view | none | none | edit | none |
| `tv_dashboard` | edit | edit | none | none | none |
| `settings` | edit | none | none | none | none |

### Decisions made 2026-07-10

- **Admin now has read-only (`view`) access to `finance` and `revenue`.**
  Previously `none` on both — Admin was completely blind to money despite
  running full ops (Orders/Stock/Catalog/Customers all `edit`). Decided this
  was accidental compartmentalization rather than intentional, since those
  sections simply didn't exist yet when Admin's row was first written.
  Admin still cannot record, edit, or verify anything financial — `view`
  only.
- **Finance now has read-only (`view`) access to `orders`.** Previously
  `none` — Finance could take consequential actions on specific orders
  (verify, reject, approve a cancellation via the change-request flow)
  without ever being able to see an order's full history/context in the
  general Orders table. Mutating order actions are unaffected by this
  change and still only happen through the verification queue
  (`OrderTransactionVerificationQueue`), gated by `canVerifyOrder` /
  `canResolveChangeRequest` in `orderWorkflowDomain.ts` — not by this
  section grade. See the code comment on the `finance` row in
  `permissions.ts` for the update note.

Notable cells that were **discussed and deliberately left unchanged:**

- **Finance role still has no `orders: edit`** — only `view`. Order
  mutation for Finance stays exclusively in the verification queue; this
  was a deliberate narrowing kept from the original design, not
  reconsidered.
- **Owner defaults to `edit` across Finance and HR.** Detailed Feature Access can still disable individual tools to keep the Owner workflow clean.
- **Florist's `edit` on `orders` is still section-level only, unscoped.**
  Confirmed as a known, real gap rather than resolved here — see "Row-level
  scoping" below, which is now a decided direction, not just a flagged
  concern.

---

## Permission layers

Fleurstales uses two explicit layers:

1. **Section Access** (`none | view | edit`) controls whether a module is hidden, readable, or manageable.
2. **Detailed Feature Access** controls individual actions inside an enabled section.

Owner defaults to edit access across all sections. Detailed features can still be turned off from Settings. Domain rules continue to enforce branch scope, assignment, record locks, and valid workflow states.

The previous Owner Finance named exceptions were removed because they became redundant after Owner Finance and HR were changed to `edit`. Order verification still explicitly permits Finance and Owner in `orderWorkflowDomain.ts`; this is a workflow role rule, not a section-access override.

## Runtime mutability of the permission matrix

**Implementation status:** 🟢 rule logic / 🟡 backend enforcement (none exists)

Unlike the hardcoded role/section constants, the *live* permission matrix is
owner-editable data, not a build-time constant:

- `DEFAULT_ROLE_SECTION_ACCESS` (`config/permissions.ts`) is the fallback/seed value.
- `useSettingsStore.permissions` (`settingsStore.ts`) is the actual matrix the rest of the app reads, via `PermissionMatrix` (`types/settings.ts`).
- Owner edits it through the **Permission Matrix panel** (Settings Center → Permissions), which calls `updateRoleSectionAccess(role, section, level)` per cell or `setPermissions(matrix)` wholesale.

**Required state to edit:** `role === 'owner'` (this panel is itself gated
by the Settings section access — and per Exception 3 above, only Owner can
ever have `edit` on `settings`, so this is self-consistent by construction,
not by an extra check).

**Validation:** `withSettingsSectionGuard` is the only validation applied —
it exclusively protects the `settings` cell. **Nothing prevents Owner from
editing any other cell into a nonsensical state** — e.g. setting their own
`orders` access to `none` (locking themselves out of Orders, recoverable
only by another Owner-role user, if one exists, or a reset), or granting
`employee` `edit` on `finance`. Whether any of these should be additionally
guarded is an open product question — flagged rather than assumed. See
`gap-log.md` §17.

**State changes:** the live matrix remains in the Zustand settings store and
is included in the versioned operational-state snapshot persisted by the local
API/SQLite backend (`operationalPersistence.ts`). A production backend still
needs an explicit permission schema and a policy for invalidating or refreshing
active sessions after Owner changes a role's access.

**Does not:**
- Revoke access from an already-rendered/active session — since there's no
  session concept yet, changing the matrix only affects what renders on the
  *next* read of `useSettingsStore.permissions` (which, being a React store,
  is actually immediate in practice today — but this "immediate" behavior
  is an artifact of everything running in one client process, not a
  designed session-invalidation mechanism a real backend would need to
  replicate).
- Validate that the resulting matrix is non-destructive to the editing Owner's own access, aside from the hardcoded `settings` protection.
- Define production session invalidation/recovery policy beyond the local prototype.

---

## Action: Check whether a role can see a section (navigation gating)

**Implementation status:** 🟢 rule logic / 🟡 enforcement (render-only, no route guard)

**Function:** `canAccessSection(role, section, permissions)`

**Used by:** `DesktopSidebarController.ts`, `BottomTabBarController.ts`,
`Home.tsx` (routing), and individual tab-content controllers (`CatalogTabContentController.ts`,
`HrTabContentController.ts`, `StockTabContentController.ts`, etc.) — each
section's own controller re-checks access rather than trusting that the nav
alone kept an unauthorized user out.

**Required state:** none — pure function of `(role, section, permissions)`.

**Validation:** Falls back to `'none'` for an unrecognized role or section (`getAccessLevel`'s `?? 'none'`) — fails closed, which is the correct default.

**Does not:** Prevent direct navigation to a route by URL if one existed
outside the app's own router (not applicable yet — this is a client-only
SPA with no server-side route protection, since there is no server).

---

## Action: Check whether a role can perform a mutating action within a visible section

**Implementation status:** 🟢 rule logic / 🟡 enforcement (per-component discipline, not structural)

**Function:** `canEditSection(role, section, permissions)`

**Required state:** Section must already be accessible (`view` or `edit`) — `canEditSection` returns `false` for `none` too, but a `none` section shouldn't be rendering the control in the first place.

**Validation:** Same fail-closed default as above.

**Failure conditions:** None thrown — every call site is expected to use the boolean to disable/hide a control, not to block an action after the fact. **There is no enforcement point that runs *after* a mutating action is attempted** — e.g. nothing stops a `view`-only Finance-section component from calling a store action directly if a future code change forgets the `canEditSection` check on a new button. This is the same gap as flagged near the access-matrix table above (§14).

---

## Row-level Orders scoping

**Implemented for the prototype on 2026-07-12.** The section matrix still
expresses the coarse grade (`none | view | edit`), while
`orderAuthorizationDomain.ts` supplies the Orders-specific scope dimension.
It combines section access with authenticated actor identity, employment
branch, `floristAssignedEmployeeId`, and `adminHandledEmployeeId` (the latter is attribution-only, not row-scoping — see `orders.md`).

The resulting policy is:

- Owner and Finance retain intentional cross-branch visibility.
- Admin is restricted to the employment branch.
- Florist is restricted to orders assigned to that employee ID.
- HR has no Orders section access.

`canViewOrder` protects row queries and `authorizeOrderMutation` is called by
all sensitive Orders store commands. This means a new UI button cannot bypass
the policy merely by calling a store action directly. The browser remains a
demo trust boundary: production endpoints must derive actor claims from the
authenticated session and apply the same scope in the database query.

## Cross-references

- Order-level Finance permission exceptions in full: `finance.md`
- Foundational "no real auth" gap and its downstream effects: `gap-log.md` §5
- New gaps introduced by this file: §14–§17 below (added to `gap-log.md`)
