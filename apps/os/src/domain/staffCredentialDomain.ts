/** Production Supabase staff credentials use passwords, never the demo PIN. */
export const STAFF_PASSWORD_MIN_LENGTH = 12

/**
 * Mirrors the Supabase Auth policy configured in supabase/config.toml:
 * at least 12 chars with lower/upper-case letters, a digit, and a symbol.
 */
export const isStrongStaffPassword = (value: string): boolean =>
  value.length >= STAFF_PASSWORD_MIN_LENGTH
  && /[a-z]/.test(value)
  && /[A-Z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value)

export const STAFF_PASSWORD_HELP = `Use at least ${STAFF_PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, a number, and a symbol.`
