import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('New Order workflow UX', () => {
  it('focuses the first invalid field after every failed review attempt', () => {
    const controller = read('src/components/orders/NewOrderSheetController.ts')
    const sheet = read('src/components/orders/NewOrderSheet.tsx')
    const validation = read('src/components/orders/useNewOrderValidation.ts')

    expect(validation).toContain('NEW_ORDER_ERROR_FOCUS_ORDER')
    expect(validation).toContain('getFirstNewOrderErrorField')
    expect(controller).toContain('requestValidationFocus(nextErrors)')
    expect(controller).toContain('validationFocusRequest')
    expect(sheet).toContain('document.getElementById(validationFocusField)')
    expect(sheet).toContain("scrollIntoView({ block: 'center', behavior: 'smooth' })")
  })

  it('keeps the New Order footer reachable and clearly actionable on phone', () => {
    const sheet = read('src/components/orders/NewOrderSheet.tsx')

    expect(sheet).toContain('flex shrink-0 flex-col-reverse gap-2')
    expect(sheet).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]')
    expect(sheet).toContain('h-11 w-full')
    expect(sheet).toContain('sm:w-auto')
    expect(sheet).toContain("'bg-card text-foreground ring-1 ring-border hover:bg-muted'")
  })

  it('uses a safer tablet layout instead of squeezing nested controls', () => {
    const sheet = read('src/components/orders/NewOrderSheet.tsx')
    const customer = read('src/components/orders/NewOrderCustomerSection.tsx')
    const items = read('src/components/orders/NewOrderItemsSection.tsx')
    const structure = read('src/components/orders/NewOrderStructureSection.tsx')
    const payment = read('src/components/orders/NewOrderPaymentDetailsSection.tsx')

    expect(sheet).toContain('md:grid-cols-2')
    expect(customer).toContain('lg:grid-cols-2')
    expect(items).toContain('lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]')
    expect(structure).toContain('lg:grid-cols-2')
    expect(payment).toContain('lg:grid-cols-2')
  })

  it('marks required controls invalid without changing the validation rules', () => {
    const customer = read('src/components/orders/NewOrderCustomerSection.tsx')
    const items = read('src/components/orders/NewOrderItemsSection.tsx')
    const structure = read('src/components/orders/NewOrderStructureSection.tsx')
    const payment = read('src/components/orders/NewOrderPaymentDetailsSection.tsx')

    expect(customer).toContain('aria-invalid={Boolean(errors.customerName)}')
    expect(customer).toContain('aria-invalid={Boolean(errors.customerWhatsappNumber)}')
    expect(items).toContain('aria-invalid={Boolean(errors.orderItemCatalogId)}')
    expect(structure).toContain('aria-invalid={Boolean(errors.orderType)}')
    expect(structure).toContain('aria-invalid={Boolean(errors.fulfillmentType)}')
    expect(payment).toContain('aria-invalid={Boolean(errors.paymentMethod)}')
  })

  it('keeps primary New Order interactions touch-safe', () => {
    const items = read('src/components/orders/NewOrderItemsSection.tsx')
    const structure = read('src/components/orders/NewOrderStructureSection.tsx')
    const review = read('src/components/orders/NewOrderReviewStep.tsx')

    expect(items).toContain('min-h-11 flex-1')
    expect(structure).toContain('inline-flex min-h-11 items-center')
    expect(review).toContain('inline-flex min-h-11 items-center')
  })

  it('adds useful browser autofill and keyboard hints for customer intake', () => {
    const customer = read('src/components/orders/NewOrderCustomerSection.tsx')

    expect(customer).toContain('autoFocus')
    expect(customer).toContain('autoComplete="name"')
    expect(customer).toContain('autoComplete="tel"')
    expect(customer).toContain('autoComplete="email"')
    expect(customer).toContain('enterKeyHint="next"')
  })
})
