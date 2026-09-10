import { describe, expect, it } from 'vitest'
import { DEFAULT_BRANCH_OPENING_HOURS } from './branchOpeningHoursDomain'
import { getStorefrontAvailableTimeSlots, validateStorefrontCheckoutDetails } from './storefrontCheckoutDomain'

const branch = { id:'b1', name:'Main', code:'MAIN', address:'', phone:'', isActive:true, openingHours: DEFAULT_BRANCH_OPENING_HOURS }
const now = new Date(2026, 6, 13, 9, 0, 0, 0)
const base = { customerName:'Sari', whatsappNumber:'08123456789', fulfillment:'pickup' as const, deliveryAddress:'', date:'2026-07-13', time:'10:00', branch, now }

describe('storefront checkout parity', () => {
  it('requires a fulfillment time', () => {
    expect(validateStorefrontCheckoutDetails({ ...base, time:'' })).toMatch(/pickup time/i)
  })
  it('rejects closed dates and out-of-hours times', () => {
    const closed = { ...branch, openingHours:{ ...DEFAULT_BRANCH_OPENING_HOURS, monday:{ isOpen:false, opensAt:'09:00', closesAt:'18:00' } } }
    expect(validateStorefrontCheckoutDetails({ ...base, branch:closed })).toMatch(/closed/i)
    expect(validateStorefrontCheckoutDetails({ ...base, time:'08:45' })).toMatch(/outside/i)
  })
  it('requires a slot strictly more than 45 minutes ahead', () => {
    expect(validateStorefrontCheckoutDetails({ ...base, time:'09:45' })).toMatch(/45-minute/i)
    expect(validateStorefrontCheckoutDetails({ ...base, time:'10:00' })).toBeNull()
  })
  it('uses branch hours while removing too-soon and full slots', () => {
    const custom = { ...branch, openingHours:{ ...DEFAULT_BRANCH_OPENING_HOURS, monday:{ isOpen:true, opensAt:'09:00', closesAt:'11:00' } } }
    expect(getStorefrontAvailableTimeSlots(custom, '2026-07-13', { now, fullSlots:['10:15'] })).toEqual(['10:00','10:30','10:45','11:00'])
  })
})
