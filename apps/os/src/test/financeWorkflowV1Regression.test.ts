import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Finance workflow v1 regressions', () => {
  it('commits manual Money In/Out through Supabase before reporting success', () => {
    const form = read('src/components/finance/ManualTransactionDialog.tsx')
    const client = read('src/data/financeManualTransaction.ts')

    expect(form).toContain("import { saveManualFinanceTransaction } from '../../data/financeManualTransaction'")
    expect(form).toContain('await saveManualFinanceTransaction({')
    expect(form).not.toContain('useFinanceStore.setState((state) =>')
    expect(form).not.toContain("generateId('txn')")
    expect(client).toContain("rpc<OperationalDomainResponse>('save_manual_finance_transaction'")
    expect(client).toContain("transactionCode: input.transactionCode?.trim().toUpperCase() || '-'")
    expect(client).toContain('await refreshFinance()')
  })

  it('keeps transfer fees separate for manual Money Out and account transfers', () => {
    const manual = read('src/components/finance/ManualTransactionDialog.tsx')
    const cashFlow = read('src/components/finance/CashFlowEntryDialog.tsx')

    expect(manual).toContain("tr('Transfer fee · optional', 'Biaya transfer · opsional')")
    expect(manual).toContain("transferFee: direction === 'expense' ? transferFee : 0")
    expect(cashFlow).toContain("tr('Transfer fee · optional', 'Biaya transfer · opsional')")
    expect(cashFlow).toContain("transferFee: mode === 'transfer' ? Number(transferFee) || 0 : undefined")
  })

  it('requires the paying account and supports a separate payroll transfer fee', () => {
    const payroll = read('src/components/finance/FinancePayrollReview.tsx')
    const client = read('src/data/financePayrollPayment.ts')

    expect(payroll).toContain("if (!paymentAccountId) nextErrors.paymentAccountId = 'Select the account that paid this payroll.'")
    expect(payroll).toContain('transferFee: Number(transferFee) || 0')
    expect(client).toContain("rpc('record_payroll_payment_with_account'")
    expect(client).toContain('p_finance_account_id: input.financeAccountId')
    expect(client).toContain('p_transfer_fee: Math.max(0, Math.round(input.transferFee ?? 0))')
  })

  it('moves refund cash only through the account-aware completion command', () => {
    const refunds = read('src/components/finance/FinanceRefundDialog.tsx')
    const client = read('src/data/orderRefundCompletion.ts')

    expect(refunds).toContain("setError(tr('Select the account that paid the refund.', 'Pilih rekening yang membayar pengembalian dana.'))")
    expect(refunds).toContain('await completeOrderRefundWithAccount({')
    expect(client).toContain("'complete_order_refund_with_account'")
    expect(client).toContain('p_finance_account_id: input.financeAccountId')
  })

  it('lets Finance edit and void every posted row through the server (Owner decision 2026-11-07)', () => {
    const editor = read('src/components/finance/FinancePostedTransactionEditor.tsx')
    const workspace = read('src/components/finance/FinanceWorkspace.tsx')
    const domain = read('src/domain/financeTransactionActionsDomain.ts')
    const client = read('src/data/financeCashFlow.ts')

    expect(editor).toContain('canEditFinanceTransaction(requested, true)')
    expect(workspace).toContain('canEditFinanceTransaction(detail, access.canEditEntry)')
    expect(workspace).toContain('canVoidFinanceTransaction(detail, access.canEditEntry)')
    expect(workspace).toContain('editable={detailEditable}')
    // Voided rows are final; the server freezes them too.
    expect(domain).toContain("isFinance && transaction.status === 'verified'")
    expect(client).toContain("'edit_finance_transaction_v2_guarded'")
    expect(client).toContain("'void_finance_transaction_guarded'")
  })
})