import { describe, expect, it, vi } from 'vitest'
import { classifyCameraError, classifyLocationError, openSelfieCameraStream, SELFIE_CAMERA_ATTEMPTS } from './selfieCameraDomain'

const named = (name: string) => Object.assign(new Error(name), { name })
const stream = {} as MediaStream

describe('selfie camera opening', () => {
  it('reports an unsupported browser instead of a permission problem', async () => {
    expect(await openSelfieCameraStream(undefined)).toEqual({ ok: false, kind: 'unsupported' })
  })

  it('retries with simpler constraints when the camera rejects the size hints', async () => {
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(named('OverconstrainedError'))
      .mockRejectedValueOnce(named('NotReadableError'))
      .mockResolvedValueOnce(stream)
    expect(await openSelfieCameraStream({ getUserMedia })).toEqual({ ok: true, stream })
    expect(getUserMedia).toHaveBeenCalledTimes(3)
    expect(getUserMedia).toHaveBeenLastCalledWith(SELFIE_CAMERA_ATTEMPTS[2])
  })

  it('stops immediately when access is blocked', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(named('NotAllowedError'))
    expect(await openSelfieCameraStream({ getUserMedia })).toEqual({ ok: false, kind: 'permission' })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('tells a busy camera apart from a blocked one', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(named('NotReadableError'))
    expect(await openSelfieCameraStream({ getUserMedia })).toEqual({ ok: false, kind: 'busy' })
    expect(classifyCameraError(named('NotFoundError'))).toBe('not_found')
    expect(classifyCameraError('weird')).toBe('unknown')
  })

  it('tells location failures apart', () => {
    expect(classifyLocationError(1)).toBe('permission')
    expect(classifyLocationError(2)).toBe('unavailable')
    expect(classifyLocationError(3)).toBe('timeout')
  })
})
