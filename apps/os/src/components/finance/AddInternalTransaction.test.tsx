import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceStore } from '../../store/financeStore'
import { AddInternalTransaction } from './AddInternalTransaction'

describe('AddInternalTransaction', () => {
  beforeEach(() => useFinanceStore.setState({ transactions:[], customCategories:[], categoryOverrides:[] }))

  it('is available to Finance and Owner but not HR', () => {
    const { rerender } = render(<AddInternalTransaction branches={['Kedamaian']} actorName="HR" actorRole="hr" />)
    expect(screen.queryByRole('button', { name:'Add transaction' })).not.toBeInTheDocument()
    rerender(<AddInternalTransaction branches={['Kedamaian']} actorName="Owner" actorRole="owner" />)
    expect(screen.getByRole('button', { name:'Add transaction' })).toBeInTheDocument()
    rerender(<AddInternalTransaction branches={['Kedamaian']} actorName="Finance" actorRole="finance" />)
    expect(screen.getByRole('button', { name:'Add transaction' })).toBeInTheDocument()
  })

  it('creates a company-wide pending Money Out transaction by default', () => {
    render(<AddInternalTransaction branches={['Kedamaian','Pahoman']} defaultBranch="Pahoman" actorName="Finance" actorRole="finance" />)
    fireEvent.click(screen.getByRole('button', { name:'Add transaction' }))
    expect(screen.queryByLabelText('Transaction')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name:'Money Out' }))
    fireEvent.change(screen.getByLabelText('Transaction category'), { target:{ value:'utilities' } })
    fireEvent.change(screen.getByLabelText('Transaction'), { target:{ value:'Electricity bill' } })
    fireEvent.change(screen.getByLabelText('Amount IDR'), { target:{ value:'250000' } })
    fireEvent.click(screen.getByRole('button', { name:'Save as pending' }))

    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      type:'expense', category:'utilities', branch:'All', scope:'company', amount:250000,
      method:'transfer', status:'pending', name:'Electricity bill', description:'', actor:'Finance',
    })
    expect(screen.getByRole('status')).toHaveTextContent('pending verification')
  })

  it('reveals and requires Branch only when Specific branch is selected', () => {
    render(<AddInternalTransaction branches={['Kedamaian']} actorName="Finance" actorRole="finance" />)
    fireEvent.click(screen.getByRole('button', { name:'Add transaction' }))
    fireEvent.click(screen.getByRole('button', { name:'Money Out' }))
    fireEvent.change(screen.getByLabelText('Transaction category'), { target:{ value:'supplies' } })
    fireEvent.click(screen.getByRole('button', { name:'Specific branch' }))
    fireEvent.click(screen.getByRole('button', { name:'Save as pending' }))
    expect(screen.getByText('Transaction is required.')).toBeInTheDocument()
    expect(screen.getByText('Amount must be greater than zero.')).toBeInTheDocument()
    expect(screen.getByText('Select a Branch.')).toBeInTheDocument()
    expect(useFinanceStore.getState().transactions).toHaveLength(0)
  })

  it('allows manual automatic-category entries only with an audit reason', () => {
    render(<AddInternalTransaction branches={['Kedamaian']} actorName="Finance" actorRole="finance" />)
    fireEvent.click(screen.getByRole('button', { name:'Add transaction' }))
    fireEvent.click(screen.getByRole('button', { name:'Money Out' }))
    fireEvent.change(screen.getByLabelText('Transaction category'), { target:{ value:'payroll' } })
    fireEvent.change(screen.getByLabelText('Transaction'), { target:{ value:'Historical payroll correction' } })
    fireEvent.change(screen.getByLabelText('Amount IDR'), { target:{ value:'1000000' } })
    fireEvent.click(screen.getByRole('button', { name:'Save as pending' }))
    expect(screen.getByText('Explain why this automatic category is being entered manually.')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Explain why this automatic category is being entered manually.'), { target:{ value:'Historical payroll import' } })
    fireEvent.click(screen.getByRole('button', { name:'Save as pending' }))
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      category:'payroll', entryMode:'manual', status:'pending', manualEntryReason:'Historical payroll import',
    })
  })

  it('uses focused category drawers and shows category descriptions', () => {
    render(<AddInternalTransaction branches={['Kedamaian']} actorName="Finance" actorRole="finance" />)
    fireEvent.click(screen.getByRole('button', { name:'Manage categories' }))
    expect(screen.getByText('Created automatically when final payroll payment is recorded.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name:'Add category' }))
    expect(screen.getByText('Create a reusable manual expense category.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Expense category name'), { target:{ value:'Delivery' } })
    fireEvent.change(screen.getByLabelText('Expense category description'), { target:{ value:'Courier and local delivery costs.' } })
    fireEvent.click(screen.getByRole('button', { name:'Add category' }))
    expect(useFinanceStore.getState().customCategories[0]).toMatchObject({ name:'Delivery', description:'Courier and local delivery costs.', direction:'expense', active:true })
    expect(screen.getByText('Courier and local delivery costs.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name:'Edit Payroll' }))
    expect(screen.getByText(/System key:/)).toHaveTextContent('payroll')
    fireEvent.change(screen.getByLabelText('Expense category name'), { target:{ value:'Team payroll' } })
    fireEvent.click(screen.getByRole('button', { name:'Save category' }))
    expect(useFinanceStore.getState().categoryOverrides[0]).toMatchObject({ categoryId:'payroll', label:'Team payroll' })

    fireEvent.click(screen.getByRole('button', { name:'Archive Delivery' }))
    expect(useFinanceStore.getState().customCategories[0]?.active).toBe(false)
  })
})
