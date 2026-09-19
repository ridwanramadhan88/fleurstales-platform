# Catalog PR 3 — Size Template UI/UX

## Scope

PR 3 turns the existing Size Guide manager into an explicit Size Template workflow built around reusable child sizes, guide images, Arrangement Type defaults, and exceptional Product-specific assignments.

## Production audit before implementation

Read-only production checks before this PR found:

- 2 Size Templates.
- `Bouquet Standard`: Small, Medium, Large, XL.
- `Giant Flower`: no child sizes yet.
- 172 Size Template targets.
- all 172 existing targets are Product-specific.
- 0 Arrangement Type default targets.
- 177 Product variants still have `size_option_id IS NULL`.
- 0 Product variants currently have a stable `size_option_id`.

This PR does not auto-link those historical variants and does not rewrite the 172 Product assignments into Arrangement Type defaults.

## Manager behavior

### Template & ukuran

The manager supports:

- create Template,
- rename Template,
- delete unused Template,
- create child size,
- rename child size without changing its stable ID,
- archive child size,
- reactivate archived child size,
- one guide image per child size,
- linked-variant and sellable-variant usage indicators.

A Template cannot be deleted while it has an assignment or while any historical variant references one of its child IDs.

A child size can be archived only when no active/sellable variant references that stable size ID. Inactive historical variants may keep their reference.

### Penetapan

The source list for Arrangement Types is the canonical `arrangementTypes` registry, not a list inferred from Products. This lets a new Arrangement Type receive its default Size Template before any Product uses that type.

The UI separates:

- default Template per **Jenis rangkaian**,
- optional Product-specific Template,
- effective Template for the selected Product.

Removing a Product-specific Template returns the Product to its Arrangement Type default. If neither exists, the effective state is explicitly **Belum ada template ukuran**; there is no silent fallback.

## Draft and save behavior

Opening the manager creates a local draft of Templates and assignments.

Until **Simpan perubahan** is selected:

- global Catalog state is unchanged,
- guide-image binaries are not uploaded,
- closing the manager can discard the entire draft,
- browser reload/navigation receives an unsaved-change guard.

If the remote Size Template source changes while the manager is open, the local draft is not overwritten and Save is blocked until the manager is reopened from the current source.

## Remote persistence

Remote Save sends the draft directly through the Size Template repository rather than first mutating global state.

Guide-image binaries receive new unique Storage object paths when they are uploaded. If database replacement fails, those newly uploaded objects are removed best-effort.

After the database commit succeeds, removal of obsolete old Storage objects is best-effort. A cleanup failure cannot turn committed Size Template metadata into a reported failed save.

Successful persistence rehydrates the committed Size Template library and guide URLs into local Catalog state.

Local/demo mode retains the existing non-Supabase draft commit path.

## Arrangement Type manager

User-facing Arrangement Type management is Indonesian, mobile full-screen, and now shows the current default Size Template for each type.

Rename continues to update:

- the canonical Arrangement Type registry,
- Products using that type,
- Arrangement Type Size Template targets.

Deletion remains blocked while Products use the type.

## Verification

Required before merge:

- Global contracts
- shared OS/Storefront parity
- i18n checks
- Business OS full `npm run check`
- Storefront full `npm run check`
- Full Supabase migration replay and SQL smoke tests
- final CI gate

No production database mutation is performed manually by this PR.
