const VARIANT_OPTION_SEPARATOR = ' · '

export interface CatalogVariantLabelParts {
  size: string
  option: string
}

export const parseCatalogVariantLabel = (value: string): CatalogVariantLabelParts => {
  const clean = value.trim()
  if (!clean) return { size: '', option: '' }
  const separatorIndex = clean.indexOf(VARIANT_OPTION_SEPARATOR)
  if (separatorIndex < 0) return { size: clean, option: '' }
  return {
    size: clean.slice(0, separatorIndex).trim(),
    option: clean.slice(separatorIndex + VARIANT_OPTION_SEPARATOR.length).trim(),
  }
}

export const formatCatalogVariantLabel = (size: string, option: string): string => {
  const cleanSize = size.trim()
  const cleanOption = option.trim()
  if (!cleanOption) return cleanSize
  if (!cleanSize) return cleanOption
  return `${cleanSize}${VARIANT_OPTION_SEPARATOR}${cleanOption}`
}
