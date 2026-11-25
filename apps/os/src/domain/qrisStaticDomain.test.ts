import { describe, expect, it } from 'vitest'
import { merchantCriteriaLabel, parseStaticQris, qrisBankMismatch, qrisCrc16, StaticQrisReadError } from './qrisStaticDomain'

// Synthetic QRIS payloads only (same as supabase/tests/branch_qris_smoke.sql).
const STATIC = '00020101021126650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI5204599253033605802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A016304B528'
const DYNAMIC = '00020101021226650019ID.CO.SMOKEBANK.WWW011893600000000000000102090000000010303UMI51440014ID.CO.QRIS.WWW0215ID10000000000010303UMI520459925303360540410005802ID5915SMOKE FLORIST A6014Bandar Lampung61053511162070703A0163042BF5'

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error instanceof StaticQrisReadError ? error.code : 'other'
  }
  return 'none'
}

describe('static QRIS source', () => {
  it('computes the standard CRC16-CCITT check value', () => {
    expect(qrisCrc16('123456789')).toBe('29B1')
  })

  it('reads the public-safe details of a static QRIS', () => {
    expect(parseStaticQris(` ${STATIC} `)).toEqual({
      merchantName: 'SMOKE FLORIST A',
      nmid: 'ID1000000000001',
      merchantCriteria: 'UMI',
      mcc: '5992',
      acquirer: 'ID.CO.SMOKEBANK.WWW',
    })
  })

  it('rejects a broken CRC, a dynamic QRIS and non-QRIS text', () => {
    expect(code(() => parseStaticQris(`${STATIC.slice(0, -4)}0000`))).toBe('QRIS_INVALID')
    expect(code(() => parseStaticQris(DYNAMIC))).toBe('QRIS_NOT_STATIC')
    expect(code(() => parseStaticQris('https://example.com'))).toBe('QRIS_INVALID')
  })

  it('flags a QRIS bank that differs from the linked account bank', () => {
    expect(qrisBankMismatch('ID.CO.BANKMANDIRI.WWW', 'MANDIRI')).toBe(false)
    expect(qrisBankMismatch('ID.CO.BANKMANDIRI.WWW', 'Bank Mandiri')).toBe(false)
    expect(qrisBankMismatch('ID.CO.BANKMANDIRI.WWW', 'BCA')).toBe(true)
    expect(qrisBankMismatch(null, 'BCA')).toBe(false)
  })

  it('labels merchant criteria in Indonesian', () => {
    expect(merchantCriteriaLabel('UMI')).toBe('Usaha mikro (UMI)')
    expect(merchantCriteriaLabel('UKE')).toBe('Usaha kecil (UKE)')
  })
})
