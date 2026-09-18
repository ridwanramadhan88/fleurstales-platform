# Catalog PR 1A — Production Data Safety Audit

**Project:** FleursTales Production  
**Supabase project:** `yuwwopehfkcuzpoiiwwc`  
**Audit type:** read-only production queries  
**Purpose:** verify data safety before removing silent Size Template fallback and enforcing one variant per stable size identity.

## Summary

| Check | Result |
|---|---:|
| Products | 174 |
| Product variants | 177 |
| Explicit product Size Template targets | 172 |
| Explicit Arrangement Type targets | 0 |
| Fallback-dependent products | 2 |
| Variants with `size_option_id` | 0 |
| Variants without `size_option_id` | 177 |
| Duplicate non-null `size_option_id` per product | 0 |
| Invalid/archived stable size references | 0 detectable, because no production variant has a stable size id yet |

## Fallback-dependent products found

Before PR 1A, these products could appear to use the default template only because the UI silently fell back to the default template:

| Product code | Product | Arrangement Type |
|---|---|---|
| `BDY-000139` | Vase - Clay Vase | Box, Basket & Vase |
| `CON-000007` | Jana- Large Jana | Box, Basket & Vase |

Their current variant labels are historical free-text values:

- `BDY-000139`: `Large · Pink`
- `CON-000007`: `Large · Pink,Blue,Purple`

Both variants currently have `size_option_id = null`.

## Backfill decision

PR 1A adds a one-time migration that converts every product that would otherwise depend on the old silent fallback into an **explicit product-level assignment** to the same `Bouquet Standard` template.

This is intentionally product-level rather than an Arrangement Type default. It preserves existing behavior without declaring that every future `Box, Basket & Vase` product must use `Bouquet Standard`.

The migration has a postcondition and fails if any product present at migration time remains fallback-dependent.

## Stable size identity finding

All 177 production variants are still legacy/unlinked rows with `size_option_id = null`.

Therefore:

- no existing production row violates the new unique stable-size rule,
- PR 1A must **not** auto-link or rewrite those variants,
- the Product Editor redesign must keep unlinked variants visible and preserve them unchanged,
- linking legacy variants to template sizes remains an explicit later workflow.

## Canonical archive rule

PR 1A uses this rule consistently in the Business OS store and UI:

> A template size cannot be archived while a **sellable/active variant with the same `size_option_id`** references it.

Inactive/historical variants may continue referencing an archived size.

Legacy variants with `size_option_id = null` are not treated as linked merely because their free-text label happens to match a template size name.

## Non-PR finding

The production schema advisor also reports Row Level Security disabled on:

- `public.finance_periods`
- `public.finance_period_actions`

This is outside Catalog PR 1A and is not modified by this PR. It should be handled separately with the appropriate Finance policies rather than enabling RLS without policies.
