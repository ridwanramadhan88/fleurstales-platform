import { beforeEach, describe, expect, it } from 'vitest'
import { useHrProblemStore } from './hrProblemStore'

beforeEach(() => useHrProblemStore.setState({ reviews: {} }))

describe('standalone HR problem review store', () => {
  it('refuses attendance mirrors because attendance cases own their lifecycle', () => {
    useHrProblemStore.getState().setProblemStatus('attendance:case-1', 'solved', 'Handled', 'Star')
    expect(useHrProblemStore.getState().reviews).toEqual({})
  })

  it('continues to resolve Finance and late-fulfillment problems with audit metadata', () => {
    useHrProblemStore.getState().setProblemStatus('finance:order-1:rejected', 'solved', 'Corrected', 'Star')
    useHrProblemStore.getState().setProblemStatus('order-late:order-2', 'under_review', 'Checking', 'Star')

    const reviews = useHrProblemStore.getState().reviews
    expect(reviews['finance:order-1:rejected']).toMatchObject({
      status: 'solved',
      reviewNote: 'Corrected',
      reviewedBy: 'Star',
    })
    expect(reviews['finance:order-1:rejected'].resolvedAt).toBeTruthy()
    expect(reviews['order-late:order-2']).toMatchObject({
      status: 'under_review',
      reviewNote: 'Checking',
      reviewedBy: 'Star',
    })
    expect(reviews['order-late:order-2'].resolvedAt).toBeUndefined()
  })
})
