import type { Employee } from '../store/hrStoreTypes'
import { useUserStore } from '../store/userStore'
import { todayIsoDate, useHrStore } from '../store/hrStore'
import { getSupabaseAuthClient } from '../api/supabaseAuth'
import { isSupabaseConfigured } from './shared/supabaseConfig'
import { reloadOperationalDomain, runHrServerMutation } from './operationalSupabaseSync'
import { staffCopy } from '../i18n/staffAccountCopy'

/**
 * Staff account lifecycle against the trusted `staff-admin` Edge Function.
 *
 * Every call changes the Supabase login and the HR employee record in one
 * server transaction, then adopts the server's HR revision. The browser no
 * longer writes its own copy of the employee afterwards - that second write is
 * what used to leave logins and HR records out of sync.
 */

export type StaffEmployeePatch = Partial<Pick<Employee, 'name' | 'phone' | 'hireDate' | 'systemRole' | 'username' | 'email' | 'status'>>

export interface ProvisionStaffInput {
  /** Complete new employee record (without pin); identity fields are re-validated by the server. */
  employee: Employee
  password: string
  branchId?: string
}

const BLOCKER_LABELS: Record<string, [string, string]> = {
  attendance: ['attendance records', 'catatan absensi'],
  attendanceReviews: ['attendance reviews', 'review absensi'],
  points: ['point entries', 'catatan poin'],
  orders: ['orders', 'pesanan'],
  payroll: ['payroll records', 'data gaji'],
  publishedSchedules: ['published shifts', 'jadwal terbit'],
  scheduleHistory: ['past shifts', 'riwayat jadwal'],
}

const formatRemovalBlockers = (blockers:unknown):string => {
  const fallback = staffCopy('This employee has linked history and cannot be removed without force delete.', 'Karyawan ini punya riwayat terkait dan tidak bisa dihapus tanpa hapus paksa.')
  if (!blockers || typeof blockers !== 'object') return fallback
  const labels=Object.entries(blockers as Record<string,unknown>).filter(([,value])=>Number(value)>0).map(([key,value])=>`${value} ${staffCopy(...(BLOCKER_LABELS[key] ?? [key, key]))}`)
  return labels.length
    ? staffCopy(`Removal is blocked by ${labels.join(', ')}. Use force delete only if those records may be deleted.`, `Penghapusan tertahan oleh ${labels.join(', ')}. Gunakan hapus paksa hanya jika data itu boleh ikut dihapus.`)
    : fallback
}

