import { ID_EXACT_TRANSLATIONS, ID_PATTERN_TRANSLATIONS } from './idTranslations'
import {
  ID_NATURAL_PATTERN_TRANSLATIONS,
  ID_NATURAL_TRANSLATIONS,
  normalizeIndonesianUiCopy,
} from './naturalTranslations'
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

  const reviewed = ID_NATURAL_TRANSLATIONS[normalized]
  if (reviewed !== undefined) return preserveBoundaryWhitespace(value, reviewed)

  const reviewedPattern = applyPatterns(normalized, ID_NATURAL_PATTERN_TRANSLATIONS)
  if (reviewedPattern !== undefined) return preserveBoundaryWhitespace(value, reviewedPattern)

  const exact = ID_EXACT_TRANSLATIONS[normalized]
  if (exact) return preserveBoundaryWhitespace(value, normalizeIndonesianUiCopy(exact, normalized))

  const legacyPattern = applyPatterns(normalized, ID_PATTERN_TRANSLATIONS)
  if (legacyPattern !== undefined) {
    return preserveBoundaryWhitespace(value, normalizeIndonesianUiCopy(legacyPattern, normalized))
  }

  return value
}
