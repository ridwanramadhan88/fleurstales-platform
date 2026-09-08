import { finalizeIndonesianStaticCopy } from './finalizeIndonesianCopy'
import { ID_PATTERN_TRANSLATIONS, ID_TRANSLATIONS } from './indonesianTranslations'
import { ID_REVIEWED_SOURCE_TRANSLATIONS } from './reviewedTranslationSource'
import { ID_STRICT_PATTERN_TRANSLATIONS, ID_STRICT_TRANSLATIONS } from './strictIndonesianTranslations'
import type { UiLanguage } from './uiLanguage'

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim()

const preserveBoundaryWhitespace = (original: string, translated: string): string => {
  const leading = original.match(/^\s+/)?.[0] ?? ''
  const trailing = original.match(/\s+$/)?.[0] ?? ''
  return `${leading}${translated}${trailing}`
}

const applyPatterns = (
  value: string,
  patterns: Array<[RegExp, (...matches: string[]) => string]>,
): string | undefined => {
  for (const [pattern, replacement] of patterns) {
    const match = value.match(pattern)
    if (match) return replacement(...match)
  }
  return undefined
}

/**
 * Indonesian is treated as a complete product language rather than an English
 * UI with selected words replaced after rendering. Product names, customer
 * data, branch names, SKUs, and other unmatched business values stay intact.
 */
export const translateUiText = (value: string, language: UiLanguage): string => {
  if (language === 'en') return value
  const normalized = normalize(value)
  if (!normalized || !/[A-Za-z]/.test(normalized)) return value

  const strictExact = ID_STRICT_TRANSLATIONS[normalized]
  if (strictExact !== undefined) {
    return preserveBoundaryWhitespace(value, finalizeIndonesianStaticCopy(strictExact))
  }

  const strictPatterned = applyPatterns(normalized, ID_STRICT_PATTERN_TRANSLATIONS)
  if (strictPatterned !== undefined) return preserveBoundaryWhitespace(value, strictPatterned)

  const exact = ID_TRANSLATIONS[normalized]
  if (exact !== undefined) {
    return preserveBoundaryWhitespace(value, finalizeIndonesianStaticCopy(exact))
  }

  const patterned = applyPatterns(normalized, ID_PATTERN_TRANSLATIONS)
  if (patterned !== undefined) return preserveBoundaryWhitespace(value, patterned)

  const reviewedFallback = ID_REVIEWED_SOURCE_TRANSLATIONS[normalized]
  if (reviewedFallback !== undefined) {
    return preserveBoundaryWhitespace(value, finalizeIndonesianStaticCopy(reviewedFallback))
  }

  return value
}
