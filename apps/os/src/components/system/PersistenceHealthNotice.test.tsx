import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePersistenceHealthStore } from '../../store/persistenceHealthStore'
import { PersistenceHealthNotice } from './PersistenceHealthNotice'

describe('PersistenceHealthNotice', () => {
  beforeEach(() => {
    usePersistenceHealthStore.setState({
      status: 'idle',
      message: undefined,
      revision: 0,
      storageBytes: 0,
    })
  })

  it('surfaces rejected saves with a recovery action', () => {
    usePersistenceHealthStore.setState({
      status: 'error',
      message: 'Finance changes were rejected.',
    })

    render(<PersistenceHealthNotice />)

    expect(screen.getByRole('alert')).toHaveTextContent('Changes were not saved')
    expect(screen.getByRole('alert')).toHaveTextContent('Finance changes were rejected.')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
  })

  it('does not add persistent UI for healthy idle state', () => {
    render(<PersistenceHealthNotice />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
