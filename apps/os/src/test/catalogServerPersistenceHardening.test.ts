import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const repositoriesSource = readFileSync(join(root, 'src/data/shared/repositories.ts'), 'utf8')
const bridgeSource = readFileSync(join(root, 'src/data/shared/catalogBridge.ts'), 'utf8')
const sizeGuideActionsSource = readFileSync(join(root, 'src/store/catalogStoreSizeGuideActions.ts'), 'utf8')
const storefrontMainSource = readFileSync(join(root, '../storefront/src/main.tsx'), 'utf8')
const migrationSource = readFileSync(
  join(root, '../../supabase/migrations/20260919100000_catalog_server_persistence_hardening.sql'),
  'utf8',
)
const publicRecipeMigrationSource = readFileSync(
  join(root, '../../supabase/migrations/20260920213000_public_variant_flower_recipes.sql'),
  'utf8',
)

const publicRepositoryStart = repositoriesSource.indexOf('export const createCatalogReadRepository')
const adminRepositoryStart = repositoriesSource.indexOf('export const createCatalogAdminRepository')
const publicRepositorySource = repositoriesSource.slice(publicRepositoryStart, adminRepositoryStart)
const adminRepositorySource = repositoriesSource.slice(adminRepositoryStart)

describe('Catalog PR 1B server and persistence hardening', () => {
  it('exposes customer-facing recipes through the public Storefront repository with scoped RLS', () => {
    expect(publicRepositoryStart).toBeGreaterThan(-1)
    expect(adminRepositoryStart).toBeGreaterThan(publicRepositoryStart)
    expect(publicRepositorySource).toContain('readRecipeMap(client)')
    expect(adminRepositorySource).toContain('readRecipeMap(client)')
    expect(publicRecipeMigrationSource).toContain('grant select on table public.product_variant_flower_recipes to anon, authenticated')
    expect(publicRecipeMigrationSource).toContain("v.status = 'active'")
    expect(publicRecipeMigrationSource).toContain('v.archived_at is null')
    expect(publicRecipeMigrationSource).toContain('p.is_active = true')
    expect(publicRecipeMigrationSource).toContain('p.archived_at is null')
  })

  it('hydrates Cost only when the server-authorized role requests it', () => {
    expect(bridgeSource).toContain("includeCosts: role === 'finance'")
    expect(migrationSource).toContain("private.current_staff_role() = any(array['owner','finance'])")
    expect(migrationSource).toContain("if v_role='owner' and v_variant?'costIdr'")
  })

  it('enforces Catalog invariants inside the server mutation boundary', () => {
    expect(migrationSource).toContain('private.validate_catalog_snapshot_payload')
    expect(migrationSource).toContain('CATALOG_ACTIVE_PRODUCT_REQUIRES_SELLABLE_VARIANT')
    expect(migrationSource).toContain('CATALOG_SELLABLE_VARIANT_PRICE_REQUIRED')
    expect(migrationSource).toContain('CATALOG_DUPLICATE_SIZE_OPTION')
    expect(migrationSource).toContain('CATALOG_ARCHIVED_SIZE_OPTION')
    expect(migrationSource).toContain('product_variants_active_positive_price_check')
  })

  it('protects referenced Size Template children on the server', () => {
    expect(migrationSource).toContain('SIZE_GUIDE_REFERENCED_CHILD_CANNOT_BE_REMOVED')
    expect(migrationSource).toContain('SIZE_GUIDE_ACTIVE_CHILD_CANNOT_BE_ARCHIVED')
    expect(migrationSource).toContain("private.has_section_access('catalog','edit')")
  })

  it('never treats browser Size Template localStorage as authoritative when Supabase is configured', () => {
    expect(sizeGuideActionsSource).toContain('if (isSupabaseConfigured())')
    expect(sizeGuideActionsSource).toContain('localStorage.removeItem(STORAGE_KEY)')
    expect(bridgeSource).toContain('bootstrapSharedData().enabled && !loaded')
    expect(bridgeSource).toContain("throw new Error(getCatalogBridgeStatus().message ?? 'Remote Catalog is unavailable.')")
    expect(storefrontMainSource).toContain('await initializeStorefrontCatalogBridge()')
  })
})
