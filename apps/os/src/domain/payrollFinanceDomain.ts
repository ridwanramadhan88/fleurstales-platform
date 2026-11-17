/**
 * @file payrollFinanceDomain.ts
 * @description The one rule for "payroll waiting on Finance", shared by the
 * Tasks badge, the Payroll tab's Review count, and the Finance home card.
 *
 * A proposal turns `returned_to_hr` as soon as Finance returns one employee,
 * while the other employees may still wait for Finance. So a returned
 * proposal counts only while it still has rows pending Finance review; once
 * every row is decided it waits on HR, not on Finance.
 */

import type { EmployeePayrollDraft, PayrollProposal } from '../store/payrollStore'

type ProposalLike = Pick<PayrollProposal, 'status'> & Partial<Pick<PayrollProposal, 'employeePayrollIds'>>
type DraftLike = Pick<EmployeePayrollDraft, 'id' | 'status'>

export const payrollProposalNeedsFinance = (proposal: ProposalLike, drafts: readonly DraftLike[]): boolean => {
  if (proposal.status === 'submitted_to_finance') return true
  if (proposal.status !== 'returned_to_hr') return false
  const ids = new Set(proposal.employeePayrollIds ?? [])
  return drafts.some((draft) => ids.has(draft.id) && draft.status === 'pending_finance_review')
}

export const countPayrollNeedingFinance = (proposals: readonly ProposalLike[], drafts: readonly DraftLike[]): number =>
  proposals.filter((proposal) => payrollProposalNeedsFinance(proposal, drafts)).length

export const countPayrollReadyToPay = (proposals: readonly ProposalLike[]): number =>
  proposals.filter((proposal) => proposal.status === 'finance_approved').length
