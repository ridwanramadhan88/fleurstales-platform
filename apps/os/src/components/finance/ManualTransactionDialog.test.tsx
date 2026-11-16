import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFinanceStore } from '../../store/financeStore'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { saveManualFinanceTransaction } from '../../data/financeManualTransaction'
import { ManualTransactionDialog } from './ManualTransactionDialog'

vi.mock('../../data/financeTransactionProof', () => ({
  uploadFinanceTransactionProof: vi.fn(async (file: File) => ({ path: 'finance/proof.png', fileName: file.name })),
  removeFinanceTransactionProof: vi.fn(async () => undefined),
}))

vi.mock('../../data/financeManualTransaction', () => ({
  saveManualFinanceTransaction: vi.fn(async () => 'txn-test'),
}))

const attachProof = () => {
  fireEvent.change(screen.getByLabelText('Transaction proof'), {
    target: { files: [new File(['proof'], 'proof.png', { type: 'image/png' })] },
  })
}

const renderDialog = (onClose = vi.fn()) => {
  render(<ManualTransactionDialog open direction="expense" onClose={onClose} branches={['Kedamaian', 'Pahoman']} defaultBranch="Pahoman" />)
  return onClose
}

describe('ManualTransactionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUiLanguage.setState({ language: 'id' })
    useFinanceStore.setState({ transactions: [], customCategories: [], categoryOverrides: [] })
  })

  it('records a company-wide Money Out with its proof and closes', async () => {
    const onClose = renderDialog()
    expect(screen.getByRole('dialog', { name: 'Catat uang keluar' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Transaction category'), { target: { value: 'utilities' } })
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'cash' } })
    fireEvent.change(screen.getByLabelText('Transaction'), { target: { value: 'Listrik' } })
    fireEvent.change(screen.getByLabelText('Amount IDR'), { target: { value: '250000' } })
    attachProof()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(saveManualFinanceTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expense', category: 'utilities', scope: 'company', branch: 'All', amount: 250000,
      method: 'cash', accountId: 'cash:main', name: 'Listrik', proofPath: 'finance/proof.png', transferFee: 0,
    }))
  })

  it('asks for every missing field, including a branch for branch entries', () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Transaction category'), { target: { value: 'supplies' } })
    fireEvent.click(screen.getByRole('button', { name: 'Satu cabang' }))
    fireEvent.change(screen.getByLabelText('Transaction branch'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(screen.getByText('Isi nama transaksi.')).toBeInTheDocument()
    expect(screen.getByText('Nominal harus lebih dari nol.')).toBeInTheDocument()
    expect(screen.getByText('Pilih cabang.')).toBeInTheDocument()
    expect(screen.getByText('Unggah bukti sebelum menyimpan.')).toBeInTheDocument()
    expect(saveManualFinanceTransaction).not.toHaveBeenCalled()
  })

  it('needs a reason before an automatic category is entered by hand', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Transaction category'), { target: { value: 'payroll' } })
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'cash' } })
    fireEvent.change(screen.getByLabelText('Transaction'), { target: { value: 'Koreksi gaji lama' } })
    fireEvent.change(screen.getByLabelText('Amount IDR'), { target: { value: '1000000' } })
    attachProof()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(screen.getByText('Jelaskan kenapa dicatat manual.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Manual entry reason'), { target: { value: 'Impor gaji lama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(saveManualFinanceTransaction).toHaveBeenCalledWith(expect.objectContaining({
      category: 'payroll', manualEntryReason: 'Impor gaji lama',
    })))
  })
})
