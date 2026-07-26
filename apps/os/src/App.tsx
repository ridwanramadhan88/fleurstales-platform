import { useCallback, useState } from 'react'
import HomePage from './pages/Home'
import LoginPage from './pages/Login'
import { useUserStore } from './store/userStore'
import { useHrStore } from './store/hrStore'
import { useSettingsStore } from './store/settingsStore'
import { getEffectiveScheduleForDate } from './domain/hrSchedulingDomain'
import { getLocalDateString, nowInJakarta } from './domain/orderTimingDomain'
import type { Employee } from './store/hrStoreTypes'
import type { BranchFilter } from './types/orders'
import { useTheme } from './hooks/useTheme'
import { isSharedBackendConfigured, signOutSharedBackend } from './api/remoteSession'
import { refreshBusinessOsCatalogFromRemote, stopBusinessOsCatalogBridge } from './data/shared/catalogBridge'
import { refreshBusinessOsOrdersFromRemote, stopBusinessOsOrderBridge } from './data/shared/orderBridge'
import { refreshBusinessOsCustomersFromRemote, stopBusinessOsCustomerBridge } from './data/shared/customerBridge'
import { refreshBusinessOsStoreFromRemote, stopBusinessOsStoreBridge } from './data/shared/storeBridge'
import { buildLocalStaffSession } from './data/shared/staffSessionDomain'
import { clearSharedSession, getSharedSession, setSharedStaffSession } from './data/shared/sharedSessionStore'
import { signOutSupabase } from './api/supabaseAuth'
import { connectOperationalSupabase, stopOperationalSupabaseSync } from './data/operationalSupabaseSync'
import { connectAuthorizationSupabase, stopAuthorizationSupabaseSync } from './data/authorizationSupabaseSync'
import { connectInternalSettingsSupabase, stopInternalSettingsSupabaseSync } from './data/internalSettingsSupabaseSync'
import { setRuntimeBranchContext } from './data/runtimeBranchSupabase'
import { connectPayrollSupabase, stopPayrollSupabaseSync } from './data/payrollSupabaseSync'
import { connectRealtimeSupabase, stopRealtimeSupabaseSync } from './data/realtimeSupabaseSync'
import { connectStaffOperationsSupabase, stopStaffOperationsSupabase } from './data/staffOperationsSupabaseSync'
import { hydrateSecurityAuditFromSupabase } from './data/auditSupabaseSync'
import { connectEmployeePointsSupabase, stopEmployeePointsSupabase } from './data/employeePointsSupabaseSync'

const stopAllProductionBridges = (): void => {
  stopBusinessOsCatalogBridge()
  stopBusinessOsStoreBridge()
  stopBusinessOsOrderBridge()
  stopBusinessOsCustomerBridge()
  stopOperationalSupabaseSync()
  stopAuthorizationSupabaseSync()
  stopInternalSettingsSupabaseSync()
  stopPayrollSupabaseSync()
  stopRealtimeSupabaseSync()
  stopStaffOperationsSupabase()
  stopEmployeePointsSupabase()
}

