import { ID_EXACT_TRANSLATIONS, ID_PATTERN_TRANSLATIONS } from './idTranslations'
import { ID_REVIEWED_TRANSLATIONS } from './reviewedTranslations'
import type { UiLanguage } from './uiLanguage'

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim()

/**
 * Common UI actions stay in English in the Indonesian experience.
 * Exact reviewed descriptions are resolved before this check, allowing short
 * mixed-language sentences such as "Pilih Branch sebelum Create Order."
 */
const PRESERVED_ACTIONS = [
  'Save',
  'Edit',
  'Delete',
  'Cancel',
  'Close',
  'Create',
  'Update',
  'View',
  'Search',
  'Filter',
  'Download',
  'Upload',
  'Export',
  'Import',
  'Generate',
  'Publish',
  'Submit',
  'Resubmit',
  'Approve',
  'Reject',
  'Verify',
  'Confirm',
  'Assign',
  'Unassign',
  'Archive',
  'Restore',
  'Reset',
  'Sign in',
  'Sign out',
  'Back',
  'Next',
  'Previous',
  'Continue',
  'Mark ready',
  'Start work',
  'Propose ready',
  'Complete refund',
] as const

const beginsWithPreservedAction = (value: string): boolean => {
  const lower = value.toLocaleLowerCase('en-US')
  return PRESERVED_ACTIONS.some((action) => {
    const candidate = action.toLocaleLowerCase('en-US')
    return lower === candidate || lower.startsWith(`${candidate} `) || lower.startsWith(`${candidate}:`)
  })
}

export const translateUiText = (value: string, language: UiLanguage): string => {
  if (language === 'en') return value
  const normalized = normalize(value)
  if (!normalized || !/[A-Za-z]/.test(normalized)) return value

  const reviewed = ID_REVIEWED_TRANSLATIONS[normalized]
  if (reviewed !== undefined) return reviewed

  if (beginsWithPreservedAction(normalized)) return value

  const exact = ID_EXACT_TRANSLATIONS[normalized]
  if (exact) return exact

  for (const [pattern, replacement] of ID_PATTERN_TRANSLATIONS) {
    const match = normalized.match(pattern)
    if (match) return replacement(...match)
  }

  return value
}
