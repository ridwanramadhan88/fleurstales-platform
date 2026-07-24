import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceStore } from './financeStore'

const finance = { name:'Finance', role:'finance' as const }
const owner = { name:'Owner', role:'owner' as const }

beforeEach(() => useFinanceStore.setState({ transactions:[], customCategories:[], categoryOverrides:[] }))

describe('custom Finance expense categories', () => {
  it('lets Finance and Owner create custom Money Out categories', () => {
    const result = useFinanceStore.getState().addExpenseCategory({
      name:'Delivery', branchRequired:true, paymentMethodRequired:true,
      defaultPaymentMethod:'transfer', placeholder:'e.g. Courier delivery', actor:finance,
    })
    expect(result.allowed).toBe(true)
    expect(useFinanceStore.getState().customCategories[0]).toMatchObject({ name:'Delivery', direction:'expense', active:true })
    expect(useFinanceStore.getState().addExpenseCategory({
      name:'Maintenance', branchRequired:true, paymentMethodRequired:true, actor:owner,
    }).allowed).toBe(true)
  })

  it('blocks other roles and duplicate names', () => {
    expect(useFinanceStore.getState().addExpenseCategory({
      name:'Delivery', branchRequired:true, paymentMethodRequired:true,
      actor:{ name:'HR', role:'hr' },
    }).allowed).toBe(false)
    useFinanceStore.getState().addExpenseCategory({ name:'Delivery', branchRequired:true, paymentMethodRequired:true, actor:finance })
    expect(useFinanceStore.getState().addExpenseCategory({ name:'delivery', branchRequired:true, paymentMethodRequired:true, actor:finance }).allowed).toBe(false)
  })


  it('lets Finance edit, archive, and restore built-in automatic categories without changing their keys', () => {
    const edited = useFinanceStore.getState().updateBuiltInCategory({
      categoryId:'payroll',
      name:'Staff payroll',
      description:'Monthly payroll payment',
      scopePolicy:'company',
      allowScopeOverride:true,
      active:true,
      actor:finance,
    })
    expect(edited.allowed).toBe(true)
    expect(useFinanceStore.getState().categoryOverrides[0]).toMatchObject({
      categoryId:'payroll',
      label:'Staff payroll',
      active:true,
    })

    expect(useFinanceStore.getState().updateBuiltInCategory({
      categoryId:'payroll',
      name:'Staff payroll',
      description:'Monthly payroll payment',
      scopePolicy:'company',
      allowScopeOverride:true,
      active:false,
      actor:finance,
    }).allowed).toBe(true)
    expect(useFinanceStore.getState().categoryOverrides[0]?.active).toBe(false)

    expect(useFinanceStore.getState().updateBuiltInCategory({
      categoryId:'payroll',
      name:'Staff payroll',
      description:'Monthly payroll payment',
      scopePolicy:'company',
      allowScopeOverride:true,
      active:true,
      actor:finance,
    }).allowed).toBe(true)
    expect(useFinanceStore.getState().categoryOverrides[0]?.active).toBe(true)
  })

  it('removes unused categories but archives categories already used by transactions', () => {
    const added = useFinanceStore.getState().addExpenseCategory({ name:'Delivery', branchRequired:true, paymentMethodRequired:true, actor:finance })
    const categoryId = added.categoryId!
    expect(useFinanceStore.getState().removeExpenseCategory({ categoryId, actor:finance }).allowed).toBe(true)

    const used = useFinanceStore.getState().addExpenseCategory({ name:'Maintenance', branchRequired:true, paymentMethodRequired:true, actor:finance })
    const usedId = used.categoryId! as `custom:${string}`
    expect(useFinanceStore.getState().addTransaction({
      type:'expense', category:usedId, branch:'Kedamaian', amount:100000,
      method:'cash', name:'Repair', actor:finance,
    }).allowed).toBe(true)
    expect(useFinanceStore.getState().removeExpenseCategory({ categoryId:usedId, actor:finance }).allowed).toBe(false)
    expect(useFinanceStore.getState().deactivateExpenseCategory({ categoryId:usedId, actor:finance }).allowed).toBe(true)
    expect(useFinanceStore.getState().customCategories.find((item) => item.id === usedId)?.active).toBe(false)
    expect(useFinanceStore.getState().transactions[0].category).toBe(usedId)
  })
})
