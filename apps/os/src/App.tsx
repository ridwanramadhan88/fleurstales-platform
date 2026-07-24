import { useCallback, useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
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

export default function App() {
  const [view, setView] = useState<'login' | 'admin'>('login')
  const [selectedBranch, setSelectedBranch] = useState<BranchFilter>('All')
  const signIn = useUserStore((state) => state.signIn)
  const scheduleOverrides = useHrStore((state) => state.scheduleOverrides)
  const employeeDefaultSchedules = useHrStore((state) => state.employeeDefaultSchedules)
  const settings = useSettingsStore()
  const { theme, toggleTheme } = useTheme()

  const handleSignIn = useCallback(async (employee: Employee) => {
    const role = employee.systemRole
    const today = getLocalDateString(nowInJakarta())
    const effective = getEffectiveScheduleForDate({
      employee,
      date: today,
      defaults: employeeDefaultSchedules,
      overrides: scheduleOverrides,
      settings: { scheduling: settings.getSchedulingSettingsForDate(today), branches: settings.branches },
    })
    const assignedBranch = effective.shift.isWorking ? effective.shift.branchId : undefined
    signIn({ employeeId: employee.id, name: employee.name, username: employee.username ?? role, role, branchId: assignedBranch, scheduledBranchId: assignedBranch })
    if (getSharedSession().source !== 'supabase') {
      setSharedStaffSession(buildLocalStaffSession({ employeeId: employee.id, displayName: employee.name, role, branchId: assignedBranch, source: isSharedBackendConfigured() ? 'legacy_shared_backend' : 'local_demo' }))
    }
    setSelectedBranch(assignedBranch || 'All')
    await connectOperationalSupabase()
    setView('admin')
    if (role === 'owner') void refreshBusinessOsStoreFromRemote()
    void refreshBusinessOsCatalogFromRemote()
    void refreshBusinessOsOrdersFromRemote()
    void refreshBusinessOsCustomersFromRemote()
  }, [employeeDefaultSchedules, scheduleOverrides, settings, signIn])

  const handleSignOut = () => {
    stopBusinessOsCatalogBridge()
    stopBusinessOsStoreBridge()
    stopBusinessOsOrderBridge()
    stopBusinessOsCustomerBridge()
    stopOperationalSupabaseSync()
    clearSharedSession()
    void signOutSupabase()
    void signOutSharedBackend()
    setView('login')
  }

  if (view === 'login') {
    return <LoginPage onSignIn={handleSignIn} theme={theme} onToggleTheme={toggleTheme} />
  }

  return (
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              onSignOut={handleSignOut}
              theme={theme}
              onToggleTheme={toggleTheme}
              initialBranch={selectedBranch}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  )
}
