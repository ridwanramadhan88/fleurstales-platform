import type {
  CatalogProduct,
  CatalogSizeGuideTarget,
  CatalogSizeGuideTemplate,
} from '../store/catalogStoreTypes'

export type CatalogVariantIntegritySeverity = 'error' | 'warning'

export type CatalogVariantIntegrityIssueCode =
  | 'missing_size_option'
  | 'duplicate_size_option'
  | 'missing_template_assignment'
  | 'unknown_size_option'
  | 'archived_size_option'
  | 'invalid_price'
  | 'missing_recipe'
  | 'missing_variant_image'
  | 'orphaned_template_target'
  | 'orphaned_product_target'

export interface CatalogVariantIntegrityIssue {
  code: CatalogVariantIntegrityIssueCode
  severity: CatalogVariantIntegritySeverity
  message: string
  productId?: string
  variantId?: string
  templateId?: string
  sizeOptionId?: string
}

export interface CatalogVariantIntegrityReport {
  issues: CatalogVariantIntegrityIssue[]
  errors: number
  warnings: number
  checkedProducts: number
  checkedVariants: number
}

const findAssignedTemplate = (
  product: CatalogProduct,
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): CatalogSizeGuideTemplate | undefined => {
  const directTarget = targets.find(
    (target) => target.scope === 'product' && target.productId === product.id,
  )
  if (directTarget) return templates.find((template) => template.id === directTarget.templateId)

  if (!product.productType) return undefined
  const typeTarget = targets.find(
    (target) => target.scope === 'product_type' && target.productType === product.productType,
  )
  return typeTarget ? templates.find((template) => template.id === typeTarget.templateId) : undefined
}

export const auditCatalogVariantIntegrity = (
  products: CatalogProduct[],
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): CatalogVariantIntegrityReport => {
  const issues: CatalogVariantIntegrityIssue[] = []
  const productIds = new Set(products.map((product) => product.id))
  const templateIds = new Set(templates.map((template) => template.id))

  for (const target of targets) {
    if (!templateIds.has(target.templateId)) {
      issues.push({
        code: 'orphaned_template_target',
        severity: 'error',
        templateId: target.templateId,
        message: `Size-guide target ${target.id} points to missing template ${target.templateId}.`,
      })
    }
    if (target.scope === 'product' && !productIds.has(target.productId)) {
      issues.push({
        code: 'orphaned_product_target',
        severity: 'warning',
        productId: target.productId,
        templateId: target.templateId,
        message: `Size-guide target ${target.id} points to missing product ${target.productId}.`,
      })
    }
  }

  let checkedVariants = 0

  for (const product of products) {
    if (product.variants.length === 0) continue

    const assignedTemplate = findAssignedTemplate(product, templates, targets)
    const seenSizeOptionIds = new Set<string>()
    const hasStableSizeIdentity = product.variants.some((variant) => Boolean(variant.sizeOptionId))

    if (hasStableSizeIdentity && !assignedTemplate) {
      issues.push({
        code: 'missing_template_assignment',
        severity: 'warning',
        productId: product.id,
        message: `${product.name} has size-linked variants but no resolvable size template assignment.`,
      })
    }

    for (const variant of product.variants) {
      checkedVariants += 1
      const sizeOptionId = variant.sizeOptionId?.trim()

      if (!sizeOptionId) {
        issues.push({
          code: 'missing_size_option',
          severity: 'warning',
          productId: product.id,
          variantId: variant.id,
          message: `${product.name} · ${variant.size} still uses legacy size text without sizeOptionId.`,
        })
      } else {
        if (seenSizeOptionIds.has(sizeOptionId)) {
          issues.push({
            code: 'duplicate_size_option',
            severity: 'error',
            productId: product.id,
            variantId: variant.id,
            sizeOptionId,
            message: `${product.name} has more than one variant linked to size option ${sizeOptionId}.`,
          })
        }
        seenSizeOptionIds.add(sizeOptionId)

        if (assignedTemplate) {
          const sizeOption = assignedTemplate.sizes.find((size) => size.id === sizeOptionId)
          if (!sizeOption) {
            issues.push({
              code: 'unknown_size_option',
              severity: 'error',
              productId: product.id,
              variantId: variant.id,
              templateId: assignedTemplate.id,
              sizeOptionId,
              message: `${product.name} · ${variant.size} points to a size that is not in ${assignedTemplate.name}.`,
            })
          } else if (sizeOption.isActive === false && variant.status === 'active') {
            issues.push({
              code: 'archived_size_option',
              severity: 'error',
              productId: product.id,
              variantId: variant.id,
              templateId: assignedTemplate.id,
              sizeOptionId,
              message: `${product.name} · ${variant.size} is active while its template size is archived.`,
            })
          }
        }
      }

      if (!Number.isFinite(variant.price) || variant.price <= 0) {
        issues.push({
          code: 'invalid_price',
          severity: 'error',
          productId: product.id,
          variantId: variant.id,
          message: `${product.name} · ${variant.size} does not have a valid positive price.`,
        })
      }

      if (variant.status === 'active' && (!variant.flowerRecipe || variant.flowerRecipe.length === 0)) {
        issues.push({
          code: 'missing_recipe',
          severity: 'warning',
          productId: product.id,
          variantId: variant.id,
          message: `${product.name} · ${variant.size} is active without a variant recipe.`,
        })
      }

      if (variant.status === 'active' && (!variant.images || variant.images.length === 0)) {
        issues.push({
          code: 'missing_variant_image',
          severity: 'warning',
          productId: product.id,
          variantId: variant.id,
          message: `${product.name} · ${variant.size} still depends on the base product image fallback.`,
        })
      }
    }
  }

  return {
    issues,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    checkedProducts: products.length,
    checkedVariants,
  }
}
