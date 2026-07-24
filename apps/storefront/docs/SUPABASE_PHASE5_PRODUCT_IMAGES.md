# Phase 5 — Product images and Storage-ready local flow

Phase 5 intentionally does **not** require a live Supabase project. Both builds now use the same canonical product-image metadata and the same future Storage object-key rules.

## Canonical image model

A Catalog product may contain up to six ordered images. The first image is always primary and therefore the Storefront thumbnail.

Each image carries:

- stable image ID
- current render URL (local data URL before upload, public Storage URL after upload)
- future `product-images` Storage path when known
- alt text
- sort order / primary flag
- MIME type
- byte size
- width / height

The old `thumbnail` and `gallery` strings remain derived compatibility aliases so existing persisted snapshots can still load during the transition.

## Local processing

The Business OS editor:

1. accepts a source image up to 10 MB;
2. requires a 1:1 crop;
3. exports an 800 × 800 JPEG;
4. compresses to at most 100 KB;
5. gives the image a stable ID;
6. derives the future Storage path `<product-id>/<image-id>.jpg` once the product has an internal ID.

`buildCatalogImageStoragePlan()` can be run without Supabase. It produces the exact future metadata payload and any pending Blob uploads.

## Storefront resolution

Storefront product cards, product detail galleries, cart rows and review rows now resolve media in this order:

1. canonical `product.images`;
2. legacy `thumbnail` / `gallery` aliases;
3. bundled placeholder photography.

The bundled random photos are therefore fallback presentation only, not authoritative Catalog data.

## Future live Storage adapter

When a Supabase project is attached, `syncCatalogProductImagesToRemote()` is ready to:

1. upload pending JPEG blobs to `product-images`;
2. atomically replace product-image metadata through `replace_product_images_metadata`;
3. preserve Catalog revision/conflict checks;
4. remove Storage objects no longer referenced by the product;
5. clean up newly-uploaded orphan files on a failed metadata transaction where possible.

The migration `20260724164006_product_images.sql` adds image dimensions/size/MIME metadata, a Storage SELECT policy required for authenticated delete operations, and the image metadata replacement RPC.

## Current authority

Local Catalog persistence remains authoritative until a real Supabase project is connected and verified. Phase 5 prepares the process and contracts; it does not claim live cross-app image synchronization.
