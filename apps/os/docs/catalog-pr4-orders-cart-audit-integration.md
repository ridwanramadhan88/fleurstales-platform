# Catalog PR 4 — Orders, Cart, Audit & Permission Integration

## Scope

This PR integrates Catalog lifecycle rules with historical Orders, Storefront cart safety,
authoritative audit history, and the configured permission matrix.

## Historical Order safety

- Ordered Product and variant rows are archived instead of hard-deleted.
- Archived Catalog rows stay out of current Catalog hydration.
- Existing Order item Product, variant, unit-price, and flower-recipe snapshots remain unchanged
  while the ordered variant identity is unchanged.
- Inactive and archived historical variants may retain a stable Size Template child identity.

## Cart behavior

Storefront cart lines are revalidated against the current Catalog before checkout.

Checkout is blocked when:
- the Product is no longer active,
- the selected variant is inactive or missing,
- the linked Size Template child is archived,
- or an Arrangement Type / Size Template change makes the linked stable size incompatible.

Legacy variants without a stable `sizeOptionId` remain supported and are never auto-linked.

## Audit

Authoritative server audit records cover:
- Product active/archive status,
- variant price/status/stable-size/archive changes,
- variant Cost changes,
- Size Template assignment changes.

Owner audit hydration preserves before/after state.

## Permissions

Regression coverage keeps the Catalog and Orders role-family boundaries aligned between
the OS configuration and the authoritative server registry.

## Verification gate

The merge gate for this PR is a full CI run including:
- Business OS full check,
- Storefront full check,
- Global contracts,
- full Supabase database gate,
- shared parity,
- i18n parity,
- Supabase security checks.
