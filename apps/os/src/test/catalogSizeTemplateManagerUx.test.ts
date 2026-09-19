import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const guideSource = readFileSync('src/components/catalog/CatalogSizeGuideDialog.tsx', 'utf8')
const arrangementSource = readFileSync('src/components/catalog/CatalogArrangementTypesDialog.tsx', 'utf8')
const bridgeSource = readFileSync('src/data/shared/catalogBridge.ts', 'utf8')
const sizeGuideBridgeSource = readFileSync('src/data/shared/sizeGuideBridge.ts', 'utf8')
const actionsSource = readFileSync('src/store/catalogStoreSizeGuideActions.ts', 'utf8')

describe('Catalog Size Template manager regressions', () => {
  it('uses the canonical Arrangement Type registry, including types with zero products', () => {
    expect(guideSource).toContain("const arrangementTypes = useCatalogStore((state) => state.arrangementTypes)")
    expect(guideSource).toContain('arrangementTypes.map((productType)')
    expect(guideSource).not.toContain('new Set(products.map((product) => product.productType')
  })

  it('separates Arrangement Type defaults from Product overrides and shows the effective template', () => {
    expect(guideSource).toContain('Default Jenis rangkaian')
    expect(guideSource).toContain('Template khusus produk')
    expect(guideSource).toContain('Template efektif')
    expect(guideSource).toContain('Gunakan default Jenis rangkaian')
    expect(guideSource).toContain("target.scope === 'product_type'")
    expect(guideSource).toContain("target.scope === 'product'")
  })

  it('keeps Size Template edits local until the explicit Save action', () => {
    expect(guideSource).toContain('draftTemplates')
    expect(guideSource).toContain('draftTargets')
    expect(guideSource).toContain('Simpan perubahan')
    expect(guideSource).toContain('flushBusinessOsSizeGuideSync(input)')
    expect(guideSource).toContain('applySizeGuideLibraryDraft')
    expect(actionsSource).toContain('applySizeGuideLibraryDraft:')
  })

  it('blocks stale draft saves instead of silently overwriting a refreshed source', () => {
    expect(guideSource).toContain('const sourceChanged =')
    expect(guideSource).toContain('Draft ini tidak ditimpa otomatis')
    expect(guideSource).toContain('disabled={!isDirty || isSaving || sourceChanged}')
  })

  it('uses a full-screen layered manager on mobile with safe-area footer spacing', () => {
    expect(guideSource).toContain('h-[100dvh] max-h-[100dvh]')
    expect(guideSource).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]')
    expect(arrangementSource).toContain('h-[100dvh] max-h-[100dvh]')
  })

  it('uploads guide images only during explicit persistence and cleans failed uploads', () => {
    expect(bridgeSource).toContain('export const flushBusinessOsSizeGuideSync')
    expect(bridgeSource).toContain('syncSizeGuideLibrary(shared.repositories.catalogAdmin, input')
    expect(sizeGuideBridgeSource).toContain('uploadedPaths')
    expect(sizeGuideBridgeSource).toContain('removeSizeGuideObjects([...new Set(uploadedPaths)])')
    expect(sizeGuideBridgeSource).toContain('best-effort orphan cleanup')
  })

  it('keeps post-commit object cleanup best-effort so committed metadata is not reported as failed', () => {
    expect(sizeGuideBridgeSource).toContain('best-effort cleanup after committed metadata')
    expect(sizeGuideBridgeSource.indexOf('applyRemoteSizeGuideLibrary(templates, targets)'))
      .toBeGreaterThan(sizeGuideBridgeSource.indexOf('best-effort cleanup after committed metadata'))
  })

  it('keeps Arrangement Type management user-facing strings in Indonesian and shows its default Size Template', () => {
    expect(arrangementSource).toContain('Kelola Jenis rangkaian')
    expect(arrangementSource).toContain('Template default:')
    expect(arrangementSource).not.toContain('Manage arrangement types')
    expect(arrangementSource).not.toContain('No arrangement types yet.')
  })
})
