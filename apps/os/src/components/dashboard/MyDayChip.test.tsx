import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MyDayChip, OPEN_MY_DAY_EVENT } from './MyDayStrip'
import { todayIsoDate, useHrStore } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import type { ScheduleOverride } from '../../store/hrStoreTypes'

afterEach(() => cleanup())

const shiftToday = { id: 's', employeeId: 'e1', date: todayIsoDate(), updatedAt: '', updatedBy: '', shift: { isWorking: true, branchId: 'kedamaian', startTime: '08:00', endTime: '16:00', mode: 'custom' } } as unknown as ScheduleOverride

describe('attendance chip in the top bar', () => {
  it('asks staff with a shift to check in', () => {
    useUserStore.setState({ role: 'florist', employeeId: 'e1', name: 'Rina' })
    useHrStore.setState({ attendance: [], scheduleOverrides: [shiftToday] })
    render(<MyDayChip />)
    expect(screen.getByRole('button', { name: /Not checked in|Belum absen/ })).toHaveTextContent(/Check in|Absen/)
  })

  it('opens from anywhere through the event (e.g. a schedule notification)', () => {
    useUserStore.setState({ role: 'admin', employeeId: 'e1', name: 'Ayu' })
    useHrStore.setState({ attendance: [], scheduleOverrides: [] })
    render(<MyDayChip />)
    fireEvent(window, new Event(OPEN_MY_DAY_EVENT))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('is not shown to the Owner', () => {
    useUserStore.setState({ role: 'owner', employeeId: 'o1', name: 'Rid' })
    const { container } = render(<MyDayChip />)
    expect(container).toBeEmptyDOMElement()
  })
})
