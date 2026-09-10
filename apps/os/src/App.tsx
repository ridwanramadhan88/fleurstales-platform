import { useCallback, useEffect, useRef, useState } from 'react'
import HomePage from './pages/Home'
import LoginPage from './pages/Login'
import { useUserStore } from './store/userStore'
import { useHrStore } from './store/hrStore'
import { useSettingsStore } from './store/settingsStore'
import { usePersistenceHealthStore } from './store/persistenceHealthStore'
import { getEffectiveScheduleForDate } from './domain/hrSchedulingDomain'
import { getLocalDateString, nowInJakarta } from './domain/orderTimingDomain'
import { canHydrateCustomersForRole, resolveAuthoritativeStaffRole, resolveStaffBranchContext } from './domain/sessionHydrationDomain'
import type { Employee } from './store/hrStoreTypes'
import type { BranchFilter } from './types/orders'
import { useTheme } from './hooks/useTheme'
import { isSharedBackendConfigured, signOutSharedBackend } from './api/remoteSession'
import { getCatalogBridgeStatus, refreshBusinessOsCatalogFromRemote, stopBusinessOsCatalogBridge } from './data/shared/catalogBridge'
import { getBusinessOsOrdersRefreshError, refreshBusinessOsOrdersFromRemote, stopBusinessOsOrderBridge } from './data/shared/orderBridge'
import { getBusinessOsCustomersRefreshError, refreshBusinessOsCustomersFromRemote, stopBusinessOsCustomerBridge } from './data/shared/customerBridge'
import { getStoreBridgeStatus, refreshBusinessOsStoreFromRemote, stopBusinessOsStoreBridge } from './data/shared/storeBridge'
import { buildLocalStaffSession } from './data/shared/staffSessionDomain'
import { clearSharedSession, getSharedSession, setSharedStaffSession } from './data/shared/sharedSessionStore'
import { initializeSupabaseAuth, signOutSupabase, subscribeSupabaseAuth } from './api/supabaseAuth'
import { connectOperationalSupabase, stopOperationalSupabaseSync } from './data/operationalSupabaseSync'
import { connectAuthorizationSupabase, getAuthorizationHydrationError, stopAuthorizationSupabaseSync } from './data/authorizationSupabaseSync'
import { connectInternalSettingsSupabase, getInternalSettingsHydrationError, stopInternalSettingsSupabaseSync } from './data/internalSettingsSupabaseSync'
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

const hydrationErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown client error'

const runHydrationStage = async (
  label: string,
  hydrate: () => Promise<boolean>,
  getFailure?: () => string | undefined,
): Promise<{ ready: boolean; failure?: string }> => {
  try {
    const ready = await hydrate()
    if (ready) return { ready }
    return { ready, failure: `${label}: ${getFailure?.() ?? 'unavailable'}` }
  } catch (error) {
    return { ready: false, failure: `${label}: ${hydrationErrorMessage(error)}` }
  }
}

