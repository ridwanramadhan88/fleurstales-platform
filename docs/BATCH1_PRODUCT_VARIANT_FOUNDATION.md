# Batch 1 — Product Variant Foundation

This batch is intentionally admin/foundation only. Customer checkout and order consumption remain on the existing compatibility path until Batch 2.

## Source of truth

- A size template (for example `Bouquet Standard`) owns reusable child size options.
- Each child size option owns its size-guide image.
- A product variant references the child option by `sizeOptionId` while retaining the customer-facing `size` label for compatibility.
- Price, product photos, availability and flower recipe are variant-specific.
- Product-level photos remain as a legacy fallback during the transition.

## Compatibility

- `product_variants.size_option_id` is nullable so existing variants remain valid.
- `product_images.variant_id` is nullable so existing base galleries remain valid.
- Category-level size-guide image metadata remains readable as a legacy fallback, but new guide images are written on child sizes.
- No storefront/cart/order source-of-truth switch is part of this batch.

## Batch 2 boundary

Batch 2 will select variants on the Storefront, pass `variantId` through cart/checkout, validate price server-side, and snapshot variant name/price/image/recipe into orders for historical correctness.
