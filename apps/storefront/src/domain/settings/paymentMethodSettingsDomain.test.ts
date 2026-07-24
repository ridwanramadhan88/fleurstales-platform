import { describe, expect, it } from 'vitest'
import { getCustomerVisiblePaymentAccounts, normalizeBankAccounts } from './paymentMethodSettingsDomain'
import type { PaymentMethodSettings } from '../../types/settings'

const settings: PaymentMethodSettings = {
  paymentInstructions: 'Pay promptly.',
  bankAccounts: [
    { id:'a', bankName:'BCA', accountNumber:'1', accountHolder:'Store', type:'bank_transfer', isActive:true, isDefault:false, displayOrder:2, isCustomerVisible:true, branchIds:[] },
    { id:'b', bankName:'Mandiri', accountNumber:'2', accountHolder:'Store', type:'bank_transfer', isActive:true, isDefault:true, displayOrder:1, isCustomerVisible:true, branchIds:['Pahoman'] },
    { id:'c', bankName:'Internal', accountNumber:'3', accountHolder:'Store', type:'bank_transfer', isActive:true, isDefault:false, displayOrder:3, isCustomerVisible:false, branchIds:[] },
  ],
}

describe('payment method settings domain', () => {
  it('keeps one active default and sorts accounts by display order', () => {
    const result = normalizeBankAccounts(settings)
    expect(result.bankAccounts.map((item) => item.id)).toEqual(['b','a','c'])
    expect(result.bankAccounts.filter((item) => item.isDefault).map((item) => item.id)).toEqual(['b'])
  })

  it('filters checkout accounts by active, visibility, and branch applicability', () => {
    expect(getCustomerVisiblePaymentAccounts(settings, 'Kedamaian').map((item) => item.id)).toEqual(['a'])
    expect(getCustomerVisiblePaymentAccounts(settings, 'Pahoman').map((item) => item.id)).toEqual(['b','a'])
  })
})
