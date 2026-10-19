import { afterEach, describe, expect, it, vi } from 'vitest'
import { setItem } from './localApi'

describe('localApi.setItem quota handling', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not throw when the browser cache is full', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    await expect(setItem('audit-log', '{}')).resolves.toBeUndefined()
  })

  it('still surfaces unrelated storage errors', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(setItem('audit-log', '{}')).rejects.toThrow('boom')
  })
})
