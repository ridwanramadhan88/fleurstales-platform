import type { UserRole } from '../../store/userStore'

export interface StaffAccountDraft {
  name: string
  email: string
  username: string
  pin: string
  systemRole: UserRole
  phone: string
  hireDate: string
  baseSalaryIdr: number
}
