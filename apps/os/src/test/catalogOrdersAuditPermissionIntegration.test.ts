import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAPABILITY_ALLOWED_ROLES, DEFAULT_ACTION_PERMISSIONS } from '../config/actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS, SECTION_ALLOWED_ROLES } from '../config/permissions'

const migrationSource = readFileSync('../../supabase/migrations/20260919170000_catalog_order_history_audit_integration.sql', 'utf8')
const repositorySource = readFileSync('src/data/shared/repositories.ts', 'utf8')
const auditSyncSource = readFileSync('src/data/auditSupabaseSync.ts', 'utf8')
const financeBoundarySource = readFileSync('../../supabase/migrations/20260904234500_finance_role_boundary_hardening.sql', 'utf8')

describe('Catalog Orders Cart Audit permission integration', () => {
  it('keeps ordered Catalog rows historical instead of hard-deleting them', () => {
    expect(migrationSource).toContain('archived_at')
    expect(migrationSource).toContain('public.order_items oi where oi.variant_id=pv.id')
    expect(migrationSource).toContain("set status='inactive'")
    expect(repositorySource).toContain('!variant.archived_at')
    expect(repositorySource).toContain('!product.archived_at')
  })

  it('keeps price and production recipe snapshots immutable while the ordered variant is unchanged', () => {
    expect(migrationSource).toContain('private.preserve_order_item_catalog_snapshot')
    expect(migrationSource).toContain('new.unit_price_idr := old.unit_price_idr')
    expect(migrationSource).toContain('new.flower_recipe_snapshot := old.flower_recipe_snapshot')
    expect(migrationSource).toContain('old.variant_id is not distinct from new.variant_id')
  })

  it('records authoritative Catalog price status Cost and Size Template assignment audits', () => {
    expect(migrationSource).toContain("'catalog.variant.update'")
    expect(migrationSource).toContain("'catalog.variant_cost.update'")
    expect(migrationSource).toContain("'catalog.size_template_assignments.update'")
    expect(auditSyncSource).toContain("row.entity_type.startsWith('catalog_')")
    expect(auditSyncSource).toContain('beforeState')
    expect(auditSyncSource).toContain('afterState')
  })

  it('hydrates stable size identity and excludes archived rows from current Catalog reads', () => {
    expect(repositorySource).toContain('sizeOptionId: row.size_option_id')
    expect(repositorySource).toContain('variant.product_id === row.id && !variant.archived_at')
    expect(repositorySource).toContain('products.filter((product) => !product.archived_at)')
  })

  it('keeps Catalog hard role eligibility aligned with the server role family', () => {
    expect(SECTION_ALLOWED_ROLES.catalog).toEqual(['owner', 'admin', 'finance'])
    expect(DEFAULT_ROLE_SECTION_ACCESS.owner.catalog).toBe('edit')
    expect(DEFAULT_ROLE_SECTION_ACCESS.admin.catalog).toBe('edit')
    expect(DEFAULT_ROLE_SECTION_ACCESS.finance.catalog).toBe('view')
    expect(DEFAULT_ROLE_SECTION_ACCESS.hr.catalog).toBe('none')
    expect(DEFAULT_ROLE_SECTION_ACCESS.florist.catalog).toBe('none')

    expect(financeBoundarySource).toContain("when 'owner' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','hr','scheduling','settings')")
    expect(financeBoundarySource).toContain("when 'admin' then p_section in ('dashboard','orders','stock','catalog','customers')")
    expect(financeBoundarySource).toContain("when 'finance' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','finance')")
  })

  it('keeps Orders role-family capabilities aligned with the authoritative registry contract', () => {
    expect(CAPABILITY_ALLOWED_ROLES['orders.read_all']).toEqual(['owner', 'admin', 'finance', 'hr'])
    expect(CAPABILITY_ALLOWED_ROLES['orders.read_assigned']).toEqual(['owner', 'florist'])
    expect(CAPABILITY_ALLOWED_ROLES['orders.create']).toEqual(['owner', 'admin'])
    expect(CAPABILITY_ALLOWED_ROLES['orders.edit']).toEqual(['owner', 'admin'])
    expect(CAPABILITY_ALLOWED_ROLES['orders.resolve_change_request']).toEqual(['owner', 'finance'])
    expect(DEFAULT_ACTION_PERMISSIONS.admin['orders.edit']).toBe(true)
    expect(DEFAULT_ACTION_PERMISSIONS.finance['orders.resolve_change_request']).toBe(true)
    expect(DEFAULT_ACTION_PERMISSIONS.florist['orders.read_assigned']).toBe(true)
  })

  it('allows inactive historical stable sizes to survive an Arrangement Type review without becoming sellable', () => {
    expect(migrationSource).toContain('CATALOG_HISTORICAL_SIZE_OPTION_MISSING')
    expect(migrationSource).toContain('SIZE_GUIDE_HISTORICAL_CHILD_CANNOT_BE_REMOVED')
    expect(migrationSource).toContain("if v_variant_status <> 'active' then")
    expect(migrationSource).toContain("if v_variant.status <> 'active' then")
  })
})
