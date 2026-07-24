import type { FC } from 'react'
import {
  InternalTransactionVerificationQueue,
  type InternalTransactionVerificationQueueProps,
} from './InternalTransactionVerificationQueue'
import { useInternalTransactionVerificationQueueController } from './InternalTransactionVerificationQueueController'

export const InternalTransactionVerificationQueueContainer: FC<
  InternalTransactionVerificationQueueProps
> = (props) => {
  const viewModel = useInternalTransactionVerificationQueueController(props)

  return <InternalTransactionVerificationQueue {...viewModel} />
}
