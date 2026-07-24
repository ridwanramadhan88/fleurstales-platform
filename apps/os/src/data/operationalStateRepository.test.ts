import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('../api/localApi', () => mocks)

import {
  OPERATIONAL_STATE_RESOURCE,
  prototypeOperationalStateRepository,
} from './operationalStateRepository'

describe('prototypeOperationalStateRepository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses one stable resource key for load, save, remove, and subscription', async () => {
    mocks.getItem.mockResolvedValue('{"version":16}')
    mocks.setItem.mockResolvedValue(undefined)
    mocks.removeItem.mockResolvedValue(undefined)
    const unsubscribe = vi.fn()
    mocks.subscribe.mockReturnValue(unsubscribe)
    const onChange = vi.fn()

    await expect(prototypeOperationalStateRepository.load()).resolves.toBe('{"version":16}')
    await prototypeOperationalStateRepository.save('{"version":16}')
    await prototypeOperationalStateRepository.remove()
    await prototypeOperationalStateRepository.removeLegacyResources(['orders', 'customers'])
    expect(prototypeOperationalStateRepository.subscribe(onChange)).toBe(unsubscribe)

    expect(mocks.getItem).toHaveBeenCalledWith(OPERATIONAL_STATE_RESOURCE)
    expect(mocks.setItem).toHaveBeenCalledWith(OPERATIONAL_STATE_RESOURCE, '{"version":16}')
    expect(mocks.removeItem).toHaveBeenCalledWith(OPERATIONAL_STATE_RESOURCE)
    expect(mocks.removeItem).toHaveBeenCalledWith('orders')
    expect(mocks.removeItem).toHaveBeenCalledWith('customers')
    expect(mocks.subscribe).toHaveBeenCalledWith(OPERATIONAL_STATE_RESOURCE, onChange)
  })
})
