import { describe, expect, it } from 'vitest'
import { normalizeOrderNumberInput } from './orderNumberInput'

describe('order number input', () => {
  it('accepts daily order numbers without dashes or in lowercase', () => {
    expect(normalizeOrderNumberInput('kdm261126001')).toBe('KDM-26-11-26-001')
    expect(normalizeOrderNumberInput(' PHM 26 11 26 010 ')).toBe('PHM-26-11-26-010')
    expect(normalizeOrderNumberInput('KDM-26-11-26-1000')).toBe('KDM-26-11-26-1000')
  })

  it('keeps legacy yearly numbers working', () => {
    expect(normalizeOrderNumberInput('kdm20260026')).toBe('KDM-2026-0026')
    expect(normalizeOrderNumberInput('KDM-2026-0026')).toBe('KDM-2026-0026')
  })

  it('leaves anything else untouched', () => {
    expect(normalizeOrderNumberInput('abc')).toBe('abc')
  })
})
