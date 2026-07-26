import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG_IMAGE_MAX_COUNT } from '../domain/catalogImageDomain'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('canonical catalog images', () => {
  it('limits create and edit workflows to five images', () => {
    expect(CATALOG_IMAGE_MAX_COUNT).toBe(5)
    expect(read('src/components/catalog/CatalogItemFormSheet.tsx')).toContain(
      '.slice(0, CATALOG_IMAGE_MAX_COUNT)',
    )
  })

  it('hydrates transition demo paths as product-owned image URLs', () => {
    const repository = read('src/data/shared/repositories.ts')
    expect(repository).toContain("storagePath.startsWith('demo/')")
    expect(repository).toContain('`/catalog-demo/${storagePath.split')
  })
})
