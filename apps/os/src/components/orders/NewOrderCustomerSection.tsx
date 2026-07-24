import type { FC } from 'react'
import { DatePickerField } from '../ui/date-time-field'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'

interface NewOrderCustomerSectionProps {
  viewModel: NewOrderSheetViewModel
  fieldClass: (isActive: boolean) => string
  sectionClass: (isActive: boolean, base: string) => string
}

export const NewOrderCustomerSection: FC<NewOrderCustomerSectionProps> = ({
  viewModel,
  fieldClass,
  sectionClass,
}) => {
  const {
    values,
    errors,
    matchedCustomer,
    matchedCustomerSegment,
    customerProfileSuggestions,
    acceptedProfileSuggestions,
    showBirthdayFields,
    showPromoField,
    activeGuideField,
    activeGuideSection,
    onFieldChange,
    onFieldValueChange,
    onShowBirthdayFields,
    onShowPromoField,
    onToggleProfileSuggestion,
    onSectionFocus,
  } = viewModel

  return (
    <>
              {/* Customer — secondary identity card, quiet/recessed so
                  Order Items reads as the hero below it. */}
              <section
                onFocus={() => onSectionFocus('customer')}
                className={sectionClass(
                  activeGuideSection === 'customer',
                  'border-b border-border/70 bg-transparent px-0 pb-4 pt-1 sm:rounded-lg sm:border-0 sm:bg-surface-panel sm:px-3 sm:py-3',
                )}
              >
                <h3 className="text-sm font-semibold leading-5 text-foreground">
                  Customer
                </h3>

                <div className="mt-3 space-y-2.5">
                  {/* Customer name */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="customerName"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Name<span className="text-destructive">*</span>
                    </label>
                    <input
                      id="customerName"
                      type="text"
                      value={values.customerName}
                      onChange={onFieldChange('customerName')}
                      className={fieldClass(activeGuideField === 'customerName')}
                      placeholder="e.g. Dita Anjani"
                    />
                    {errors.customerName && (
                      <p className="text-xs text-destructive">
                        {errors.customerName}
                      </p>
                    )}
                  </div>

                  {/* Customer WhatsApp */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="customerWhatsappNumber"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      WhatsApp
                      <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="customerWhatsappNumber"
                      type="tel"
                      value={values.customerWhatsappNumber}
                      onChange={onFieldChange('customerWhatsappNumber')}
                      className={fieldClass(activeGuideField === 'customerWhatsappNumber')}
                      placeholder="e.g. 0812 3456 7890"
                    />
                    {errors.customerWhatsappNumber && (
                      <p className="text-xs text-destructive">
                        {errors.customerWhatsappNumber}
                      </p>
                    )}
                  </div>

                  {/* Auto-matched customer card: shows once WhatsApp resolves
                      to a known CRM record (or flags a brand-new one, quietly). */}
                  {values.customerWhatsappNumber.trim().length > 0 && (
                    <div className="px-0.5">
                      {matchedCustomer ? (
                        <div className="space-y-1 rounded-md border border-border/70 bg-card px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground">
                              {matchedCustomer.name}
                            </span>
                            {matchedCustomerSegment === 'vip' && (
                              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-2xs font-semibold text-warning">
                                VIP
                              </span>
                            )}
                            {matchedCustomer.tags
                              ?.filter((tag) => tag !== 'VIP')
                              .map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-surface-neutral px-2 py-0.5 text-2xs font-medium text-foreground ring-1 ring-border/80"
                                >
                                  {tag}
                                </span>
                              ))}
                            {matchedCustomer.promoCode && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">
                                Promo: {matchedCustomer.promoCode}
                              </span>
                            )}
                          </div>
                          <p className="text-2xs text-muted-foreground">
                            Returning customer
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          <span className="text-success">✓</span> New customer
                        </p>
                      )}
                    </div>
                  )}

                  {matchedCustomer &&
                    (customerProfileSuggestions.birthday ||
                      customerProfileSuggestions.email ||
                      customerProfileSuggestions.preferredBranchId) && (
                      <div className="space-y-2 rounded-md border border-info/40 bg-surface-info px-3 py-2.5">
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            Customer profile suggestions
                          </p>
                          <p className="mt-0.5 text-2xs text-muted-foreground">
                            Add only missing details to the existing CRM profile.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          {customerProfileSuggestions.birthday && (
                            <SuggestionOption
                              checked={Boolean(acceptedProfileSuggestions.birthday)}
                              label={`Add birthday: ${customerProfileSuggestions.birthday}`}
                              onChange={() => onToggleProfileSuggestion('birthday')}
                            />
                          )}
                          {customerProfileSuggestions.email && (
                            <SuggestionOption
                              checked={Boolean(acceptedProfileSuggestions.email)}
                              label={`Add email: ${customerProfileSuggestions.email}`}
                              onChange={() => onToggleProfileSuggestion('email')}
                            />
                          )}
                          {customerProfileSuggestions.preferredBranchId && (
                            <SuggestionOption
                              checked={Boolean(acceptedProfileSuggestions.preferredBranchId)}
                              label={`Set ${customerProfileSuggestions.preferredBranchId} as preferred branch`}
                              onChange={() => onToggleProfileSuggestion('preferredBranchId')}
                            />
                          )}
                        </div>
                      </div>
                    )}

                  {/* Birthday / email reveal — quiet text link, not a
                      loud primary-colored CTA. */}
                  <div className="space-y-1.5">
                    {!showBirthdayFields ? (
                      <button
                        type="button"
                        onClick={onShowBirthdayFields}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline min-h-11 rounded-full px-[18px] whitespace-nowrap"
                      >
                        + Add birthday
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="block text-xs font-medium text-muted-foreground">
                            Email
                          </span>
                          <input
                            id="customerEmail"
                            type="email"
                            value={values.customerEmail}
                            onChange={onFieldChange('customerEmail')}
                            placeholder="name@example.com"
                            className={fieldClass(activeGuideField === 'customerEmail')}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="block text-xs font-medium text-muted-foreground">
                            Birthday
                          </span>
                          <DatePickerField
                            id="customerBirthday"
                            value={values.customerBirthday}
                            onChange={(value) =>
                              onFieldValueChange('customerBirthday', value)
                            }
                            className={`h-9 text-xs ${fieldClass(activeGuideField === 'customerBirthday')}`}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Promo code — collapsed behind a small link by default,
                      only expands into an input when clicked. */}
                  <div className="space-y-1.5">
                    {!showPromoField ? (
                      <button
                        type="button"
                        onClick={onShowPromoField}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline min-h-11 rounded-full px-[18px] whitespace-nowrap"
                      >
                        {values.promoCode.trim()
                          ? `Promo: ${values.promoCode}`
                          : '+ Add promo code'}
                      </button>
                    ) : (
                      <>
                        <label
                          htmlFor="promoCode"
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Promo code
                        </label>
                        <input
                          id="promoCode"
                          type="text"
                          autoFocus
                          value={values.promoCode}
                          onChange={onFieldChange('promoCode')}
                          placeholder="Auto-filled if the customer has one"
                          className={fieldClass(activeGuideField === 'promoCode')}
                        />
                      </>
                    )}
                  </div>
                </div>
              </section>
    </>
  )
}

const SuggestionOption: FC<{
  checked: boolean
  label: string
  onChange: () => void
}> = ({ checked, label, onChange }) => (
  <label className="flex cursor-pointer items-start gap-2 rounded-md bg-card px-2.5 py-2 ring-1 ring-border/80">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="mt-0.5 size-4 accent-primary"
    />
    <span className="text-xs leading-4 text-foreground">{label}</span>
  </label>
)