const STAFF_ERROR_MESSAGES: Record<string, [string, string]> = {
  USERNAME_ALREADY_IN_USE: ['Username is already in use.', 'Nama pengguna sudah dipakai.'],
  STAFF_USERNAME_IN_USE: ['Username is already in use.', 'Nama pengguna sudah dipakai.'],
  EMAIL_ALREADY_IN_USE: ['Email is already in use.', 'Email sudah dipakai.'],
  USERNAME_OR_EMAIL_ALREADY_IN_HR: ['This username or email already belongs to another employee.', 'Nama pengguna atau email ini sudah dipakai karyawan lain.'],
  INVALID_STAFF_EMAIL: ['Enter a valid staff email address.', 'Masukkan email staf yang valid.'],
  INVALID_STAFF_USERNAME: ['Use lowercase letters, numbers, dots, underscores, or hyphens, starting with a letter.', 'Gunakan huruf kecil, angka, titik, garis bawah, atau tanda hubung, diawali huruf.'],
  INVALID_STAFF_PHONE: ['Enter a valid WhatsApp number.', 'Masukkan nomor WhatsApp yang valid.'],
  INVALID_STAFF_HIRE_DATE: ['Hire date is required and cannot be in the future.', 'Tanggal bergabung wajib diisi dan tidak boleh di masa depan.'],
  INVALID_STAFF_DISPLAY_NAME: ['Employee name is required.', 'Nama karyawan wajib diisi.'],
  WEAK_STAFF_PASSWORD: ['Password must be at least 6 characters.', 'Kata sandi minimal 6 karakter.'],
  EMPLOYEE_ALREADY_HAS_LOGIN: ['This employee already has a login account.', 'Karyawan ini sudah punya akun login.'],
  STAFF_LOGIN_NOT_FOUND: ['This employee has no login account yet.', 'Karyawan ini belum punya akun login.'],
  STAFF_RECOVERY_EMAIL_MISSING: ['Add a recovery email first.', 'Isi email pemulihan terlebih dahulu.'],
  EMPLOYEE_NOT_FOUND: ['Employee was not found. Reload and try again.', 'Karyawan tidak ditemukan. Muat ulang lalu coba lagi.'],
  STAFF_CREDENTIAL_UPDATE_FAILED: ['The new password or email could not be saved. No changes were kept.', 'Kata sandi atau email baru tidak bisa disimpan. Tidak ada perubahan yang disimpan.'],
  STAFF_INVITE_FORBIDDEN: ['You cannot create an account with this role.', 'Anda tidak bisa membuat akun dengan peran ini.'],
  STAFF_EDIT_FORBIDDEN: ['You do not have permission to edit employees.', 'Anda tidak punya izin mengubah karyawan.'],
  HR_MANAGED_ROLE_SCOPE_REQUIRED: ['HR can only manage the roles enabled for HR in Owner Settings.', 'SDM hanya bisa mengelola peran yang diizinkan Pemilik di Pengaturan.'],
  OWNER_PROFILE_PROTECTED: ['Owner accounts are managed by the Owner only.', 'Akun Pemilik hanya dikelola oleh Pemilik.'],
  STAFF_ROLE_DISABLED: ['The selected role is disabled in Owner Settings.', 'Peran yang dipilih dinonaktifkan di Pengaturan.'],
  STAFF_AUTH_REMOVAL_FAILED: ['The login could not be removed. The employee stays deactivated; try again.', 'Login tidak bisa dihapus. Karyawan tetap nonaktif; coba lagi.'],
  STAFF_REMOVAL_FINALIZE_FAILED: ['The login was removed, but cleaning up the employee record failed. Try again.', 'Login sudah dihapus, tetapi pembersihan data karyawan gagal. Coba lagi.'],
  STAFF_LOGIN_INACTIVE: ['This login is deactivated. Activate the employee first.', 'Login ini nonaktif. Aktifkan karyawan terlebih dahulu.'],
  STAFF_RESET_SEND_FAILED: ['The reset email could not be sent. Try again later.', 'Email atur ulang sandi gagal dikirim. Coba lagi nanti.'],
  RATE_LIMITED: ['Too many reset links were sent. Try again later.', 'Terlalu banyak tautan dikirim. Coba lagi nanti.'],
}

const messageFromBody = (body: { error?: string; message?: string; blockers?: unknown } | null | undefined, fallback: string): string => {
  if (!body) return fallback
  if (body.error === 'EMPLOYEE_REMOVAL_BLOCKED') return formatRemovalBlockers(body.blockers)
  const known = body.error ? STAFF_ERROR_MESSAGES[body.error] : undefined
  return known ? staffCopy(...known) : fallback
}

const staffFunctionError = async (error: unknown, fallback: string): Promise<Error> => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = error.context
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: string; message?: string; blockers?:unknown }
        return new Error(messageFromBody(body, fallback))
      } catch {
        // Use the clear workflow fallback below.
      }
    }
  }
  return new Error(fallback)
}

const invokeStaffAdmin = async <T>(body: Record<string, unknown>, fallback: string): Promise<T> => {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error(staffCopy('Supabase Auth is not configured.', 'Supabase Auth belum dikonfigurasi.'))
  const { data, error } = await client.functions.invoke('staff-admin', { body })
  if (error) throw await staffFunctionError(error, fallback)
  if (data?.error) throw new Error(messageFromBody(data, fallback))
  return data as T
}

