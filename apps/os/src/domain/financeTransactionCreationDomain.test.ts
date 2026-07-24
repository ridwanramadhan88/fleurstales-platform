import { describe, expect, it } from 'vitest'
import { canCreateFinanceTransaction } from './financeTransactionCreationDomain'

const valid = {
  type:'expense' as const,
  category:'supplies' as const,
  branch:'Kedamaian',
  scope:'branch' as const,
  amount:100000,
  method:'cash' as const,
  name:'Wrapping supplies',
  actor:{ name:'Finance', role:'finance' as const },
}

describe('finance transaction creation guard', () => {
  it('allows valid Finance and Owner transactions', () => {
    expect(canCreateFinanceTransaction(valid).allowed).toBe(true)
    expect(canCreateFinanceTransaction({ ...valid, actor:{ name:'Owner', role:'owner' as const } }).allowed).toBe(true)
  })
  it('blocks roles outside Finance and Owner', () => {
    expect(canCreateFinanceTransaction({ ...valid, actor:{ name:'HR', role:'hr' as const } }).allowed).toBe(false)
  })
  it('requires a branch only for branch scope, plus a positive amount and title', () => {
    expect(canCreateFinanceTransaction({ ...valid, branch:'All' }).allowed).toBe(false)
    expect(canCreateFinanceTransaction({ ...valid, scope:'company', branch:'All' }).allowed).toBe(true)
    expect(canCreateFinanceTransaction({ ...valid, amount:0 }).allowed).toBe(false)
    expect(canCreateFinanceTransaction({ ...valid, name:'   ' }).allowed).toBe(false)
  })
  it('blocks direction mismatches and requires a reason for manual automatic-category entries', () => {
    expect(canCreateFinanceTransaction({ ...valid, type:'income' }).allowed).toBe(false)
    expect(canCreateFinanceTransaction({
      ...valid,
      category:'payroll',
      scope:'company',
      branch:'All',
      manualEntryReason:'',
    }).allowed).toBe(false)
    expect(canCreateFinanceTransaction({
      ...valid,
      category:'payroll',
      scope:'company',
      branch:'All',
      manualEntryReason:'Historical correction',
    }).allowed).toBe(true)
  })
  it('allows optional notes', () => {
    expect(canCreateFinanceTransaction({ ...valid, note:'' }).allowed).toBe(true)
  })
})
