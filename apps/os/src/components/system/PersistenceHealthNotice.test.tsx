import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersistenceHealthStore } from '../../store/persistenceHealthStore'
import { PersistenceHealthNotice } from './PersistenceHealthNotice'

vi.mock('../../data/operationalSupabaseSync', () => ({
  backupAndReloadDomain: vi.fn(async () => true),
  retryDomainSave: vi.fn(async () => undefined),
}))

describe('PersistenceHealthNotice', () => {
  beforeEach(() => {
    usePersistenceHealthStore.setState({
      status: 'idle',
      message: undefined,
      domain: undefined,
      reason: undefined,
      revision: 0,
      storageBytes: 0,
    })
  })

  it('shows an Indonesian conflict message per section with a reload action', () => {
    usePersistenceHealthStore.setState({ status: 'conflict', domain: 'stock', reason: 'conflict', message: 'stock changed in another session.' })
    render(<PersistenceHealthNotice />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Ada data yang lebih baru')
    expect(alert).toHaveTextContent('Data Stok baru saja diubah')
    expect(alert).not.toHaveTextContent('order_drafts')
    expect(screen.getByRole('button', { name: /Muat ulang data terbaru/ })).toBeVisible()
  })

  it('offers retry and reload for a failed save in a known section', () => {
    usePersistenceHealthStore.setState({ status: 'error', domain: 'vouchers', reason: 'save_failed', message: 'boom' })
    render(<PersistenceHealthNotice />)
    expect(screen.getByRole('alert')).toHaveTextContent('Perubahan belum tersimpan')
    expect(screen.getByRole('button', { name: /Coba simpan lagi/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Muat ulang data terbaru/ })).toBeVisible()
  })

  it('falls back to a page reload when the section is unknown', () => {
    usePersistenceHealthStore.setState({ status: 'error', domain: undefined, reason: undefined, message: undefined })
    render(<PersistenceHealthNotice />)
    expect(screen.getByRole('button', { name: 'Muat ulang halaman' })).toBeVisible()
  })

  it('explains an expired session instead of showing the raw SESSION_REQUIRED code', () => {
    usePersistenceHealthStore.setState({ status: 'error', domain: undefined, reason: undefined, message: 'SESSION_REQUIRED' })
    render(<PersistenceHealthNotice />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sesi Anda sudah berakhir')
    expect(alert).not.toHaveTextContent('SESSION_REQUIRED')
  })

  it('does not add persistent UI for healthy idle state', () => {
    render(<PersistenceHealthNotice />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
