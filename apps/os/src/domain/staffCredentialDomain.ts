/** All OS staff credential flows use passwords. */
export const STAFF_PASSWORD_MIN_LENGTH = 6

/**
 * Mirrors the Supabase Auth policy configured in supabase/config.toml:
 * any password of at least 6 characters.
 */
export const isStrongStaffPassword = (value: string): boolean =>
  value.length >= STAFF_PASSWORD_MIN_LENGTH

export const STAFF_PASSWORD_HELP = `Use at least ${STAFF_PASSWORD_MIN_LENGTH} characters.`