/** Creates the login and the HR employee together. */
export const provisionStaffAccountSupabase = async (input: ProvisionStaffInput): Promise<void> => {
  if (!isSupabaseConfigured()) return
  const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin
  const { pin: _pin, ...employee } = input.employee
  await runHrServerMutation(() => invokeStaffAdmin({
    action: 'invite',
    employee,
    password: input.password,
    branchId: input.branchId,
    redirectTo,
  }, staffCopy('Unable to create the staff account.', 'Akun staf tidak bisa dibuat.')))
}

/**
 * Changes only the keys in `patch` (plus the password when given). Status
 * changes only when `patch.status` is sent, so saving a profile can never
 * re-activate a deactivated login.
 */
export const updateStaffEmployeeSupabase = async (employeeId: string, patch: StaffEmployeePatch, password?: string): Promise<void> => {
  if (!isSupabaseConfigured()) return
  await runHrServerMutation(() => invokeStaffAdmin({
    action: 'update',
    employeeId,
    patch,
    password: password || undefined,
  }, staffCopy('Unable to save the employee.', 'Data karyawan tidak bisa disimpan.')))
}

/**
 * Emails the staff member a password reset link (Owner, or HR for its managed
 * roles). Returns the masked address the link was sent to.
 */
export const sendStaffPasswordResetSupabase = async (employeeId: string): Promise<string> => {
  const data = await invokeStaffAdmin<{ sentTo?: string }>({ action: 'send_reset', employeeId },
    staffCopy('Unable to send the reset link.', 'Tautan atur ulang sandi tidak bisa dikirim.'))
  return data?.sentTo ?? ''
}

export const removeStaffEmployeeSupabase = async (employeeId:string, reason:string, forceResolve=false):Promise<void> => {
  if (!isSupabaseConfigured()) return
  const keys = forceResolve
    ? ['employees', 'attendance', 'attendanceReviewCases', 'employeePointEntries', 'employeeDefaultSchedules', 'scheduleOverrides', 'scheduleRevisions'] as const
    : ['employees', 'employeeDefaultSchedules', 'scheduleOverrides'] as const
  await runHrServerMutation(() => invokeStaffAdmin({
    action:'remove', employeeId, reason, forceResolve,
  }, staffCopy('Unable to remove the employee.', 'Karyawan tidak bisa dihapus.')), keys)
  if (forceResolve) await reloadOperationalDomain('payroll').catch(() => undefined)
}

/**
 * Local/demo mode only (no Supabase): mirrors the separation metadata the
 * server writes in update_staff_employee.
 */
export const applyLocalEmploymentStatusMetadata = (employeeId: string, status: Employee['status']): void => {
  const current = useHrStore.getState().employees.find((item) => item.id === employeeId)
  if (!current) return

  if (status === 'inactive') {
    const separatedAt = new Date().toISOString()
    const separatedBy = useUserStore.getState().name.trim() || 'HR'
    useHrStore.setState((state) => ({
      employees: state.employees.map((item) => item.id === employeeId ? {
        ...item,
        employmentEndDate: item.employmentEndDate ?? todayIsoDate(),
        separationReason: item.separationReason ?? 'Employee deactivated',
        separatedAt: item.separatedAt ?? separatedAt,
        separatedBy: item.separatedBy ?? separatedBy,
      } : item),
    }))
    return
  }

  // Reactivation starts a new current-employment state. Historical payroll
  // rows keep their own snapshots; the employee record must not carry a stale
  // end date into future payroll eligibility checks.
  useHrStore.setState((state) => ({
    employees: state.employees.map((item) => {
      if (item.id !== employeeId) return item
      const { employmentEndDate: _employmentEndDate, separationReason: _separationReason, separatedAt: _separatedAt, separatedBy: _separatedBy, ...activeEmployee } = item
      return activeEmployee
    }),
  }))
}
