import { describe, expect, it } from 'vitest'
import { DEFAULT_BRANCH_OPENING_HOURS } from './branchOpeningHoursDomain'
import { getStorefrontAvailableTimeSlots, validateStorefrontCheckoutDetails } from './storefrontCheckoutDomain'

const branch = { id:'b1', name:'Main', code:'MAIN', address:'', phone:'', isActive:true, openingHours: DEFAULT_BRANCH_OPENING_HOURS }
const base = { customerName:'Sari', whatsappNumber:'08123456789', fulfillment:'pickup' as const, deliveryAddress:'', date:'2026-07-13', time:'10:00', branch }

describe('storefront checkout parity', () => {
  it('requires a fulfillment time', () => {
    expect(validateStorefrontCheckoutDetails({ ...base, time:'' })).toMatch(/pickup time/i)
  })
  it('rejects closed dates and out-of-hours times', () => {
    const closed = { ...branch, openingHours:{ ...DEFAULT_BRANCH_OPENING_HOURS, monday:{ isOpen:false, opensAt:'09:00', closesAt:'18:00' } } }
    expect(validateStorefrontCheckoutDetails({ ...base, branch:closed })).toMatch(/closed/i)
    expect(validateStorefrontCheckoutDetails({ ...base, time:'08:45' })).toMatch(/outside/i)
  })
  it('uses the selected branch opening-hour slots', () => {
    const custom = { ...branch, openingHours:{ ...DEFAULT_BRANCH_OPENING_HOURS, monday:{ isOpen:true, opensAt:'10:00', closesAt:'11:00' } } }
    expect(getStorefrontAvailableTimeSlots(custom, '2026-07-13')).toEqual(['10:00','10:15','10:30','10:45','11:00'])
  })
})
