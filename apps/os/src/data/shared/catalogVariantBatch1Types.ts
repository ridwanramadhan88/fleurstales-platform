import type { CatalogProductImage } from '../../store/catalogStoreTypes'

declare module './contracts' {
  interface SharedProductVariant {
    /** Stable reusable child-size identity. Optional for legacy rows. */
    sizeOptionId?: string
    /** Variant-owned images; base product images remain on SharedProduct.images. */
    images?: SharedProductImage[]
  }

  interface SharedProductImage {
    /** Null/undefined means the base product gallery. */
    variantId?: string
  }

  interface SharedProductImageMetadataInput {
    /** Null/undefined means the base product gallery. */
    variantId?: string
  }
}

declare module './databaseTypes' {
  interface ProductVariantRow {
    size_option_id?: string | null
  }

  interface ProductImageRow {
    variant_id?: string | null
  }
}

export {}
