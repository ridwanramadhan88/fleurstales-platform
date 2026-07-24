/**
 * Repository boundary for the versioned operational snapshot.
 *
 * The application persistence coordinator depends on this contract instead of
 * knowing whether the snapshot is stored in localStorage or the local SQLite
 * backend. A future API implementation can replace this adapter without
 * changing store hydration, migrations, backup, or persistence health logic.
 */
import { getItem, removeItem, setItem, subscribe } from '../api/localApi'

export interface OperationalStateRepository {
  load(): Promise<string | null>
  save(serializedSnapshot: string): Promise<void>
  remove(): Promise<void>
  removeLegacyResources(resourceKeys: string[]): Promise<void>
  subscribe(onExternalChange: () => void): () => void
}

export const OPERATIONAL_STATE_RESOURCE = 'operational-state'

export const prototypeOperationalStateRepository: OperationalStateRepository = {
  load: () => getItem(OPERATIONAL_STATE_RESOURCE),
  save: (serializedSnapshot) => setItem(OPERATIONAL_STATE_RESOURCE, serializedSnapshot),
  remove: () => removeItem(OPERATIONAL_STATE_RESOURCE),
  removeLegacyResources: async (resourceKeys) => {
    await Promise.all(resourceKeys.map((resourceKey) => removeItem(resourceKey)))
  },
  subscribe: (onExternalChange) => subscribe(OPERATIONAL_STATE_RESOURCE, onExternalChange),
}
