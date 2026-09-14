import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Finance workflow v1 regressions', () => {
  it('commits manual Money In/Out through Supabase before reporting success', () => {
    const form = read('src/components/finance/AddInternalTransaction.tsx')
    const client = read('src/data/financeManualTransaction.ts')

    expect(form).toContain("import { saveManualFinanceTransaction } from '../../data/financeManualTransaction'")
    expect(form).toContain('await saveManualFinanceTransaction({')
    expect(form).not.toContain('useFinanceStore.setState((state) =>')
    expect(form).not.toContain("generateId('txn')")
    expect(client).toContain("rpc<OperationalDomainResponse>('save_manual_finance_transaction'")
    expect(client).toContain('await refreshFinance()')
  })

  it('keeps transfer fees separate for manual Money Out and account transfers', () => {
    const manual = read('src/components/finance/AddInternalTransaction.tsx')
    const cashFlow = read('src/components/finance/FinanceCashFlowOverview.tsx')

    expect(manual).toContain('Transfer fee · Optional (IDR)')
    expect(manual).toContain("direction === 'expense' ? transferFee : 0")
    expect(cashFlow).toContain('Transfer fee · Optional (IDR)')
    expect(cashFlow).toContain('transferFee: dialogMode === \'transfer\' ? numericTransferFee : undefined')
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
    const refunds = read('src/components/finance/FinanceRefundQueue.tsx')
    const client = read('src/data/orderRefundCompletion.ts')

    expect(refunds).toContain("setActionError('Select the account that paid the refund.')")
    expect(refunds).toContain('await completeOrderRefundWithAccount({')
    expect(client).toContain("rpc('complete_order_refund_with_account'")
  })

  it('keeps automatic source-owned ledger rows out of generic editing', () => {
    const editor = read('src/components/finance/FinancePostedTransactionEditor.tsx')
    const ledger = read('src/components/finance/TransactionLedger.tsx')

    expect(editor).toContain("entryMode !== 'manual'")
    expect(ledger).toContain("entryMode === 'manual'")
  })
})
