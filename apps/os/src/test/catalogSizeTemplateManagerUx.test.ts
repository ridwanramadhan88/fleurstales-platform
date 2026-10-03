import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const guideSource = readFileSync('src/components/catalog/CatalogSizeGuideDialog.tsx', 'utf8')
const arrangementSource = readFileSync('src/components/catalog/CatalogArrangementTypesDialog.tsx', 'utf8')
const bridgeSource = readFileSync('src/data/shared/catalogBridge.ts', 'utf8')
const sizeGuideBridgeSource = readFileSync('src/data/shared/sizeGuideBridge.ts', 'utf8')
const actionsSource = readFileSync('src/store/catalogStoreSizeGuideActions.ts', 'utf8')

describe('Catalog Size Template manager regressions', () => {
  it('manages size charts only; products pick their chart in the product editor', () => {
    expect(guideSource).not.toContain('Penetapan')
    expect(guideSource).not.toContain('Default Jenis rangkaian')
    expect(guideSource).not.toContain("target.scope === 'product_type'")
    expect(guideSource).not.toContain('state.arrangementTypes')
    expect(guideSource).toContain('Template dipilih per produk saat menambah atau mengedit produk.')
    expect(guideSource).toContain('{templateProductCount(template.id)} produk')
  })

  it('resolves a product size chart only from its own product target', () => {
    expect(actionsSource).toContain("targets.find((target) => target.scope === 'product' && target.productId === product.id)?.templateId")
    expect(actionsSource).not.toContain("target.scope === 'product_type' && target.productType === product.productType")
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

  it('keeps guide image editing stacked on small tablets before splitting at md', () => {
    expect(guideSource).toContain('md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]')
    expect(guideSource).not.toContain('sm:grid-cols-[minmax(0,1fr)_360px]')
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

  it('keeps Arrangement Type management user-facing strings in Indonesian without a default Size Template', () => {
    expect(arrangementSource).toContain('Kelola Jenis rangkaian')
    expect(arrangementSource).not.toContain('Template default:')
    expect(arrangementSource).not.toContain('Manage arrangement types')
    expect(arrangementSource).not.toContain('No arrangement types yet.')
  })
})
