export interface PendingPayrollPaymentContext {
  payrollProposalId: string
  financeAccountId: string
  transferFeeAmount: number
}

let pending: PendingPayrollPaymentContext | undefined

export const setPendingPayrollPaymentContext = (context: PendingPayrollPaymentContext): void => {
  pending = {
    payrollProposalId: context.payrollProposalId,
    financeAccountId: context.financeAccountId,
    transferFeeAmount: Math.max(0, Math.round(context.transferFeeAmount || 0)),
  }
}

export const getPendingPayrollPaymentContext = (): PendingPayrollPaymentContext | undefined => pending

export const clearPendingPayrollPaymentContext = (payrollProposalId?: string): void => {
  if (!payrollProposalId || pending?.payrollProposalId === payrollProposalId) pending = undefined
}
