import { getUiLanguage, useUiLanguage } from './uiLanguage'

/**
 * Bilingual copy for the staff-account screens (create, details, deactivate,
 * remove, reset link). Written out in both languages on purpose: the generic
 * word-by-word translation layer produced mixed sentences here ("Buat karyawan
 * account", "Jenis {nama} to confirm").
 */
export type StaffCopy = (en: string, id: string) => string

export const useStaffCopy = (): StaffCopy => {
  const language = useUiLanguage((state) => state.language)
  return (en, id) => (language === 'id' ? id : en)
}

/** Non-React callers (error messages built in data modules). */
export const staffCopy: StaffCopy = (en, id) => (getUiLanguage() === 'id' ? id : en)

export const READINESS_LABELS: Record<'Login account' | 'Recovery email' | 'Salary', [string, string]> = {
  'Login account': ['Login account', 'Akun login'],
  'Recovery email': ['Recovery email', 'Email pemulihan'],
  Salary: ['Salary', 'Gaji pokok'],
}
