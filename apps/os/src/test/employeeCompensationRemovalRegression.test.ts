import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/hr/HrTabContent.tsx', 'utf8')

describe('employee compensation workflow removal', () => {
  it('keeps Employee Details limited to Profile and Access & Work', () => {
    expect(source).toContain("(['profile','access'] as const)")
    expect(source).not.toContain("'compensation'")
    expect(source).not.toContain('>Compensation<')
    expect(source).not.toContain('Current base salary')
  })

  it('keeps salary editing in Payroll instead of Employee Details', () => {
    const payroll = readFileSync('src/components/hr/HrPayrollSection.tsx', 'utf8')
    expect(payroll).toContain('setEmployeeCompensation')
    expect(payroll).toContain('Set base salary')
  })
})
