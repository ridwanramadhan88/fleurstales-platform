/**
 * @file CustomerVoucherDialog.tsx
 * @description "Manage vouchers" dialog for the Customers tab. Lets staff
 * manually create promo/voucher codes with a percent-off amount, optional
 * date-range + minimum-order rules, and an eligibility rule (everyone,
 * VIP customers only, or a hand-picked list of customers). Backed by
 * voucherStore, which the storefront checkout and admin order intake both
 * read from directly — a code created here is usable everywhere the
 * instant it's saved.
 */

import type { FC } from 'react'
import { Plus, Trash2, Pencil, Search, Ticket } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { DatePickerField } from '../ui/date-time-field'
import type { CustomerVoucherDialogViewModel } from './CustomerVoucherDialogController'

export interface CustomerVoucherDialogProps {
  open: boolean
  onClose: () => void
  /**
   * When set, the dialog opens straight into the "new voucher" form with
   * eligibility pre-set to "Selected" and this customer already checked —
   * used by the "Assign promo" action on a customer card.
   */
  initialCustomerId?: string | null
}

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'
const labelClass = 'text-xs font-medium text-foreground/90'

export const CustomerVoucherDialog: FC<CustomerVoucherDialogViewModel> = ({
  open,
  sortedVouchers,
  customers,
  filteredCustomersForSelection,
  editingId,
  formOpen,
  form,
  customerQuery,
  onDialogOpenChange,
  onStartCreate,
  onStartEdit,
  onCancelForm,
  onSave,
  onDelete,
  onSetVoucherActive,
  onCustomerQueryChange,
  onFormFieldChange,
  onToggleSelectedCustomer,
  getEligibilityLabel,
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={onDialogOpenChange}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage vouchers</DialogTitle>
          <DialogDescription>
            Create promo codes with a percent-off amount, optional date and
            minimum-order rules, and who can use them.
          </DialogDescription>
        </DialogHeader>

        {!formOpen ? (
          <>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {sortedVouchers.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No vouchers yet. Create one below.
                </p>
              )}
              {sortedVouchers.map((voucher) => (
                <div
                  key={voucher.id}
                  className="space-y-1.5 rounded-lg border border-border/70 bg-card px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        <Ticket className="size-3" />
                        {voucher.code}
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        -{voucher.percentOff}% off
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onSetVoucherActive(voucher.id, !voucher.isActive)
                        }
                        className={`tap-scale rounded-full px-2 py-0.5 text-2xs font-medium ${
                          voucher.isActive
                            ? 'bg-success/15 text-success'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {voucher.isActive ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartEdit(voucher)}
                        aria-label={`Edit ${voucher.code}`}
                        className="tap-scale flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(voucher)}
                        aria-label={`Delete ${voucher.code}`}
                        className="tap-scale flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-2xs text-muted-foreground">
                    {getEligibilityLabel(voucher)}
                    {voucher.minOrderIdr
                      ? ` · Min. order Rp ${voucher.minOrderIdr.toLocaleString('id-ID')}`
                      : ''}
                    {voucher.startDate || voucher.endDate
                      ? ` · ${voucher.startDate ?? 'Any'} → ${voucher.endDate ?? 'No end'}`
                      : ''}
                  </p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={onStartCreate}
              className="tap-scale inline-flex items-center justify-center rounded-full bg-primary text-sm font-medium text-white hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              <Plus className="size-3.5" />
              New voucher
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className={labelClass}>Voucher code</label>
              <input
                value={form.code}
                onChange={(event) =>
                  onFormFieldChange('code', event.target.value)
                }
                placeholder="e.g. BDAY20"
                className={`${inputClass} uppercase`}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>% off</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.percentOff}
                  onChange={(event) =>
                    onFormFieldChange('percentOff', event.target.value)
                  }
                  placeholder="e.g. 20"
                  className={`${inputClass} max-w-[110px]`}
                />
                <span className="text-sm text-muted-foreground">% off order subtotal</span>
              </div>
            </div>

            {/* Date-offering rule */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className={labelClass}>Start date (optional)</label>
                <DatePickerField
                  value={form.startDate}
                  onChange={(value) => onFormFieldChange('startDate', value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>End date (optional)</label>
                <DatePickerField
                  value={form.endDate}
                  onChange={(value) => onFormFieldChange('endDate', value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Minimum order rule */}
            <div className="space-y-1">
              <label className={labelClass}>Minimum order (optional)</label>
              <input
                type="number"
                min={0}
                value={form.minOrderIdr}
                onChange={(event) =>
                  onFormFieldChange('minOrderIdr', event.target.value)
                }
                placeholder="e.g. 200000"
                className={inputClass}
              />
            </div>

            {/* Eligibility rule */}
            <div className="space-y-1.5">
              <label className={labelClass}>Who can use this voucher</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'all' as const, label: 'Everyone' },
                    { id: 'vip' as const, label: 'VIP only' },
                    { id: 'selected' as const, label: 'Selected' },
                  ]
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onFormFieldChange('eligibility', id)}
                    className={`tap-scale rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                      form.eligibility === id
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border bg-card text-foreground hover:bg-accent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {form.eligibility === 'selected' && (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={customerQuery}
                      onChange={(event) => onCustomerQueryChange(event.target.value)}
                      placeholder="Search name, WhatsApp, or email…"
                      className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
                    />
                  </div>
                  {form.selectedCustomerIds.length > 0 && (
                    <p className="px-0.5 text-2xs text-muted-foreground">
                      {form.selectedCustomerIds.length} customer
                      {form.selectedCustomerIds.length === 1 ? '' : 's'} selected
                    </p>
                  )}
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-muted p-2">
                    {customers.length === 0 && (
                      <p className="px-1 py-2 text-2xs text-muted-foreground">No customers yet.</p>
                    )}
                    {customers.length > 0 && filteredCustomersForSelection.length === 0 && (
                      <p className="px-1 py-2 text-2xs text-muted-foreground">
                        No customers match "{customerQuery}".
                      </p>
                    )}
                    {filteredCustomersForSelection.map((customer) => (
                      <label
                        key={customer.id}
                        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={form.selectedCustomerIds.includes(customer.id)}
                          onChange={() => onToggleSelectedCustomer(customer.id)}
                          className="size-3.5 rounded border-border accent-primary"
                        />
                        <span className="truncate">{customer.name}</span>
                        <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
                          {customer.whatsappNumber}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="-mx-6 -mb-6 flex justify-end gap-2 border-t border-border bg-surface-footer px-6 py-4">
              <button
                type="button"
                onClick={onCancelForm}
                className="rounded-full text-sm font-medium text-muted-foreground hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                className="rounded-full bg-primary text-sm font-medium text-white hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
              >
                {editingId ? 'Save changes' : 'Create voucher'}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default CustomerVoucherDialog
