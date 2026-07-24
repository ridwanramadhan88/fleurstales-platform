import type { ComponentType, FC, SVGProps } from 'react'
import {
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Smartphone,
  Truck,
} from 'lucide-react'
import type { OrderFulfillment, OrderSource } from '../../types/orders'
import { isSectionEditAuthorized } from '../../config/authorization'
import { useCustomerStore } from '../../store/customerStore'
import { DatePickerField, TimeSelectField } from '../ui/date-time-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  FULFILLMENT_OPTIONS,
  ORDER_SOURCE_OPTIONS,
  SOURCE_LABELS,
} from './orderTableLabels'
import { getActualPickupLabel, getDisplayScheduleLabel, getRequestedPickupLabel } from './orderTableFormatters'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderDetailsDeliverySectionProps {
  viewModel: OrderDetailsViewModel
}

export const OrderDetailsDeliverySection: FC<OrderDetailsDeliverySectionProps> = ({
  viewModel,
}) => {
  const { order, isEditing, draft, onDraftChange, onFulfillmentChange } = viewModel
  const hasGreetingCard = Boolean((order.greetingMessage ?? order.giftMessage)?.trim() || order.greetingCardName?.trim())
  const hasOrderNote = Boolean((order.orderNote ?? order.internalNote)?.trim())
  const crmCustomer = useCustomerStore((state) =>
    order.customerId
      ? state.customers.find((customer) => customer.id === order.customerId) ?? null
      : null,
  )
  const applyCustomerProfileSuggestions = useCustomerStore(
    (state) => state.applyCustomerProfileSuggestions,
  )
  const capturedSuggestions = order.customerProfileSuggestions
  const pendingSuggestions = capturedSuggestions
    ? {
        ...(!crmCustomer?.birthday && capturedSuggestions.birthday
          ? { birthday: capturedSuggestions.birthday }
          : {}),
        ...(!crmCustomer?.email && capturedSuggestions.email
          ? { email: capturedSuggestions.email }
          : {}),
        ...(!crmCustomer?.preferredBranch && capturedSuggestions.preferredBranchId
          ? { preferredBranchId: capturedSuggestions.preferredBranchId }
          : {}),
      }
    : {}
  const hasCapturedSuggestions = Boolean(
    capturedSuggestions?.birthday ||
      capturedSuggestions?.email ||
      capturedSuggestions?.preferredBranchId,
  )
  const hasPendingSuggestions = Boolean(
    pendingSuggestions.birthday ||
      pendingSuggestions.email ||
      pendingSuggestions.preferredBranchId,
  )

  return (
    <>
      <section className="space-y-3 rounded-xl bg-card px-3 py-3 ring-1 ring-border/70">
        {!isEditing ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <InfoCell
              icon={order.source === 'whatsapp' ? MessageCircle : Smartphone}
              label="Source"
              value={SOURCE_LABELS[order.source]}
            />
            <InfoCell
              icon={order.fulfillment === 'delivery' ? Truck : MapPin}
              label="Fulfillment"
              value={order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
            />
            {order.fulfillment === 'pickup' ? (
              <>
                <div className="col-span-2">
                  <InfoCell icon={Clock} label="Requested pickup" value={getRequestedPickupLabel(order) ?? 'Not set'} />
                </div>
                {order.status === 'picked_up' ? (
                  <div className="col-span-2">
                    <InfoCell icon={Clock} label="Actual pickup" value={getActualPickupLabel(order) ?? 'Not recorded'} />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="col-span-2">
                <InfoCell icon={Clock} label="Delivery schedule" value={getDisplayScheduleLabel(order) ?? 'Not set'} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-2xs font-medium text-muted-foreground/80">
                Source
                <Select
                  value={draft.source}
                  onValueChange={(value) => onDraftChange('source', value as OrderSource)}
                >
                  <SelectTrigger className="h-9 rounded-lg bg-background px-3 text-xs ring-1 ring-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-2xs font-medium text-muted-foreground/80">
                Fulfillment
                <Select
                  value={draft.fulfillment}
                  onValueChange={(value) => onFulfillmentChange(value as OrderFulfillment)}
                >
                  <SelectTrigger className="h-9 rounded-lg bg-background px-3 text-xs ring-1 ring-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FULFILLMENT_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs font-normal text-muted-foreground/80">
                Date
                <DatePickerField
                  value={draft.scheduleDate}
                  onChange={(value) => onDraftChange('scheduleDate', value)}
                  className="h-10 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs font-normal text-muted-foreground/80">
                Time
                <TimeSelectField
                  value={draft.scheduleTime}
                  onChange={(value) => onDraftChange('scheduleTime', value)}
                  className="h-10 text-sm"
                />
              </label>
            </div>
          </div>
        )}

        {hasCapturedSuggestions && (
          <div className="rounded-lg border border-info/40 bg-surface-info px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  Customer profile suggestions
                </p>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {hasPendingSuggestions
                    ? 'Missing CRM details captured from Storefront checkout.'
                    : 'These Storefront details have already been added to the CRM profile.'}
                </p>
              </div>
              {hasPendingSuggestions &&
                crmCustomer &&
                isSectionEditAuthorized('customers') && (
                  <button
                    type="button"
                    onClick={() =>
                      applyCustomerProfileSuggestions(
                        crmCustomer.id,
                        pendingSuggestions,
                      )
                    }
                    className="shrink-0 h-11 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground"
                  >
                    Apply to CRM
                  </button>
                )}
            </div>
            {hasPendingSuggestions && (
              <div className="mt-2 space-y-1 text-xs text-foreground">
                {pendingSuggestions.birthday && (
                  <p>Birthday: {pendingSuggestions.birthday}</p>
                )}
                {pendingSuggestions.email && <p>Email: {pendingSuggestions.email}</p>}
                {pendingSuggestions.preferredBranchId && (
                  <p>Preferred branch: {pendingSuggestions.preferredBranchId}</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl bg-card px-3 py-3 ring-1 ring-border/70">
        <div>
          <p className="text-sm font-semibold leading-5 text-foreground">Customer contact</p>
          <p className="text-2xs text-muted-foreground">Saved snapshot for this Order.</p>
        </div>
        {!isEditing ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <ContactCell icon={MessageCircle} value={order.customerSnapshot?.whatsappNumber ?? order.customerSnapshot?.phone ?? 'Not set'} />
            <ContactCell icon={Mail} value={order.customerSnapshot?.email || 'Not set'} />
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-normal text-muted-foreground/80">
              WhatsApp
              <input
                value={draft.customerWhatsappNumber}
                onChange={(event) => onDraftChange('customerWhatsappNumber', event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs font-normal text-muted-foreground/80">
              Email
              <input
                type="email"
                value={draft.customerEmail}
                onChange={(event) => onDraftChange('customerEmail', event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </label>
          </div>
        )}
      </section>

      {order.fulfillment === 'delivery' || draft.fulfillment === 'delivery' ? (
        <section className="space-y-3 rounded-xl bg-card px-3 py-3 ring-1 ring-border/70">
          <div>
            <p className="text-sm font-semibold leading-5 text-foreground">Delivery details</p>
            <p className="text-2xs text-muted-foreground">Address and courier instructions.</p>
          </div>
          {!isEditing ? (
            <div className="space-y-3">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">Address</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {order.deliveryAddress?.trim() || 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">Instructions</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {order.deliveryInstructions?.trim() || 'Not added'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={draft.deliveryAddress}
                onChange={(event) => onDraftChange('deliveryAddress', event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Delivery address"
              />
              <textarea
                value={draft.deliveryInstructions}
                onChange={(event) => onDraftChange('deliveryInstructions', event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Courier instructions"
              />
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-xl bg-muted/45 px-3 py-3 ring-1 ring-border/50">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">Additional information</p>
        <p className="mt-1 text-sm font-semibold text-foreground">Greeting card message</p>
        {!isEditing ? (
          hasGreetingCard ? (
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">Message</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {(order.greetingMessage ?? order.giftMessage)?.trim() || '—'}
                </p>
              </div>
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">Name on card</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {order.greetingCardName?.trim() || '—'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Not added</p>
          )
        ) : (
          <div className="mt-2 space-y-2">
            <textarea
              value={draft.greetingMessage}
              onChange={(event) => onDraftChange('greetingMessage', event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              placeholder="Message"
            />
            <input
              value={draft.greetingCardName}
              onChange={(event) => onDraftChange('greetingCardName', event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
              placeholder="Name on card"
            />
          </div>
        )}
      </section>

      <section className="rounded-xl bg-muted/60 px-3 py-3 ring-1 ring-border/50">
        <p className="text-sm font-semibold leading-5 text-foreground">Operational note</p>
        {!isEditing ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {hasOrderNote ? order.orderNote ?? order.internalNote : 'Not added'}
          </p>
        ) : (
          <textarea
            value={draft.orderNote}
            onChange={(event) => onDraftChange('orderNote', event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            placeholder="Special requests, recipient instructions, or other notes"
          />
        )}
      </section>
    </>
  )
}

const InfoCell = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock
  label: string
  value: string
}) => (
  <div className="flex items-center gap-2">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon className="size-3.5" />
    </span>
    <div className="min-w-0 leading-tight">
      <p className="text-2xs font-medium text-muted-foreground/80">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  </div>
)

const ContactCell = ({ icon: Icon, value }: { icon: ComponentType<SVGProps<SVGSVGElement>>; value: string }) => (
  <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
    <span className="truncate text-sm text-foreground">{value}</span>
  </div>
)
