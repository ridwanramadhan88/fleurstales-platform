import { describe, expect, it } from 'vitest'
import { distanceMeters, findNearestAttendanceBranch } from './attendanceLocationDomain'
describe('attendance location', () => {
  it('rejects a distant point', () => {
    expect(distanceMeters({ latitude:-5.3971, longitude:105.2668 }, { latitude:-5.4071, longitude:105.2668 })).toBeGreaterThan(1000)
  })
  it('matches the nearest active branch instead of enforcing a profile branch', () => {
    const result = findNearestAttendanceBranch(
      { latitude: -5.4210, longitude: 105.2580 },
      [
        { id: 'Kedamaian', name: 'Kedamaian', isActive: true, location: { latitude: -5.3971, longitude: 105.2668 } },
        { id: 'Pahoman', name: 'Pahoman', isActive: true, location: { latitude: -5.4210, longitude: 105.2580 } },
      ],
      100,
    )
    expect(result?.branch.id).toBe('Pahoman')
    expect(result?.withinAnyBranchRange).toBe(true)
  })
})
