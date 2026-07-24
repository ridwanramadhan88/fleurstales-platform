import { useEffect, useState } from 'react'
import { connectSharedOrderBackend, getRealtimeState, subscribeRealtimeState, type RealtimeSnapshot } from '../core/realtime/sharedBackend'
export const useSharedOrderBackend = (branch: string | 'All') => {
  const [status, setStatus] = useState<RealtimeSnapshot>(getRealtimeState())
  useEffect(() => subscribeRealtimeState(setStatus), [])
  useEffect(() => connectSharedOrderBackend({ branch }), [branch])
  return status
}
