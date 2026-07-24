import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelfieAttendanceCard } from './SelfieAttendanceCard'
import { useHrStore } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'

vi.mock('../../domain/selfieImageDomain', async () => {
  const actual = await vi.importActual<typeof import('../../domain/selfieImageDomain')>('../../domain/selfieImageDomain')
  return { ...actual, compressSelfieToSquareJpeg: vi.fn(async () => 'data:image/jpeg;base64,abc') }
  it('does not unlock the selfie step when the employee is outside the branch radius', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude:-6.2, longitude:106.8, accuracy:10 } } as GeolocationPosition) } })
    render(<SelfieAttendanceCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Verify location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Move within/)
    expect(screen.queryByRole('button', { name: 'Open camera' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Upload check-in selfie photo')).not.toBeInTheDocument()
  })

})

const admin = {
  id: 'admin-1', name: 'Sari', position: 'Branch Admin', branch: '' as const,
  systemRole: 'admin' as const, status: 'active' as const, phone: '', hireDate: '2026-01-01',
  username: 'admin', pin: '123456',
}

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('SelfieAttendanceCard', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude:-5.3971, longitude:105.2668, accuracy:10 } } as GeolocationPosition) } })
    useUserStore.setState({ employeeId: admin.id, role: admin.systemRole, name: admin.name, username: admin.username })
    useHrStore.setState({ employees: [admin], attendance: [] })
  })

  it('shows the linked employee and requires a photo before check-in can be submitted', () => {
    render(<SelfieAttendanceCard />)
    expect(screen.getByText(/Linked employee:/)).toHaveTextContent('Sari')
    expect(screen.getByRole('button', { name: 'Verify location' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open camera' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit check-in' })).not.toBeInTheDocument()
  })

  it('submits a compressed uploaded selfie and shows completed check-in', async () => {
    render(<SelfieAttendanceCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Verify location' }))
    expect(await screen.findByText('Location verified')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Upload check-in selfie photo'), { target: { files: [new File(['x'], 'selfie.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Submit check-in' }))
    expect(await screen.findByText(/Checked in/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /My attendance/ }))
    expect(await screen.findByText('Check-in recorded successfully.')).toBeInTheDocument()
    expect(useHrStore.getState().attendance[0].source).toBe('selfie')
    expect(useHrStore.getState().attendance[0].checkInAt).toBeTruthy()
  })
  it('does not unlock the selfie step when the employee is outside the branch radius', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude:-6.2, longitude:106.8, accuracy:10 } } as GeolocationPosition) } })
    render(<SelfieAttendanceCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Verify location' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Move within/)
    expect(screen.queryByRole('button', { name: 'Open camera' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Upload check-in selfie photo')).not.toBeInTheDocument()
  })

  it('accepts the nearest active branch without relying on an employee default branch', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude:-5.4210, longitude:105.2580, accuracy:10 } } as GeolocationPosition) } })
    render(<SelfieAttendanceCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Verify location' }))
    expect((await screen.findAllByText(/Location verified/i)).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Upload check-in selfie photo'), { target: { files: [new File(['x'], 'selfie.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Submit check-in' }))
    const location = useHrStore.getState().attendance[0].checkInLocation
    expect(location?.detectedBranchId).toBe('Pahoman')
    expect(location?.branchMismatch).toBe(false)
    expect(location?.reviewStatus).toBe('pending_review')
  })

})
