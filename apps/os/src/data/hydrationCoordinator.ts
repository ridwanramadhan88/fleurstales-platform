export interface HydrationCoordinator {
  readonly isHydrating: boolean
  run<T>(task: () => Promise<T>): Promise<T>
}

/**
 * Serializes remote hydration work and keeps the hydration guard active for
 * the complete task. This prevents overlapping realtime refreshes from
 * turning remote store updates into local persistence writes.
 */
export const createHydrationCoordinator = (): HydrationCoordinator => {
  let activeHydrations = 0
  let queue: Promise<void> = Promise.resolve()

  return {
    get isHydrating() {
      return activeHydrations > 0
    },
    run<T>(task: () => Promise<T>): Promise<T> {
      const execute = async (): Promise<T> => {
        activeHydrations += 1
        try {
          return await task()
        } finally {
          activeHydrations -= 1
        }
      }

      const result = queue.then(execute, execute)
      queue = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
}
