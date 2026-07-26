import { describe, expect, it } from 'vitest'
import { createHydrationCoordinator } from './hydrationCoordinator'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('hydration coordinator', () => {
  it('serializes overlapping hydration requests and keeps the guard active', async () => {
    const coordinator = createHydrationCoordinator()
    const firstGate = deferred<void>()
    const events: string[] = []

    const first = coordinator.run(async () => {
      events.push('first:start')
      expect(coordinator.isHydrating).toBe(true)
      await firstGate.promise
      events.push('first:end')
      return 1
    })
    const second = coordinator.run(async () => {
      events.push('second:start')
      expect(coordinator.isHydrating).toBe(true)
      events.push('second:end')
      return 2
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    expect(coordinator.isHydrating).toBe(true)

    firstGate.resolve()
    await expect(first).resolves.toBe(1)
    await expect(second).resolves.toBe(2)
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
    expect(coordinator.isHydrating).toBe(false)
  })

  it('continues the queue after a failed hydration', async () => {
    const coordinator = createHydrationCoordinator()

    await expect(coordinator.run(async () => {
      throw new Error('load failed')
    })).rejects.toThrow('load failed')

    await expect(coordinator.run(async () => 'recovered')).resolves.toBe('recovered')
    expect(coordinator.isHydrating).toBe(false)
  })
})
