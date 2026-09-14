import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFinanceStore } from '../../store/financeStore'
import { saveManualFinanceTransaction } from '../../data/financeManualTransaction'
import { AddInternalTransaction } from './AddInternalTransaction'

vi.mock('../../data/financeTransactionProof', () => ({
  uploadFinanceTransactionProof: vi.fn(async (file: File) => ({
    path: 'finance-user/2026-09-13/test-proof.png',
    fileName: file.name,
  })),
  removeFinanceTransactionProof: vi.fn(async () => undefined),
}))

vi.mock('../../data/financeManualTransaction', () => ({
  saveManualFinanceTransaction: vi.fn(async () => 'txn-test'),
}))

const attachProof = () => {
  const proof = new File(['proof'], 'proof.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText(/Upload bukti/i), { target: { files: [proof] } })
}

describe('AddInternalTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFinanceStore.setState({ transactions:[], customCategories:[], categoryOverrides:[] })
  })

  it('is available only to Finance', () => {
    const { rerender } = render(<AddInternalTransaction branches={['Kedamaian']} actorName="HR" actorRole="hr" />)
    expect(screen.queryByRole('button', { name:'Add transaction' })).not.toBeInTheDocument()
    rerender(<AddInternalTransaction branches={['Kedamaian']} actorName="Owner" actorRole="owner" />)
    expect(screen.queryByRole('button', { name:'Add transaction' })).not.toBeInTheDocument()
    rerender(<AddInternalTransaction branches={['Kedamaian']} actorName="Finance" actorRole="finance" />)
    expect(screen.getByRole('button', { name:'Add transaction' })).toBeInTheDocument()
  })

  it('creates a final company-wide Money Out transaction with proof and a default transaction code', async () => {
    render(<AddInternalTransaction branches={['Kedamaian','Pahoman']} defaultBranch="Pahoman" actorName="Finance" actorRole="finance" />)
    fireEvent.click(screen.getByRole('button', { name:'Add transaction' }))
    expect(screen.queryByLabelText('Transaction')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name:'Money Out' }))
    fireEvent.change(screen.getByLabelText('Transaction category'), { target:{ value:'utilities' } })
    fireEvent.change(screen.getByLabelText('Payment method'), { target:{ value:'cash' } })
    fireEvent.change(screen.getByLabelText('Transaction'), { target:{ value:'Electricity bill' } })
    fireEvent.change(screen.getByLabelText('Amount IDR'), { target:{ value:'250000' } })
    attachProof()
    fireEvent.click(screen.getByRole('button', { name:'Save transaction' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Manual transaction recorded.')
    expect(saveManualFinanceTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type:'expense', category:'utilities', branch:'All', scope:'company', amount:250000,
      method:'cash', name:'Electricity bill', note:'', manualEntryReason:'',
      accountId:'cash:main', transactionCode:'', proofPath:'finance-user/2026-09-13/test-proof.png',
      proofFileName:'proof.png', transferFee:0,
    }))
  })

  it('reveals and requires Branch only when Specific branch is selected', () => {
    render(<AddInternalTransaction branches={['Kedamaian']} actorName="Finance" actorRole="finance" />)
    fireEvent.click(screen.getByRole('button', { name:'Add transaction' }))
    fireEvent.click(screen.getByRole('button', { name:'Money Out' }))
    fireEvent.change(screen.getByLabelText('Transaction category'), { target:{ value:'supplies' } })
    fireEvent.click(screen.getByRole('button', { name:'Specific branch' }))
    fireEvent.click(screen.getByRole('button', { name:'Save transaction' }))
    expect(screen.getByText('Transaction is required.')).toBeInTheDocument()
    expect(screen.getByText('Amount must be greater than zero.')).toBeInTheDocument()
    expect(screen.getByText('Select a Branch.')).toBeInTheDocument()
    expect(screen.getByText('Upload bukti transaksi sebelum menyimpan.')).toBeInTheDocument()
    expect(useFinanceStore.getState().transactions).toHaveLength(0)
  })

  it('allows manual automatic-category entries only with an audit reason and proof', async () => {
    render(<AddInternalTransaction branches={['Kedamaian']} actorName="Finance" actorRole="finance" />)
    fireEvent.click(screen.getByRole('button', { name:'Add transaction' }))
    fireEvent.click(screen.getByRole('button', { name:'Money Out' }))
    fireEvent.change(screen.getByLabelText('Transaction category'), { target:{ value:'payroll' } })
    fireEvent.change(screen.getByLabelText('Payment method'), { target:{ value:'cash' } })
    fireEvent.change(screen.getByLabelText('Transaction'), { target:{ value:'Historical payroll correction' } })
    fireEvent.change(screen.getByLabelText('Amount IDR'), { target:{ value:'1000000' } })
    attachProof()
    fireEvent.click(screen.getByRole('button', { name:'Save transaction' }))
    expect(screen.getByText('Explain why this automatic category is being entered manually.')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Explain why this automatic category is being entered manually.'), { target:{ value:'Historical payroll import' } })
    fireEvent.click(screen.getByRole('button', { name:'Save transaction' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Manual transaction recorded.')
    expect(saveManualFinanceTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type:'expense', category:'payroll', manualEntryReason:'Historical payroll import',
      accountId:'cash:main', transactionCode:'', proofPath:'finance-user/2026-09-13/test-proof.png',
      proofFileName:'proof.png',
    }))
  })

  it('keeps category configuration out of the daily transaction surface', () => {
    render(<AddInternalTransaction branches={['Kedamaian']} actorName="Finance" actorRole="finance" />)
    expect(screen.queryByRole('button', { name:'Manage categories' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name:'Add transaction' })).toBeInTheDocument()
  })
})