export default function App() {
  const [view, setView] = useState<'login' | 'admin'>('login')
  const [selectedBranch, setSelectedBranch] = useState<BranchFilter>('All')
  const signIn = useUserStore((state) => state.signIn)
  const clearSession = useUserStore((state) => state.clearSession)
  const { theme, toggleTheme } = useTheme()

  const resetSession = useCallback(async () => {
    stopAllProductionBridges()
    clearSharedSession()
    clearSession()
    setSelectedBranch('All')
    setView('login')
    await Promise.allSettled([signOutSupabase(), signOutSharedBackend()])
  }, [clearSession])

  const handleSignIn = useCallback(async (employee: Employee) => {
    try {
      const role = employee.systemRole
      const today = getLocalDateString(nowInJakarta())
      const profileBranch = employee.branch || undefined

      signIn({ employeeId: employee.id, name: employee.name, username: employee.username ?? role, role, branchId: profileBranch, scheduledBranchId: profileBranch })
      if (getSharedSession().source !== 'supabase') {
        setSharedStaffSession(buildLocalStaffSession({ employeeId: employee.id, displayName: employee.name, role, branchId: profileBranch, source: isSharedBackendConfigured() ? 'legacy_shared_backend' : 'local_demo' }))
      }

      const authorizationReady = await connectAuthorizationSupabase()
      const internalSettingsReady = await connectInternalSettingsSupabase()
      const operationalReady = await connectOperationalSupabase()
      const staffOperationsReady = await connectStaffOperationsSupabase()
      if (getSharedSession().source === 'supabase' && (!authorizationReady || !internalSettingsReady || !operationalReady || !staffOperationsReady)) {
        throw new Error('Fleurstales staff authority, settings, schedule, or operational data could not be fully hydrated.')
      }

      const hr = useHrStore.getState()
      const currentSettings = useSettingsStore.getState()
      const hydratedEmployee = hr.employees.find((candidate) => candidate.id === employee.id) ?? employee
      const effective = getEffectiveScheduleForDate({
        employee: hydratedEmployee,
        date: today,
        defaults: hr.employeeDefaultSchedules,
        overrides: hr.scheduleOverrides,
        settings: { scheduling: currentSettings.getSchedulingSettingsForDate(today), branches: currentSettings.branches },
      })
      const assignedBranch = effective.shift.isWorking ? effective.shift.branchId : undefined
      const activeBranches = currentSettings.branches.filter((branch) => branch.isActive)
      const profileBranchIsActive = profileBranch && activeBranches.some((branch) => branch.id === profileBranch)
      const fallbackOperationalBranch = profileBranchIsActive
        ? profileBranch
        : (activeBranches.find((branch) => branch.isDefault)?.id ?? activeBranches[0]?.id)
      const requiresOperationalBranch = role === 'admin' || role === 'florist'
      const operationalBranch = assignedBranch ?? (requiresOperationalBranch ? fallbackOperationalBranch : undefined)

      if (getSharedSession().source === 'supabase') {
        if (requiresOperationalBranch && !operationalBranch) throw new Error('No active Fleurstales branch is available for this staff session.')
        await setRuntimeBranchContext({ scheduledBranchId: assignedBranch, operationalBranchId: operationalBranch, operationalDate: today })
      }

      signIn({ employeeId: hydratedEmployee.id, name: hydratedEmployee.name, username: hydratedEmployee.username ?? role, role, branchId: operationalBranch, scheduledBranchId: assignedBranch })
      setSelectedBranch(operationalBranch || 'All')
      const payrollReady = await connectPayrollSupabase()
      if (getSharedSession().source === 'supabase' && !payrollReady) throw new Error('Fleurstales Payroll data could not be hydrated for this authorized staff session.')
      const pointsReady = await connectEmployeePointsSupabase()
      if (getSharedSession().source === 'supabase' && !pointsReady) throw new Error('Fleurstales employee-point authority could not be hydrated.')

      const [storeReady, catalogReady, ordersReady, customersReady] = await Promise.all([
        refreshBusinessOsStoreFromRemote(),
        refreshBusinessOsCatalogFromRemote(),
        refreshBusinessOsOrdersFromRemote(),
        refreshBusinessOsCustomersFromRemote(),
      ])
      if (getSharedSession().source === 'supabase' && (!storeReady || !catalogReady || !ordersReady || !customersReady)) {
        throw new Error('Fleurstales production data could not be fully hydrated. The OS was not opened with prototype fallback data.')
      }
      await hydrateSecurityAuditFromSupabase().catch(() => false)
      await connectRealtimeSupabase()
      setView('admin')
    } catch (error) {
      await resetSession()
      throw error
    }
  }, [resetSession, signIn])

  const handleSignOut = () => { void resetSession() }

  if (view === 'login') return <LoginPage onSignIn={handleSignIn} theme={theme} onToggleTheme={toggleTheme} />
  return <HomePage onSignOut={handleSignOut} theme={theme} onToggleTheme={toggleTheme} initialBranch={selectedBranch} />
}
