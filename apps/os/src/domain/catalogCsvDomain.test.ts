import { describe, expect, it } from 'vitest'
import { exportCatalogCsv, parseCatalogCsv } from './catalogCsvDomain'
import type { CatalogProduct } from '../store/catalogStoreTypes'

const occasions = ['Birthday', 'Anniversary', 'General Gifting']

describe('shared catalog CSV contract', () => {
  it('keeps the legacy five-column import compatible', () => {
    const result = parseCatalogCsv(
      'Category,Material,Product Name,Size,Price\nBirthday,Fresh,Legacy Rose,Medium,150000',
      occasions,
    )

    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      category: 'Birthday',
      occasionTags: ['Birthday'],
      material: 'fresh',
      productName: 'Legacy Rose',
      size: 'Medium',
      price: 150000,
      pricingType: 'Fixed',
      orderType: 'Catalog',
      variantStatus: 'active',
    })
    expect(result.rows[0].providedFields).not.toContain('occasionTags')
  })

  it('parses the richer shared fields and quoted commas', () => {
    const csv = [
      'Product ID,SKU,Product Name,Category,Occasion Tags,Arrangement Type,Size,Material Type,Collection / Series,Price,Cost,Pricing Type,Order Type,Variant Status,Product Active,Featured,Customizable,Description',
      'BDY-000001,BDY-FRE-ROSE-MEDIUM-001,Rose, Birthday,"Birthday | General Gifting",Bouquet,Medium,Fresh,Omakase,"Rp 350.000","Rp 120.000",Starts From,Custom,active,Yes,Yes,No,"Roses, lilies, and foliage"',
    ].join('\n')

    const result = parseCatalogCsv(csv, occasions)
    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({
      productId: 'BDY-000001',
      category: 'Birthday',
      occasionTags: ['Birthday', 'General Gifting'],
      productType: 'Bouquet',
      collectionSeries: 'Omakase',
      price: 350000,
      cost: 120000,
      pricingType: 'Starts From',
      orderType: 'Custom',
      isActive: true,
      isFeatured: true,
      isCustomizable: false,
      description: 'Roses, lilies, and foliage',
    })
  })

  it('exports the normalized metadata needed by both apps', () => {
    const product: CatalogProduct = {
      id: 'p1',
      productId: 'BDY-000001',
      category: 'Birthday',
      occasionTags: ['Birthday', 'General Gifting'],
      productType: 'Bouquet',
      collectionSeries: 'Omakase',
      pricingType: 'Starts From',
      orderType: 'Custom',
      material: 'fresh',
      name: 'Omakase - Rose',
      description: 'Shared catalog product',
      variants: [{ id: 'v1', sku: 'BDY-FRE-ROSE-MEDIUM-001', size: 'Medium', price: 350000, cost: 120000, status: 'active' }],
      isActive: true,
      isFeatured: true,
      isCustomizable: false,
    }

    const csv = exportCatalogCsv([product])
    expect(csv).toContain('Occasion Tags')
    expect(csv).toContain('Arrangement Type')
    expect(csv).toContain('Collection / Series')
    expect(csv).toContain('Birthday | General Gifting')
    expect(csv).toContain('Omakase')
  })
})
