import type { CatalogCategoryConfig, CatalogProduct } from './catalogStoreTypes'

/** Final occasion categories derived only from Fleurs Catalog - All Products.csv. */
export const SEED_CATEGORIES: CatalogCategoryConfig[] = [
  {
    id: "cat_birthday",
    name: "Birthday",
    prefix: "BDY"
  },
  {
    id: "cat_anniversary",
    name: "Anniversary",
    prefix: "ANN"
  },
  {
    id: "cat_general_gifting",
    name: "General Gifting",
    prefix: "GFT"
  },
  {
    id: "cat_condolence",
    name: "Condolence",
    prefix: "CDL"
  },
  {
    id: "cat_congratulations",
    name: "Congratulations",
    prefix: "CON"
  },
  {
    id: "cat_graduation",
    name: "Graduation",
    prefix: "GRD"
  },
  {
    id: "cat_wedding",
    name: "Wedding",
    prefix: "WED"
  }
]

/** Final catalog rebuilt only from the approved CSV. Dummy images remain UI fallbacks and are not stored as products. */
export const SEED_PRODUCTS: CatalogProduct[] = [
  {
    "id": "catalog_petite_rainbow_001",
    "productId": "BDY-000001",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Petite Rainbow",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_petite_rainbow_001_variant_1",
        "sku": "BDY-ART-PETITE_R-SMALL-001",
        "size": "Small",
        "price": 175000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_pink_lily_002",
    "productId": "BDY-000002",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Pink Lily",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pink_lily_002_variant_1",
        "sku": "BDY-ART-PINK_LIL-SMALL-001",
        "size": "Small",
        "price": 110000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_single_artifical_003",
    "productId": "BDY-000003",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Single Artificial",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_single_artifical_003_variant_1",
        "sku": "BDY-ART-SINGLE_A-SMALL-001",
        "size": "Small",
        "price": 27000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_three_sun_004",
    "productId": "BDY-000004",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Three Sun",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_three_sun_004_variant_1",
        "sku": "BDY-ART-THREE_SU-SMALL-001",
        "size": "Small",
        "price": 85000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_peach_sun_005",
    "productId": "BDY-000005",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Peach Sun",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_peach_sun_005_variant_1",
        "sku": "BDY-ART-PEACH_SU-SMALL-001",
        "size": "Small",
        "price": 135000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_tulip_news_006",
    "productId": "BDY-000006",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Tulip News",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_tulip_news_006_variant_1",
        "sku": "BDY-ART-TULIP_NE-SMALL-001",
        "size": "Small",
        "price": 175000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_petite_pastel_007",
    "productId": "BDY-000007",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Petite Pastel",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_petite_pastel_007_variant_1",
        "sku": "BDY-ART-PETITE_P-SMALL-001",
        "size": "Small",
        "price": 90000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_4_tulips_bb_008",
    "productId": "BDY-000008",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "4 Tulips BB",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_4_tulips_bb_008_variant_1",
        "sku": "BDY-ART-4_TULIPS-SMALL-001",
        "size": "Small",
        "price": 150000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_3_tulips_009",
    "productId": "BDY-000009",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "3 Tulips",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_3_tulips_009_variant_1",
        "sku": "BDY-ART-3_TULIPS-SMALL-001",
        "size": "Small",
        "price": 75000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_peony_coquette_010",
    "productId": "BDY-000010",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Peony Coquette",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_peony_coquette_010_variant_1",
        "sku": "BDY-ART-PEONY_CO-MEDIUM-001",
        "size": "Medium",
        "price": 275000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_rose_crepe_011",
    "productId": "BDY-000011",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Rose Crepe",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rose_crepe_011_variant_1",
        "sku": "BDY-ART-ROSE_CRE-MEDIUM-001",
        "size": "Medium",
        "price": 400000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_versachee_012",
    "productId": "BDY-000012",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Versachee",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_versachee_012_variant_1",
        "sku": "BDY-ART-VERSACHE-MEDIUM-001",
        "size": "Medium",
        "price": 325000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": true,
    "isCustomizable": false
  },
  {
    "id": "catalog_regal_roses_013",
    "productId": "BDY-000013",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Regal Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_regal_roses_013_variant_1",
        "sku": "BDY-ART-REGAL_RO-MEDIUM-001",
        "size": "Medium",
        "price": 275000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_nude_014",
    "productId": "BDY-000014",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Classic Nude",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_nude_014_variant_1",
        "sku": "BDY-ART-CLASSIC_-MEDIUM-001",
        "size": "Medium",
        "price": 325000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_ortega_l_015",
    "productId": "BDY-000015",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Ortega L",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_ortega_l_015_variant_1",
        "sku": "BDY-ART-ORTEGA_L-MEDIUM-001",
        "size": "Medium",
        "price": 400000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_med_blue_016",
    "productId": "BDY-000016",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Med Blue",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_med_blue_016_variant_1",
        "sku": "BDY-ART-MED_BLUE-MEDIUM-001",
        "size": "Medium",
        "price": 300000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_jute_soiree_blue_017",
    "productId": "BDY-000017",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Jute Soiree Blue",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_jute_soiree_blue_017_variant_1",
        "sku": "BDY-ART-JUTE_SOI-MEDIUM-001",
        "size": "Medium",
        "price": 350000,
        "status": "active"
      },
      {
        "id": "catalog_jute_soiree_blue_017_variant_2",
        "sku": "BDY-ART-JUTE_SOI-LARGE-002",
        "size": "Large",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_ortega_blue_018",
    "productId": "BDY-000018",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Ortega Blue",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_ortega_blue_018_variant_1",
        "sku": "BDY-ART-ORTEGA_B-MEDIUM-001",
        "size": "Medium",
        "price": 250000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_peony_lily_019",
    "productId": "BDY-000019",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Peony Lily",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_peony_lily_019_variant_1",
        "sku": "BDY-ART-PEONY_LI-MEDIUM-001",
        "size": "Medium",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pink_aurora_020",
    "productId": "BDY-000020",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Pink Aurora",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pink_aurora_020_variant_1",
        "sku": "BDY-ART-PINK_AUR-MEDIUM-001",
        "size": "Medium",
        "price": 395000,
        "status": "active"
      },
      {
        "id": "catalog_pink_aurora_020_variant_2",
        "sku": "BDY-ART-PINK_AUR-LARGE-002",
        "size": "Large",
        "price": 395000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pinky_anthu_021",
    "productId": "BDY-000021",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Pinky Anthu",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pinky_anthu_021_variant_1",
        "sku": "BDY-ART-PINKY_AN-MEDIUM-001",
        "size": "Medium",
        "price": 275000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_jute_soiree_pink_022",
    "productId": "BDY-000022",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Jute Soiree Pink",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_jute_soiree_pink_022_variant_1",
        "sku": "BDY-ART-JUTE_SOI-MEDIUM-003",
        "size": "Medium",
        "price": 350000,
        "status": "active"
      },
      {
        "id": "catalog_jute_soiree_pink_022_variant_2",
        "sku": "BDY-ART-JUTE_SOI-LARGE-004",
        "size": "Large",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_ortega_peach_023",
    "productId": "BDY-000023",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Ortega Peach",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_ortega_peach_023_variant_1",
        "sku": "BDY-ART-ORTEGA_P-MEDIUM-001",
        "size": "Medium",
        "price": 250000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_honey_024",
    "productId": "BDY-000024",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Honey",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_honey_024_variant_1",
        "sku": "BDY-ART-HONEY-MEDIUM-001",
        "size": "Medium",
        "price": 250000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_med_lily_series_in_maroon_025",
    "productId": "BDY-000025",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Med Lily Series",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Med Lily Series - In Maroon",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_med_lily_series_in_maroon_025_variant_1",
        "sku": "BDY-ART-IN_MAROO-MEDIUM-001",
        "size": "Medium",
        "price": 195000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_med_lily_series_in_pink_026",
    "productId": "BDY-000026",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Med Lily Series",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Med Lily Series - In Pink",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_med_lily_series_in_pink_026_variant_1",
        "sku": "BDY-ART-IN_PINK-MEDIUM-001",
        "size": "Medium",
        "price": 195000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_med_lily_series_in_blue_027",
    "productId": "BDY-000027",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Med Lily Series",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Med Lily Series - In blue",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_med_lily_series_in_blue_027_variant_1",
        "sku": "BDY-ART-IN_BLUE-MEDIUM-001",
        "size": "Medium",
        "price": 195000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_blue_soiree_028",
    "productId": "BDY-000028",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Blue Soiree",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_blue_soiree_028_variant_1",
        "sku": "BDY-ART-BLUE_SOI-LARGE-001",
        "size": "Large",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_purple_soiree_029",
    "productId": "BDY-000029",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Purple Soiree",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_purple_soiree_029_variant_1",
        "sku": "BDY-ART-PURPLE_S-LARGE-001",
        "size": "Large",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rose_love_030",
    "productId": "BDY-000030",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Rose Love",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rose_love_030_variant_1",
        "sku": "BDY-ART-ROSE_LOV-LARGE-001",
        "size": "Large",
        "price": 550000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_black_soiree_031",
    "productId": "BDY-000031",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Black Soiree",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_black_soiree_031_variant_1",
        "sku": "BDY-ART-BLACK_SO-LARGE-001",
        "size": "Large",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_lily_bit_032",
    "productId": "BDY-000032",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Lily Bit",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_lily_bit_032_variant_1",
        "sku": "BDY-ART-LILY_BIT-LARGE-001",
        "size": "Large",
        "price": 475000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_white_cherrie_033",
    "productId": "BDY-000033",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "White Cherrie",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_white_cherrie_033_variant_1",
        "sku": "BDY-ART-WHITE_CH-LARGE-001",
        "size": "Large",
        "price": 450000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pink_soiree_034",
    "productId": "BDY-000034",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Pink Soiree",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pink_soiree_034_variant_1",
        "sku": "BDY-ART-PINK_SOI-LARGE-001",
        "size": "Large",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_maroon_grande_035",
    "productId": "BDY-000035",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Maroon Grande",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_maroon_grande_035_variant_1",
        "sku": "BDY-ART-MAROON_G-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1250000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_bop_036",
    "productId": "BDY-000036",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "BOP",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_bop_036_variant_1",
        "sku": "BDY-ART-BOP-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1650000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_maroon_xl_037",
    "productId": "BDY-000037",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Maroon XL",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_maroon_xl_037_variant_1",
        "sku": "BDY-ART-MAROON_X-HUMAN_SI-001",
        "size": "Human Size",
        "price": 775000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pink_grande_038",
    "productId": "BDY-000038",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Pink Grande",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pink_grande_038_variant_1",
        "sku": "BDY-ART-PINK_GRA-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1200000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_150_roses_039",
    "productId": "BDY-000039",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "150 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_150_roses_039_variant_1",
        "sku": "BDY-ART-150_ROSE-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1800000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rainbow_xxl_040",
    "productId": "BDY-000040",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Rainbow XXL",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rainbow_xxl_040_variant_1",
        "sku": "BDY-ART-RAINBOW_-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1100000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_jute_soiree_xl_041",
    "productId": "BDY-000041",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Jute Soiree XL",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_jute_soiree_xl_041_variant_1",
        "sku": "BDY-ART-JUTE_SOI-HUMAN_SI-001",
        "size": "Human Size",
        "price": 550000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_100_roses_042",
    "productId": "BDY-000042",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "100 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_100_roses_042_variant_1",
        "sku": "BDY-ART-100_ROSE-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1250000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_single_rose_043",
    "productId": "BDY-000043",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - Single Rose",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_single_rose_043_variant_1",
        "sku": "BDY-FRE-SINGLE_R-SMALL-001",
        "size": "Small",
        "price": 45000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_double_rose_044",
    "productId": "BDY-000044",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - Double Rose",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_double_rose_044_variant_1",
        "sku": "BDY-FRE-DOUBLE_R-SMALL-001",
        "size": "Small",
        "price": 90000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_5_roses_045",
    "productId": "BDY-000045",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 5 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_5_roses_045_variant_1",
        "sku": "BDY-FRE-5_ROSES-SMALL-001",
        "size": "Small",
        "price": 155000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_8_roses_046",
    "productId": "BDY-000046",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 8 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_8_roses_046_variant_1",
        "sku": "BDY-FRE-8_ROSES-SMALL-001",
        "size": "Small",
        "price": 200000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_10_roses_047",
    "productId": "BDY-000047",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 10 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_10_roses_047_variant_1",
        "sku": "BDY-FRE-10_ROSES-MEDIUM-001",
        "size": "Medium",
        "price": 250000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_12_roses_048",
    "productId": "BDY-000048",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 12 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_12_roses_048_variant_1",
        "sku": "BDY-FRE-12_ROSES-MEDIUM-001",
        "size": "Medium",
        "price": 280000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_15_roses_049",
    "productId": "BDY-000049",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 15 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_15_roses_049_variant_1",
        "sku": "BDY-FRE-15_ROSES-MEDIUM-001",
        "size": "Medium",
        "price": 325000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_20_roses_050",
    "productId": "BDY-000050",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 20 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_20_roses_050_variant_1",
        "sku": "BDY-FRE-20_ROSES-MEDIUM-001",
        "size": "Medium",
        "price": 380000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_30_roses_051",
    "productId": "BDY-000051",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 30 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_30_roses_051_variant_1",
        "sku": "BDY-FRE-30_ROSES-LARGE-001",
        "size": "Large",
        "price": 525000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_50_roses_052",
    "productId": "BDY-000052",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 50 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_50_roses_052_variant_1",
        "sku": "BDY-FRE-50_ROSES-LARGE-001",
        "size": "Large",
        "price": 775000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_80_roses_053",
    "productId": "BDY-000053",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 80 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_80_roses_053_variant_1",
        "sku": "BDY-FRE-80_ROSES-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1000000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_100_roses_054",
    "productId": "BDY-000054",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 100 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_100_roses_054_variant_1",
        "sku": "BDY-FRE-100_ROSE-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_rose_150_roses_055",
    "productId": "BDY-000055",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Classic Rose",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Rose - 150 Roses",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_classic_rose_150_roses_055_variant_1",
        "sku": "BDY-FRE-150_ROSE-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1800000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_single_lily_056",
    "productId": "BDY-000056",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Single Lily",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_single_lily_056_variant_1",
        "sku": "BDY-FRE-SINGLE_L-SMALL-001",
        "size": "Small",
        "price": 200000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pink_garbera_057",
    "productId": "BDY-000057",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Pink Gerbera",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pink_garbera_057_variant_1",
        "sku": "BDY-FRE-PINK_GAR-SMALL-001",
        "size": "Small",
        "price": 135000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_lady_aster_058",
    "productId": "BDY-000058",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Lady Aster",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_lady_aster_058_variant_1",
        "sku": "BDY-FRE-LADY_AST-SMALL-001",
        "size": "Small",
        "price": 135000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_posy_holo_059",
    "productId": "BDY-000059",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Posy Holo",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_posy_holo_059_variant_1",
        "sku": "BDY-FRE-POSY_HOL-SMALL-001",
        "size": "Small",
        "price": 200000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_posy_peachy_060",
    "productId": "BDY-000060",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Posy Peachy",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_posy_peachy_060_variant_1",
        "sku": "BDY-FRE-POSY_PEA-SMALL-001",
        "size": "Small",
        "price": 150000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_blue_hydra_061",
    "productId": "BDY-000061",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Blue Hydra",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_blue_hydra_061_variant_1",
        "sku": "BDY-FRE-BLUE_HYD-SMALL-001",
        "size": "Small",
        "price": 130000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_double_aster_062",
    "productId": "BDY-000062",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Double Aster",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_double_aster_062_variant_1",
        "sku": "BDY-FRE-DOUBLE_A-SMALL-001",
        "size": "Small",
        "price": 145000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_tulip_jute_063",
    "productId": "BDY-000063",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Tulip Jute",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_tulip_jute_063_variant_1",
        "sku": "BDY-FRE-TULIP_JU-MEDIUM-001",
        "size": "Medium",
        "price": 550000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_5_sun_flower_064",
    "productId": "BDY-000064",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "5 Sun Flower",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_5_sun_flower_064_variant_1",
        "sku": "BDY-FRE-5_SUN_FL-MEDIUM-001",
        "size": "Medium",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rose_crepe_065",
    "productId": "BDY-000065",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rose Crepe",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rose_crepe_065_variant_1",
        "sku": "BDY-FRE-ROSE_CRE-MEDIUM-001",
        "size": "Medium",
        "price": 325000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rose_flag_066",
    "productId": "BDY-000066",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rose Flag",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rose_flag_066_variant_1",
        "sku": "BDY-FRE-ROSE_FLA-MEDIUM-001",
        "size": "Medium",
        "price": 310000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_sage_daisy_067",
    "productId": "BDY-000067",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Sage Daisy",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_sage_daisy_067_variant_1",
        "sku": "BDY-FRE-SAGE_DAI-MEDIUM-001",
        "size": "Medium",
        "price": 260000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_holo_hydra_068",
    "productId": "BDY-000068",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Holo Hydra",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_holo_hydra_068_variant_1",
        "sku": "BDY-FRE-HOLO_HYD-MEDIUM-001",
        "size": "Medium",
        "price": 300000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_lily_bit_069",
    "productId": "BDY-000069",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Lily Bit",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_lily_bit_069_variant_1",
        "sku": "BDY-FRE-LILY_BIT-MEDIUM-001",
        "size": "Medium",
        "price": 460000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_for_love_070",
    "productId": "BDY-000070",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "For Love",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_for_love_070_variant_1",
        "sku": "BDY-FRE-FOR_LOVE-MEDIUM-001",
        "size": "Medium",
        "price": 375000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_tulip_on_top_071",
    "productId": "BDY-000071",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Tulip on Top",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_tulip_on_top_071_variant_1",
        "sku": "BDY-FRE-TULIP_ON-MEDIUM-001",
        "size": "Medium",
        "price": 310000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_nude_garden_072",
    "productId": "BDY-000072",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Nude Garden",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_nude_garden_072_variant_1",
        "sku": "BDY-FRE-NUDE_GAR-MEDIUM-001",
        "size": "Medium",
        "price": 340000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pinacolada_073",
    "productId": "BDY-000073",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Pinacolada",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pinacolada_073_variant_1",
        "sku": "BDY-FRE-PINACOLA-MEDIUM-001",
        "size": "Medium",
        "price": 255000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pinky_promise_074",
    "productId": "BDY-000074",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Pinky Promise",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pinky_promise_074_variant_1",
        "sku": "BDY-FRE-PINKY_PR-MEDIUM-001",
        "size": "Medium",
        "price": 310000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_double_lily_075",
    "productId": "BDY-000075",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Double Lily",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_double_lily_075_variant_1",
        "sku": "BDY-FRE-DOUBLE_L-MEDIUM-001",
        "size": "Medium",
        "price": 325000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pretty_in_pink_076",
    "productId": "BDY-000076",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Pretty in Pink",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pretty_in_pink_076_variant_1",
        "sku": "BDY-FRE-PRETTY_I-MEDIUM-001",
        "size": "Medium",
        "price": 210000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_for_u_077",
    "productId": "BDY-000077",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "For U",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_for_u_077_variant_1",
        "sku": "BDY-FRE-FOR_U-MEDIUM-001",
        "size": "Medium",
        "price": 330000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_sea_blue_078",
    "productId": "BDY-000078",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Sea Blue",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_sea_blue_078_variant_1",
        "sku": "BDY-FRE-SEA_BLUE-MEDIUM-001",
        "size": "Medium",
        "price": 255000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_med_hydra_079",
    "productId": "BDY-000079",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Med Hydra",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_med_hydra_079_variant_1",
        "sku": "BDY-FRE-MED_HYDR-MEDIUM-001",
        "size": "Medium",
        "price": 230000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_mad_g_080",
    "productId": "BDY-000080",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Mad G",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_mad_g_080_variant_1",
        "sku": "BDY-FRE-MAD_G-MEDIUM-001",
        "size": "Medium",
        "price": 165000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rose_radiance_081",
    "productId": "BDY-000081",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rose Radiance",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rose_radiance_081_variant_1",
        "sku": "BDY-FRE-ROSE_RAD-LARGE-001",
        "size": "Large",
        "price": 510000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_lily_tulip_082",
    "productId": "BDY-000082",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Lily Tulip",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_lily_tulip_082_variant_1",
        "sku": "BDY-FRE-LILY_TUL-LARGE-001",
        "size": "Large",
        "price": 775000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_mamba_sunflower_083",
    "productId": "BDY-000083",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Mamba Sunflower",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_mamba_sunflower_083_variant_1",
        "sku": "BDY-FRE-MAMBA_SU-LARGE-001",
        "size": "Large",
        "price": 675000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_midnight_moon_084",
    "productId": "BDY-000084",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Midnight Moon",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_midnight_moon_084_variant_1",
        "sku": "BDY-FRE-MIDNIGHT-LARGE-001",
        "size": "Large",
        "price": 550000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pink_orchid_085",
    "productId": "BDY-000085",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Pink Orchid",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pink_orchid_085_variant_1",
        "sku": "BDY-FRE-PINK_ORC-LARGE-001",
        "size": "Large",
        "price": 625000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_lilac_love_086",
    "productId": "BDY-000086",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Lilac Love",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_lilac_love_086_variant_1",
        "sku": "BDY-FRE-LILAC_LO-LARGE-001",
        "size": "Large",
        "price": 700000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_tulip_garden_087",
    "productId": "BDY-000087",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Tulip Garden",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_tulip_garden_087_variant_1",
        "sku": "BDY-FRE-TULIP_GA-LARGE-001",
        "size": "Large",
        "price": 700000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_grande_aster_088",
    "productId": "BDY-000088",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Grande Aster",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_grande_aster_088_variant_1",
        "sku": "BDY-FRE-GRANDE_A-LARGE-001",
        "size": "Large",
        "price": 250000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rose_lily_089",
    "productId": "BDY-000089",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rose Lily",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rose_lily_089_variant_1",
        "sku": "BDY-FRE-ROSE_LIL-LARGE-001",
        "size": "Large",
        "price": 375000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_navy_orchid_090",
    "productId": "BDY-000090",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Navy Orchid",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_navy_orchid_090_variant_1",
        "sku": "BDY-FRE-NAVY_ORC-HUMAN_SI-001",
        "size": "Human Size",
        "price": 925000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_lily_wine_091",
    "productId": "BDY-000091",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Lily Wine",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_lily_wine_091_variant_1",
        "sku": "BDY-FRE-LILY_WIN-HUMAN_SI-001",
        "size": "Human Size",
        "price": 575000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rose_orchid_092",
    "productId": "BDY-000092",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rose Orchid",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rose_orchid_092_variant_1",
        "sku": "BDY-FRE-ROSE_ORC-HUMAN_SI-001",
        "size": "Human Size",
        "price": 850000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_red_lily_093",
    "productId": "BDY-000093",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Red Lily",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_red_lily_093_variant_1",
        "sku": "BDY-FRE-RED_LILY-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1250000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_garden_secret_094",
    "productId": "BDY-000094",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Garden Secret",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_garden_secret_094_variant_1",
        "sku": "BDY-FRE-GARDEN_S-HUMAN_SI-001",
        "size": "Human Size",
        "price": 560000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_gardenia_095",
    "productId": "BDY-000095",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Gardenia",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_gardenia_095_variant_1",
        "sku": "BDY-FRE-GARDENIA-HUMAN_SI-001",
        "size": "Human Size",
        "price": 525000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rosy_grande_096",
    "productId": "BDY-000096",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rosy Grande",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rosy_grande_096_variant_1",
        "sku": "BDY-FRE-ROSY_GRA-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1000000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_raibow_giant_097",
    "productId": "BDY-000097",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rainbow Giant",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_raibow_giant_097_variant_1",
        "sku": "BDY-FRE-RAIBOW_G-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1100000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pink_promise_xl_098",
    "productId": "BDY-000098",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Pink Promise XL",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_pink_promise_xl_098_variant_1",
        "sku": "BDY-FRE-PINK_PRO-HUMAN_SI-001",
        "size": "Human Size",
        "price": 775000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_blue_holo_099",
    "productId": "BDY-000099",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Blue Holo",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_blue_holo_099_variant_1",
        "sku": "BDY-FRE-BLUE_HOL-HUMAN_SI-001",
        "size": "Human Size",
        "price": 875000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_white_lily_100",
    "productId": "BDY-000100",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "White Lily",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_white_lily_100_variant_1",
        "sku": "BDY-FRE-WHITE_LI-SMALL-001",
        "size": "Small",
        "price": 650000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_classic_jute_101",
    "productId": "BDY-000101",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Classic Jute",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_classic_jute_101_variant_1",
        "sku": "BDY-FRE-CLASSIC_-SMALL-001",
        "size": "Small",
        "price": 370000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_homey_vase_102",
    "productId": "BDY-000102",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Homey Vase",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_homey_vase_102_variant_1",
        "sku": "BDY-FRE-HOMEY_VA-SMALL-001",
        "size": "Small",
        "price": 275000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_orchid_galaxy_103",
    "productId": "BDY-000103",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Orchid Galaxy",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_orchid_galaxy_103_variant_1",
        "sku": "BDY-FRE-ORCHID_G-MEDIUM-001",
        "size": "Medium",
        "price": 750000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_ume_104",
    "productId": "BDY-000104",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Ume",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_ume_104_variant_1",
        "sku": "BDY-FRE-UME-MEDIUM-001",
        "size": "Medium",
        "price": 600000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_pinky_pastel_105",
    "productId": "BDY-000105",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Pinky Pastel",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_pinky_pastel_105_variant_1",
        "sku": "BDY-FRE-PINKY_PA-MEDIUM-001",
        "size": "Medium",
        "price": 525000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_daisy_gradation_106",
    "productId": "BDY-000106",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Daisy Gradation",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_daisy_gradation_106_variant_1",
        "sku": "BDY-FRE-DAISY_GR-MEDIUM-001",
        "size": "Medium",
        "price": 525000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_misty_magic_107",
    "productId": "BDY-000107",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Misty Magic",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_misty_magic_107_variant_1",
        "sku": "BDY-FRE-MISTY_MA-MEDIUM-001",
        "size": "Medium",
        "price": 525000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_elegant_orchid_108",
    "productId": "BDY-000108",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Elegant Orchid",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_elegant_orchid_108_variant_1",
        "sku": "BDY-FRE-ELEGANT_-LARGE-001",
        "size": "Large",
        "price": 1000000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_emerald_elegant_109",
    "productId": "BDY-000109",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Emerald Elegant",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_emerald_elegant_109_variant_1",
        "sku": "BDY-FRE-EMERALD_-LARGE-001",
        "size": "Large",
        "price": 1000000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_maroon_five_110",
    "productId": "BDY-000110",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Maroon Five",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_maroon_five_110_variant_1",
        "sku": "BDY-FRE-MAROON_F-LARGE-001",
        "size": "Large",
        "price": 1450000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_fuschia_lily_111",
    "productId": "BDY-000111",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Fuchsia Lily",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_fuschia_lily_111_variant_1",
        "sku": "BDY-FRE-FUSCHIA_-LARGE-001",
        "size": "Large",
        "price": 1750000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_mini_basket_112",
    "productId": "BDY-000112",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Mini Basket",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_mini_basket_112_variant_1",
        "sku": "BDY-FRE-MINI_BAS-SMALL-001",
        "size": "Small",
        "price": 150000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_mini_box_113",
    "productId": "BDY-000113",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Mini Box",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_mini_box_113_variant_1",
        "sku": "BDY-FRE-MINI_BOX-SMALL-001",
        "size": "Small",
        "price": 165000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_cherrie_amour_114",
    "productId": "BDY-000114",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Cherrie Amour",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_cherrie_amour_114_variant_1",
        "sku": "BDY-FRE-CHERRIE_-MEDIUM-001",
        "size": "Medium",
        "price": 295000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_hollo_blue_115",
    "productId": "BDY-000115",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Hollo Blue",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_hollo_blue_115_variant_1",
        "sku": "BDY-FRE-HOLLO_BL-MEDIUM-001",
        "size": "Medium",
        "price": 275000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_silvery_white_116",
    "productId": "BDY-000116",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Silvery White",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_silvery_white_116_variant_1",
        "sku": "BDY-FRE-SILVERY_-LARGE-001",
        "size": "Large",
        "price": 400000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_confetti_box_117",
    "productId": "BDY-000117",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Confetti Box",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_confetti_box_117_variant_1",
        "sku": "BDY-FRE-CONFETTI-LARGE-001",
        "size": "Large",
        "price": 325000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_heaven_scent_118",
    "productId": "BDY-000118",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Heaven Scent",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_heaven_scent_118_variant_1",
        "sku": "BDY-FRE-HEAVEN_S-LARGE-001",
        "size": "Large",
        "price": 425000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_bold_maroon_119",
    "productId": "BDY-000119",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Bold Maroon",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_bold_maroon_119_variant_1",
        "sku": "BDY-FRE-BOLD_MAR-LARGE-001",
        "size": "Large",
        "price": 500000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_winter_orchid_120",
    "productId": "BDY-000120",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Winter Orchid",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_winter_orchid_120_variant_1",
        "sku": "BDY-FRE-WINTER_O-HUMAN_SI-001",
        "size": "Human Size",
        "price": 900000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_anmber_awe_121",
    "productId": "BDY-000121",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Box, Basket & Vase",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Amber Awe",
    "description": "Box, Basket & Vase",
    "variants": [
      {
        "id": "catalog_anmber_awe_121_variant_1",
        "sku": "BDY-FRE-ANMBER_A-HUMAN_SI-001",
        "size": "Human Size",
        "price": 750000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_large_fresh_122",
    "productId": "BDY-000122",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Large Fresh",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_large_fresh_122_variant_1",
        "sku": "BDY-FRE-LARGE_FR-LARGE-001",
        "size": "Large",
        "price": 500000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_xl_sun_123",
    "productId": "BDY-000123",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Thumbelina - XL Sun",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_xl_sun_123_variant_1",
        "sku": "BDY-ART-XL_SUN-HUMAN_SI-001",
        "size": "Human Size",
        "price": 690000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_large_lily_124",
    "productId": "BDY-000124",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Thumbelina - Large Lily",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_large_lily_124_variant_1",
        "sku": "BDY-ART-LARGE_LI-LARGE-001",
        "size": "Large",
        "price": 500000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_large_artificial_125",
    "productId": "BDY-000125",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Thumbelina - Large Artificial",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_large_artificial_125_variant_1",
        "sku": "BDY-ART-LARGE_AR-LARGE-001",
        "size": "Large",
        "price": 400000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_xxl_import_126",
    "productId": "BDY-000126",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - XXL Import",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_xxl_import_126_variant_1",
        "sku": "BDY-FRE-XXL_IMPO-HUMAN_SI-001",
        "size": "Human Size",
        "price": 2065000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_medium_fresh_127",
    "productId": "BDY-000127",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Medium Fresh",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_medium_fresh_127_variant_1",
        "sku": "BDY-FRE-MEDIUM_F-MEDIUM-001",
        "size": "Medium",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_mini_artificial_128",
    "productId": "BDY-000128",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Thumbelina - Mini Artificial",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_mini_artificial_128_variant_1",
        "sku": "BDY-ART-MINI_ART-SMALL-001",
        "size": "Small",
        "price": 165000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_dome_cake_d15cm_129",
    "productId": "BDY-000129",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Flower Cake",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Dome Cake d15cm",
    "description": "Flower Cake",
    "variants": [
      {
        "id": "catalog_thumbelina_dome_cake_d15cm_129_variant_1",
        "sku": "BDY-FRE-DOME_CAK-SMALL-001",
        "size": "Small",
        "price": 355000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_medium_artificial_130",
    "productId": "BDY-000130",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Thumbelina - Medium Artificial",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_medium_artificial_130_variant_1",
        "sku": "BDY-ART-MEDIUM_A-MEDIUM-001",
        "size": "Medium",
        "price": 350000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_rainbow_jute_131",
    "productId": "BDY-000131",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Rainbow Jute",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_rainbow_jute_131_variant_1",
        "sku": "BDY-FRE-RAINBOW_-STANDARD-001",
        "size": "Standard",
        "price": 200000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_dome_cake_d20cm_132",
    "productId": "BDY-000132",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Flower Cake",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Dome Cake d20cm",
    "description": "Flower Cake",
    "variants": [
      {
        "id": "catalog_thumbelina_dome_cake_d20cm_132_variant_1",
        "sku": "BDY-FRE-DOME_CAK-MEDIUM-001",
        "size": "Medium",
        "price": 525000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_giant_sunflower_133",
    "productId": "BDY-000133",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Thumbelina - Giant Sunflower",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_giant_sunflower_133_variant_1",
        "sku": "BDY-ART-GIANT_SU-SMALL-001",
        "size": "Small",
        "price": 85000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_baby_thumbelina_134",
    "productId": "BDY-000134",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Baby Thumbelina",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_baby_thumbelina_134_variant_1",
        "sku": "BDY-FRE-BABY_THU-SMALL-001",
        "size": "Small",
        "price": 210000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_sm_thumbelina_135",
    "productId": "BDY-000135",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - SM Thumbelina",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_sm_thumbelina_135_variant_1",
        "sku": "BDY-FRE-SM_THUMB-SMALL-001",
        "size": "Small",
        "price": 210000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_thumbelina_jute_m_136",
    "productId": "BDY-000136",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Thumbelina Jute M",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_thumbelina_jute_m_136_variant_1",
        "sku": "BDY-FRE-THUMBELI-MEDIUM-001",
        "size": "Medium",
        "price": 370000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_sunny_lily_137",
    "productId": "BDY-000137",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Sunny Lily",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_sunny_lily_137_variant_1",
        "sku": "BDY-FRE-SUNNY_LI-STANDARD-001",
        "size": "Standard",
        "price": 390000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_honey_thumbelina_138",
    "productId": "BDY-000138",
    "category": "Birthday",
    "occasionTags": [
      "Birthday",
      "General Gifting"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - Honey Thumbelina",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_honey_thumbelina_138_variant_1",
        "sku": "BDY-FRE-HONEY_TH-STANDARD-001",
        "size": "Standard",
        "price": 300000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_mostly_lilies_139",
    "productId": "CDL-000001",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Mostly Lilies",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_mostly_lilies_139_variant_1",
        "sku": "CDL-FRE-MOSTLY_L-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1000000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_yellow_angel_140",
    "productId": "CDL-000002",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Yellow angel",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_yellow_angel_140_variant_1",
        "sku": "CDL-FRE-YELLOW_A-HUMAN_SI-001",
        "size": "Human Size",
        "price": 750000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_standard_white_141",
    "productId": "CDL-000003",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Standard White",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_standard_white_141_variant_1",
        "sku": "CDL-FRE-STANDARD-HUMAN_SI-001",
        "size": "Human Size",
        "price": 850000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_standard_stand_142",
    "productId": "CDL-000004",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Standard Stand",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_standard_stand_142_variant_1",
        "sku": "CDL-FRE-STANDARD-HUMAN_SI-002",
        "size": "Human Size",
        "price": 500000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_double_stand_143",
    "productId": "CDL-000005",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Double Stand",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_double_stand_143_variant_1",
        "sku": "CDL-FRE-DOUBLE_S-HUMAN_SI-001",
        "size": "Human Size",
        "price": 750000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_pink_angel_144",
    "productId": "CDL-000006",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Pink Angel",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_pink_angel_144_variant_1",
        "sku": "CDL-FRE-PINK_ANG-HUMAN_SI-001",
        "size": "Human Size",
        "price": 800000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_rose_white_145",
    "productId": "CDL-000007",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Rose white",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_rose_white_145_variant_1",
        "sku": "CDL-FRE-ROSE_WHI-HUMAN_SI-001",
        "size": "Human Size",
        "price": 650000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_double_red_146",
    "productId": "CDL-000008",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Double Red",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_double_red_146_variant_1",
        "sku": "CDL-FRE-DOUBLE_R-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1000000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_purple_peace_147",
    "productId": "CDL-000009",
    "category": "Condolence",
    "occasionTags": [
      "Condolence"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Purple Peace",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_purple_peace_147_variant_1",
        "sku": "CDL-FRE-PURPLE_P-HUMAN_SI-001",
        "size": "Human Size",
        "price": 600000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_sunny_side_148",
    "productId": "CON-000001",
    "category": "Congratulations",
    "occasionTags": [
      "Congratulations"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Sunny Side",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_sunny_side_148_variant_1",
        "sku": "CON-FRE-SUNNY_SI-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1700000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_lily_orchid_149",
    "productId": "CON-000002",
    "category": "Congratulations",
    "occasionTags": [
      "Congratulations"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Lily Orchid",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_lily_orchid_149_variant_1",
        "sku": "CON-FRE-LILY_ORC-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1600000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_standard_rose_150",
    "productId": "CON-000003",
    "category": "Congratulations",
    "occasionTags": [
      "Congratulations"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Standard Rose",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_standard_rose_150_variant_1",
        "sku": "CON-FRE-STANDARD-HUMAN_SI-001",
        "size": "Human Size",
        "price": 760000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_full_garden_151",
    "productId": "CON-000004",
    "category": "Congratulations",
    "occasionTags": [
      "Congratulations"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Full Garden",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_full_garden_151_variant_1",
        "sku": "CON-FRE-FULL_GAR-HUMAN_SI-001",
        "size": "Human Size",
        "price": 2500000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rose_lily_152",
    "productId": "CON-000005",
    "category": "Congratulations",
    "occasionTags": [
      "Congratulations"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rose Lily",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_rose_lily_152_variant_1",
        "sku": "CON-FRE-ROSE_LIL-HUMAN_SI-001",
        "size": "Human Size",
        "price": 1000000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_standard_lily_153",
    "productId": "CON-000006",
    "category": "Congratulations",
    "occasionTags": [
      "Congratulations"
    ],
    "productType": "Standing Flower",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Standard Lily",
    "description": "Standing Flower",
    "variants": [
      {
        "id": "catalog_standard_lily_153_variant_1",
        "sku": "CON-FRE-STANDARD-HUMAN_SI-002",
        "size": "Human Size",
        "price": 860000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_teddy_orchid_grad_154",
    "productId": "GRD-000001",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Teddy Orchid Grad",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_teddy_orchid_grad_154_variant_1",
        "sku": "GRD-ART-TEDDY_OR-MEDIUM-001",
        "size": "Medium",
        "price": 310000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_sunny_thumbelina_155",
    "productId": "GRD-000002",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Thumbelina - Sunny Thumbelina",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_sunny_thumbelina_155_variant_1",
        "sku": "GRD-ART-SUNNY_TH-SMALL-001",
        "size": "Small",
        "price": 190000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_single_sun_156",
    "productId": "GRD-000003",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Single Sun",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_single_sun_156_variant_1",
        "sku": "GRD-ART-SINGLE_S-SMALL-001",
        "size": "Small",
        "price": 102000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_sm_thumbelina_157",
    "productId": "GRD-000004",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Thumbelina - SM Thumbelina",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_sm_thumbelina_157_variant_1",
        "sku": "GRD-FRE-SM_THUMB-SMALL-001",
        "size": "Small",
        "price": 220000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_hydra_sun_grad_158",
    "productId": "GRD-000005",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Hydra Sun Grad",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_hydra_sun_grad_158_variant_1",
        "sku": "GRD-FRE-HYDRA_SU-MEDIUM-001",
        "size": "Medium",
        "price": 370000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_rainbow_jute_159",
    "productId": "GRD-000006",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "fresh",
    "name": "Rainbow Jute",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_rainbow_jute_159_variant_1",
        "sku": "GRD-FRE-RAINBOW_-MEDIUM-001",
        "size": "Medium",
        "price": 275000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_graduation_cluster_160",
    "productId": "GRD-000007",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Graduation Cluster",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_graduation_cluster_160_variant_1",
        "sku": "GRD-ART-GRADUATI-MEDIUM-001",
        "size": "Medium",
        "price": 375000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_thumbelina_medium_thumbelina_grad_161",
    "productId": "GRD-000008",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Thumbelina",
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Thumbelina - Medium Thumbelina Grad",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_thumbelina_medium_thumbelina_grad_161_variant_1",
        "sku": "GRD-ART-MEDIUM_T-MEDIUM-001",
        "size": "Medium",
        "price": 360000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_mini_jute_teddy_162",
    "productId": "GRD-000009",
    "category": "Graduation",
    "occasionTags": [
      "Graduation",
      "Congratulations"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Fixed",
    "orderType": "Catalog",
    "material": "artificial",
    "name": "Mini Jute Teddy",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_mini_jute_teddy_162_variant_1",
        "sku": "GRD-ART-MINI_JUT-SMALL-001",
        "size": "Small",
        "price": 195000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": false
  },
  {
    "id": "catalog_mix_phalaenopsis_bridal_bouquet_163",
    "productId": "WED-000001",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Starts From",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Mix Phalaenopsis bridal bouquet",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_mix_phalaenopsis_bridal_bouquet_163_variant_1",
        "sku": "WED-FRE-MIX_PHAL-STANDARD-001",
        "size": "Standard",
        "price": 1100000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_local_phalaenopsis_bridal_bouquet_164",
    "productId": "WED-000002",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Starts From",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Local phalaenopsis bridal bouquet",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_local_phalaenopsis_bridal_bouquet_164_variant_1",
        "sku": "WED-FRE-LOCAL_PH-STANDARD-001",
        "size": "Standard",
        "price": 750000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_imported_bridal_bouquet_165",
    "productId": "WED-000003",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Starts From",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Imported bridal bouquet",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_imported_bridal_bouquet_165_variant_1",
        "sku": "WED-FRE-IMPORTED-STANDARD-001",
        "size": "Standard",
        "price": 2500000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_preserved_cascading_bouquet_166",
    "productId": "WED-000004",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Starts From",
    "orderType": "Custom",
    "material": "artificial",
    "name": "Preserved cascading bouquet",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_preserved_cascading_bouquet_166_variant_1",
        "sku": "WED-ART-PRESERVE-STANDARD-001",
        "size": "Standard",
        "price": 2500000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_mixed_lily_bouquet_167",
    "productId": "WED-000005",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Starts From",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Mixed lily bouquet",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_mixed_lily_bouquet_167_variant_1",
        "sku": "WED-FRE-MIXED_LI-MEDIUM-001",
        "size": "Medium",
        "price": 500000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_standard_roses_bouquet_168",
    "productId": "WED-000006",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Starts From",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Standard Roses Bouquet",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_standard_roses_bouquet_168_variant_1",
        "sku": "WED-FRE-STANDARD-SMALL-001",
        "size": "Small",
        "price": 450000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_posy_bouquet_169",
    "productId": "WED-000007",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": undefined,
    "pricingType": "Starts From",
    "orderType": "Custom",
    "material": "fresh",
    "name": "Posy Bouquet",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_posy_bouquet_169_variant_1",
        "sku": "WED-FRE-POSY_BOU-SMALL-001",
        "size": "Small",
        "price": 300000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_omakase_omakase_small_170",
    "productId": "WED-000008",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Omakase",
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "artificial",
    "name": "Omakase - Omakase Small",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_omakase_omakase_small_170_variant_1",
        "sku": "WED-ART-OMAKASE_-SMALL-001",
        "size": "Small",
        "price": 300000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_omakase_omakase_medium_171",
    "productId": "WED-000009",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Omakase",
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "artificial",
    "name": "Omakase - Omakase Medium",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_omakase_omakase_medium_171_variant_1",
        "sku": "WED-ART-OMAKASE_-MEDIUM-001",
        "size": "Medium",
        "price": 550000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  },
  {
    "id": "catalog_omakase_omakase_large_172",
    "productId": "WED-000010",
    "category": "Wedding",
    "occasionTags": [
      "Wedding"
    ],
    "productType": "Bouquet",
    "collectionSeries": "Omakase",
    "pricingType": "Fixed",
    "orderType": "Custom",
    "material": "artificial",
    "name": "Omakase - Omakase large",
    "description": "Bouquet",
    "variants": [
      {
        "id": "catalog_omakase_omakase_large_172_variant_1",
        "sku": "WED-ART-OMAKASE_-LARGE-001",
        "size": "Large",
        "price": 850000,
        "status": "active"
      }
    ],
    "isActive": true,
    "isFeatured": false,
    "isCustomizable": true
  }
]
