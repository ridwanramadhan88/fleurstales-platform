/** All OS staff credential flows use passwords. */
export const STAFF_PASSWORD_MIN_LENGTH = 6

/**
 * Mirrors the Supabase Auth policy configured in supabase/config.toml:
 * at least 6 characters with lower/upper-case letters and a digit.
 */
export const isStrongStaffPassword = (value: string): boolean =>
  value.length >= STAFF_PASSWORD_MIN_LENGTH
  && /[a-z]/.test(value)
  && /[A-Z]/.test(value)
  && /\d/.test(value)

export const STAFF_PASSWORD_HELP = `Use at least ${STAFF_PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, and a number.`
