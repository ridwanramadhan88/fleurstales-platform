import React from 'react'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PayrollStatusBadge } from '../components/payroll/PayrollStatusBadge'

const read = (path: string) => readFileSync(path, 'utf8')

describe('V2.7.29 completion regressions', () => {
  it('separates normal payroll waiting from actual review attention', () => {
    render(
      <div>
        <PayrollStatusBadge status="submitted_to_finance" />
        <PayrollStatusBadge status="needs_attention" />
        <PayrollStatusBadge status="returned_to_hr" />
        <PayrollStatusBadge status="paid" />
      </div>,
    )

    expect(screen.getByText('Finance review in progress')).toHaveClass('text-info')
    expect(screen.getByText('Needs attention')).toHaveClass('text-warning')
    expect(screen.getByText('Returned to HR')).toHaveClass('text-destructive')
    expect(screen.getByText('Paid')).toHaveClass('text-success')
  })

  it('keeps payroll readiness inline and responsive rather than opening another workflow surface', () => {
    const source = read('src/components/hr/HrPayrollSection.tsx')
    // Only open checks are listed; passed ones fold into "N of M ready".
    expect(source).toContain('readinessItems.filter((item) => !item.complete)')
    expect(source).toContain('`${passedCount} of ${readinessItems.length} ready`')
    expect(source).not.toContain('Payroll readiness dialog')
  })

  it('uses metric-aware comparison copy and discloses branch expense scope', () => {
    const source = read('src/components/dashboard/RevenueDashboard.tsx')
    expect(source).toContain("const comparisonItemLabel = trendMetric === 'revenue' ? 'orders' : 'transactions'")
    expect(source).toContain("Need at least two branches with ${trendMetric === 'revenue' ? 'revenue' : 'expenses'} to compare.")
    expect(source).toContain('Company-wide expenses are excluded from this branch view.')
  })
})
