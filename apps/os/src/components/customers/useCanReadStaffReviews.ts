import { hasActionPermission } from '../../config/actionPermissions'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'

// Mirrors the backend rule in `get_staff_reviews`: customer view access AND
// `orders.read_all`. Roles without it (for example Florist) must not see review UI.
export const useCanReadStaffReviews = (): boolean => {
  const role = useUserStore((state) => state.role)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  return hasActionPermission(role, 'orders.read_all', actionPermissions)
}
