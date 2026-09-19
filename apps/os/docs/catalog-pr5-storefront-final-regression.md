# Catalog PR 5 — Storefront Integration & Final Regression

## Purpose

Final Catalog integration pass after PR #85–#89. This PR makes the customer Storefront consume the
same stable variant identity and Size Template rules enforced by Business OS and the server.

## Storefront sellability

Customer-facing Product data is projected from the internal Catalog before rendering.

A variant is Storefront-sellable when:
- its status is `active`; and
- if it has no `sizeOptionId`, it remains sellable as a legacy unlinked variant; or
- if it has a `sizeOptionId`, that stable child ID exists and is active in the Product's effective Size Template.

An active linked variant whose child no longer belongs to the effective template is treated as
**needs review** and is excluded from Storefront purchase surfaces. Business OS keeps the row intact.

This is the final D4 behavior used by PR 5: review-required linked variants remain preserved internally
but are not customer-purchasable until staff resolves the stable size assignment.

Products with no Storefront-sellable variants are excluded from customer listings and direct Product routes.

## Variant-specific customer data

- Variant price changes with the selected variant.
- Variant-owned photos are authoritative when present.
- Base Product photos remain the compatibility fallback when a variant has no photos.
- Cart and checkout review keep the selected variant photo.
- Product cards and Product pages receive only Storefront-sellable variants, so displayed "From" pricing
  cannot be driven by an inactive or needs-review variant.

## Size Guide identity

Customer Size Guide resolution is stable-ID only:
- resolve the Product's explicit Product assignment first, then Arrangement Type default;
- resolve the selected variant by `sizeOptionId`;
- show only that child size's guide image;
- never infer a child from the display label;
- never silently fall back to an unrelated template or parent guide image.

Legacy unlinked variants stay sellable but do not receive a guessed child Size Guide.

## Recipe and Cost privacy

Storefront projection strips:
- `cost`
- `flowerRecipe`

The dedicated Product page and the older Product detail surface no longer render flower recipes.
Order-time `flowerRecipeSnapshot` remains internal production data and is unchanged by this PR.

## Shared-data parity

The OS and Storefront local shared Catalog adapters now round-trip:
- stable `sizeOptionId`
- variant-owned photos
- Cost where the internal snapshot is authorized to contain it
- internal flower recipe data

This prevents local/demo/export-import workflows from silently losing stable variant identity.

## Production read-only audit before PR 5

No production mutation was performed.

- Products: 174 (174 active)
- Variants: 177 (174 active, 3 inactive)
- Stable Size links: 0 linked, 177 unlinked
- Product images: 174
- Variant-owned images: 0
- Size Template targets: 172 Product-scoped
- Size Templates:
  - Bouquet Standard: 4 child sizes, 0 child guide images
  - Giant Flower: 0 child sizes

Therefore this PR makes the runtime integration correct without auto-linking historical variants or
inventing variant photos/child guides. Those records must be configured explicitly in Catalog.

## Final regression gate

PR 5 requires full CI:
- Business OS full check
- Storefront full check
- Global contracts
- Full Supabase database gate
- shared parity
- i18n parity
- Supabase security
- final CI gate

No production migration or data mutation is applied manually by this PR.
