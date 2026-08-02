import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('browser runtime behavior', () => {
  it('prevents mobile form-focus zoom without disabling viewport scaling', () => {
    const css = read('src/shadcn.css')
    const html = read('index.html')

    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('font-size: 16px !important')
    expect(html).not.toContain('user-scalable=no')
    expect(html).not.toContain('maximum-scale=1')
  })

  it('restores sessions behind a loading surface and resets workspace navigation scroll', () => {
    const login = read('src/pages/Login.tsx')
    const home = read('src/pages/Home.tsx')

    expect(login).toContain('isRestoringSession')
    expect(login).toContain('Restoring your secure session')
    expect(home).toContain("window.scrollTo({ top: 0, left: 0, behavior: 'auto' })")
    expect(home).toContain('[activeTab, activeOrdersSubTab, financeModule, peopleSection]')
  })

  it('reconciles orders and notifications on Realtime reconnect without duplicate roster streams', () => {
    const realtime = read('src/data/realtimeSupabaseSync.ts')

    expect(realtime).toContain("status !== 'SUBSCRIBED'")
    expect(realtime).toContain('queueNotificationRefresh()')
    expect(realtime).toContain('queueOrderRefresh()')
    expect(realtime).toContain("table: 'staff_roster_refresh_events'")
    expect(realtime).toContain("table: 'employee_point_events'")
    expect(realtime).not.toContain("table: 'staff_schedule_defaults'")
    expect(realtime).not.toContain("table: 'staff_schedule_overrides'")
    expect(realtime).not.toContain("table: 'staff_attendance_records'")
  })
})