export default function App() {
  const [view, setView] = useState<'login' | 'admin'>('login')
  const [selectedBranch, setSelectedBranch] = useState<BranchFilter>('All')
  const signIn = useUserStore((state) => state.signIn)
  const clearSession = useUserStore((state) => state.clearSession)
  const resettingSessionRef = useRef(false)
  const { theme, toggleTheme } = useTheme()

  const resetSession = useCallback(async () => {
    if (resettingSessionRef.current) return
    resettingSessionRef.current = true
    try {
      stopAllProductionBridges()
      clearSharedSession()
      clearSession()
      setSelectedBranch('All')
      setView('login')
      await Promise.allSettled([signOutSupabase(), signOutSharedBackend()])
    } finally {
      resettingSessionRef.current = false
    }
  }, [clearSession])

  useEffect(() => {
    if (view !== 'admin') return
    const unsubscribe = subscribeSupabaseAuth((_event, session) => {
      const sharedSession = getSharedSession()
      if (sharedSession.kind !== 'staff' || sharedSession.source !== 'supabase') return
      const expectedUserId = sharedSession.userId
      if (!session || !expectedUserId || session.user.id !== expectedUserId) {
        void resetSession()
      }
    })
    return unsubscribe
  }, [resetSession, view])

  const handleSignIn = useCallback(async (employee: Employee) => {
    try {
      const sharedSession = getSharedSession()
      const role = resolveAuthoritativeStaffRole(employee.systemRole, sharedSession)
      const today = getLocalDateString(nowInJakarta())
      const profileBranch = employee.branch || undefined
      const productionSession = sharedSession.source === 'supabase'

      if (productionSession) {
        // `staff_access_profiles` has already authenticated the staff identity at
        // this point. Re-read Supabase Auth before any protected hydration so the
        // custom PostgREST token bridge cannot remain empty/stale after restore or
        // a just-completed sign-in. Never downgrade SESSION_REQUIRED into local
        // prototype data; fail closed with a sign-in message instead.
        const authSession = await initializeSupabaseAuth()
        const expectedUserId = sharedSession.userId
        if (!authSession || (expectedUserId && authSession.user.id !== expectedUserId)) {
          throw new Error('Your secure Fleurstales session expired. Please sign in again.')
        }
      }

      // Profile branch is only an initial operational hint. Never present it as
      // a schedule: schedule authority is hydrated separately from HR.
      signIn({ employeeId: employee.id, name: employee.name, username: employee.username ?? role, role, branchId: profileBranch, scheduledBranchId: undefined })
      if (!productionSession) {
        setSharedStaffSession(buildLocalStaffSession({ employeeId: employee.id, displayName: employee.name, role, branchId: profileBranch, source: isSharedBackendConfigured() ? 'legacy_shared_backend' : 'local_demo' }))
      }

      const authorization = await runHydrationStage('Authorization', connectAuthorizationSupabase, getAuthorizationHydrationError)
      const internalSettings = await runHydrationStage('Internal settings', connectInternalSettingsSupabase, getInternalSettingsHydrationError)
      const operational = await runHydrationStage('Operational domains', connectOperationalSupabase, () => usePersistenceHealthStore.getState().message)
      const staffOperations = await runHydrationStage('Staff schedule/attendance', connectStaffOperationsSupabase)
      const authorizationReady = authorization.ready
      const internalSettingsReady = internalSettings.ready
      const operationalReady = operational.ready
      const staffOperationsReady = staffOperations.ready
      if (productionSession && (!authorizationReady || !internalSettingsReady || !operationalReady || !staffOperationsReady)) {
        const failures = [authorization.failure, internalSettings.failure, operational.failure, staffOperations.failure]
          .filter((failure): failure is string => Boolean(failure))
        throw new Error(`Fleurstales startup hydration failed: ${failures.join('; ')}.`)
      }

      const hr = useHrStore.getState()
      const currentSettings = useSettingsStore.getState()
      const hydratedEmployee = hr.employees.find((candidate) => candidate.id === employee.id) ?? employee
      const datedAssignment = hr.scheduleOverrides.find((item) => item.employeeId === hydratedEmployee.id && item.date === today)
      const effective = getEffectiveScheduleForDate({
        employee: hydratedEmployee,
        date: today,
        defaults: hr.employeeDefaultSchedules,
        overrides: hr.scheduleOverrides,
        settings: { scheduling: currentSettings.getSchedulingSettingsForDate(today), branches: currentSettings.branches },
      })
      const candidateScheduledBranch = role === 'admin'
        ? (datedAssignment?.shift.isWorking ? datedAssignment.shift.branchId : undefined)
        : (effective.shift.isWorking ? effective.shift.branchId : undefined)
      const branchContext = resolveStaffBranchContext({
        role,
        scheduledBranchId: candidateScheduledBranch,
        profileBranchId: profileBranch,
        branches: currentSettings.branches,
      })
      const scheduledBranch = branchContext.scheduledBranchId
      const fallbackOperationalBranch = branchContext.fallbackOperationalBranchId
      const operationalBranch = scheduledBranch
        ?? (branchContext.requiresOperationalBranch ? fallbackOperationalBranch : undefined)

      if (productionSession) {
        // Authentication is independent from today's schedule. Admin/Florist
        // still need an active operational branch for branch-scoped RLS, so an
        // unscheduled session falls back to profile/default branch without
        // pretending that fallback is a scheduled assignment.
        if (branchContext.requiresOperationalBranch && !operationalBranch) {
          throw new Error('No active Fleurstales branch is available for this staff session.')
        }
        await setRuntimeBranchContext({ scheduledBranchId: scheduledBranch, operationalBranchId: operationalBranch, operationalDate: today })
      }

      signIn({ employeeId: hydratedEmployee.id, name: hydratedEmployee.name, username: hydratedEmployee.username ?? role, role, branchId: operationalBranch, scheduledBranchId: scheduledBranch })
      setSelectedBranch(operationalBranch || 'All')
      const payrollReady = await connectPayrollSupabase()
      if (productionSession && !payrollReady) throw new Error('Fleurstales Payroll data could not be hydrated for this authorized staff session.')
      const pointsReady = await connectEmployeePointsSupabase()
      if (productionSession && !pointsReady) throw new Error('Fleurstales employee-point authority could not be hydrated.')

      const shouldHydrateCustomers = canHydrateCustomersForRole(role, currentSettings.permissions, currentSettings.actionPermissions)
      const [storeReady, catalogReady, ordersReady, customersReady] = await Promise.all([
        refreshBusinessOsStoreFromRemote(),
        refreshBusinessOsCatalogFromRemote(),
        refreshBusinessOsOrdersFromRemote(),
        shouldHydrateCustomers ? refreshBusinessOsCustomersFromRemote() : Promise.resolve(true),
      ])
      if (productionSession && (!storeReady || !catalogReady || !ordersReady || !customersReady)) {
        const failures = [
          !storeReady ? `Store (${getStoreBridgeStatus().message ?? 'unknown client error'})` : undefined,
          !catalogReady ? `Catalog (${getCatalogBridgeStatus().message ?? 'unknown client error'})` : undefined,
          !ordersReady ? `Orders (${getBusinessOsOrdersRefreshError() ?? 'unknown client error'})` : undefined,
          !customersReady ? `Customers (${getBusinessOsCustomersRefreshError() ?? 'unknown client error'})` : undefined,
        ].filter((failure): failure is string => Boolean(failure))
        throw new Error(`Fleurstales production data could not be fully hydrated: ${failures.join(', ')}. The OS was not opened with prototype fallback data.`)
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
