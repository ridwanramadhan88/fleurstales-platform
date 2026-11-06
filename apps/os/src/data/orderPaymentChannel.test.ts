import { describe, expect, it } from 'vitest'
import { paymentChannelFromSnapshot } from './shared/repositories'

describe('paymentChannelFromSnapshot', () => {
  it('marks orders paid through the branch QRIS', () => {
    expect(paymentChannelFromSnapshot({ id: 'bank-bca', channel: 'qris', qrisImagePath: 'qris/k.png' })).toBe('qris')
  })

  it('leaves plain transfers and legacy orders unmarked', () => {
    expect(paymentChannelFromSnapshot({ id: 'bank-bca', bankName: 'BCA' })).toBeUndefined()
    expect(paymentChannelFromSnapshot(null)).toBeUndefined()
    expect(paymentChannelFromSnapshot(undefined)).toBeUndefined()
    expect(paymentChannelFromSnapshot(['qris'])).toBeUndefined()
  })
})
