import type { ComponentType, FC, SVGProps } from 'react'
import {
  Mail,
  MessageCircle,
} from 'lucide-react'
import { isSectionEditAuthorized } from '../../config/authorization'
import { useCustomerStore } from '../../store/customerStore'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderDetailsDeliverySectionProps {
  viewModel: OrderDetailsViewModel
}

export const OrderDetailsDeliverySection: FC<OrderDetailsDeliverySectionProps> = ({
  viewModel,
}) => {
  const { order, isEditing, draft, onDraftChange } = viewModel
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
      {hasCapturedSuggestions && (
        <div className="space-y-2 rounded-2xl border border-info/40 bg-surface-info p-4">
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
                  className="h-11 shrink-0 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90"
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

      <section className="space-y-3 rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
        <div>
          <p className="text-sm font-semibold leading-5 text-foreground">Customer contact</p>
          <p className="text-2xs text-muted-foreground">Saved snapshot for this Order.</p>
        </div>
        {!isEditing ? (
          <div className="grid gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            <ContactCell icon={MessageCircle} value={order.customerSnapshot?.whatsappNumber ?? order.customerSnapshot?.phone ?? 'Not set'} />
            <ContactCell icon={Mail} value={order.customerSnapshot?.email || 'Not set'} />
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            <label className="space-y-1 text-xs font-normal text-muted-foreground/80">
              WhatsApp
              <input
                value={draft.customerWhatsappNumber}
                onChange={(event) => onDraftChange('customerWhatsappNumber', event.target.value)}
                className="h-11 w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs font-normal text-muted-foreground/80">
              Email
              <input
                type="email"
                value={draft.customerEmail}
                onChange={(event) => onDraftChange('customerEmail', event.target.value)}
                className="h-11 w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 text-sm"
              />
            </label>
          </div>
        )}
      </section>

      {order.fulfillment === 'delivery' || draft.fulfillment === 'delivery' ? (
        <section className="space-y-3 rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
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
                className="w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 py-2.5 text-sm"
                placeholder="Delivery address"
              />
              <textarea
                value={draft.deliveryInstructions}
                onChange={(event) => onDraftChange('deliveryInstructions', event.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 py-2.5 text-sm"
                placeholder="Courier instructions"
              />
            </div>
          )}
        </section>
      ) : null}

    </>
  )
}

const ContactCell = ({ icon: Icon, value }: { icon: ComponentType<SVGProps<SVGSVGElement>>; value: string }) => (
  <div className="flex min-w-0 items-center gap-2 rounded-xl bg-surface-panel px-3 py-2 ring-1 ring-border/40">
    <Icon className="size-4 shrink-0 text-muted-foreground" />
    <span className="truncate text-sm text-foreground">{value}</span>
  </div>
)
