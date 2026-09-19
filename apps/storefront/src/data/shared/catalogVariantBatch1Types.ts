declare module './contracts' {
  interface SharedProductVariant {
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
  interface ProductImageRow {
    variant_id?: string | null
  }
}

export {}
