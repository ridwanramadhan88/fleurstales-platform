import { describe, expect, it } from 'vitest'
import type { AlertKind } from './alertsDomain'
import {
  getVisibleNotifications,
  type NotificationRecord,
} from './notificationDomain'
import type { UserRole } from '../store/userStore'

const NOW = new Date('2026-07-09T12:00:00.000Z')
const allKinds: AlertKind[] = [
  'order_pending_verification',
  'finance_rejected',
  'admin_resubmitted',
  'hr_attendance_problem',
  'schedule_published',
  'authorization_changed',
]

const makeNotification = (
  kind: AlertKind,
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  id: kind,
  kind,
  severity: 'warning',
  title: kind,
  createdAt: NOW.toISOString(),
  branch: 'Kedamaian',
  ...overrides,
})

describe('role notification visibility', () => {
  it.each([
    ['owner', ['hr_attendance_problem', 'authorization_changed']],
    ['admin', ['finance_rejected', 'schedule_published', 'authorization_changed']],
    ['finance', ['order_pending_verification', 'admin_resubmitted', 'authorization_changed']],
    ['hr', ['hr_attendance_problem', 'authorization_changed']],
    ['florist', ['schedule_published', 'authorization_changed']],
  ] as [UserRole, AlertKind[]][])('%s sees only important role tasks', (role, expected) => {
    const visible = getVisibleNotifications({
      notifications: allKinds.map((kind) => makeNotification(kind)),
      role,
      branch: 'All',
      now: NOW,
    })
    expect(visible.map((item) => item.kind)).toEqual(expected)
  })

  it('keeps Admin notification reads company-wide even while browsing one branch', () => {
    const visible = getVisibleNotifications({
      notifications: [
        makeNotification('finance_rejected', { id: 'kdm', branch: 'Kedamaian' }),
        makeNotification('finance_rejected', { id: 'phm', branch: 'Pahoman' }),
        makeNotification('schedule_published', { id: 'global', branch: undefined }),
      ],
      role: 'admin',
      branch: 'Kedamaian',
      now: NOW,
    })
    expect(visible.map((item) => item.id)).toEqual(['kdm', 'phm', 'global'])
  })
})


describe('seven-day notification window', () => {
  it('includes exactly seven days and excludes older or future notifications', () => {
    const visible = getVisibleNotifications({
      notifications: [
        makeNotification('finance_rejected', { id: 'edge', createdAt: '2026-07-02T12:00:00.000Z' }),
        makeNotification('finance_rejected', { id: 'old', createdAt: '2026-07-02T11:59:59.999Z' }),
        makeNotification('finance_rejected', { id: 'future', createdAt: '2026-07-09T12:00:01.000Z' }),
      ],
      role: 'admin', branch: 'All', now: NOW,
    })
    expect(visible.map((item) => item.id)).toEqual(['edge'])
  })
})


describe('notification declutter', () => {
  it('does not surface routine new orders to Owner', () => {
    const visible = getVisibleNotifications({ notifications: [makeNotification('order_received')], role: 'owner', branch: 'All', now: NOW })
    expect(visible).toEqual([])
  })
})
