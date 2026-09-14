import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceStore } from '../../store/financeStore'
import { useUserStore } from '../../store/userStore'
import { FinanceCategorySettingsPanel } from './FinanceCategorySettingsPanel'

describe('FinanceCategorySettingsPanel', () => {
  beforeEach(() => {
    useFinanceStore.setState({ transactions:[], customCategories:[], categoryOverrides:[] })
    useUserStore.getState().setRole('finance')
  })

  it('uses focused category drawers and shows category descriptions', () => {
    render(<FinanceCategorySettingsPanel />)
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
