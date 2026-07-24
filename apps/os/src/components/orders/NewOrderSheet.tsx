/**
 * @file NewOrderSheet.tsx
 * @description New order intake sheet for creating walk-in or admin-created orders
 * in a calm, Apple-style UI, now with a final review & confirmation step and
 * future-ready customer linking structure for CRM integration.
 */

import type { FC, KeyboardEvent } from 'react'
import { FileText, Save, Trash2 } from 'lucide-react'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'
import { NewOrderCustomerSection } from './NewOrderCustomerSection'
import { NewOrderItemsSection } from './NewOrderItemsSection'
import { NewOrderPaymentSection } from './NewOrderPaymentSection'
import { NewOrderSummarySection } from './NewOrderSummarySection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'

/**
 * @description Props for the NewOrderSheet component.
 */
export interface NewOrderSheetProps {
  /** Controls visibility of the sheet. */
  open: boolean
  /** Callback when the sheet should be closed. */
  onClose: () => void
  /** Optional active branch context for the new order. */
  activeBranch?: string
  /** Existing explicit draft to resume. Omitted for a clean new order. */
  draftId?: string | null
}

// Guide ring: only the ONE field the guide is currently pointing at gets the
// soft blue ring + tint — not every empty field at once. Every other field
// (filled or not-yet-reached) sits at the normal neutral border, so the eye
// is drawn to exactly one next step at a time. Order of fields in the DOM is
// the left-to-right, top-to-bottom fill order that Enter-to-advance follows.
const fieldClass = (isActive: boolean): string =>
  [
    'h-10 w-full rounded-lg border border-transparent bg-background px-3 text-xs text-foreground outline-none transition',
    'placeholder:text-muted-foreground placeholder:font-normal',
    isActive
      ? 'border-primary/30 bg-primary/[0.05] font-medium ring-2 ring-primary/40 focus:border-primary/40 focus:bg-primary/[0.04] focus:ring-2 focus:ring-primary/45'
      : 'font-medium ring-1 ring-border/70 focus:border-border focus:bg-background focus:ring-1 focus:ring-border/70',
  ].join(' ')

const textAreaClass = (isActive: boolean): string =>
  [
    'min-h-[64px] w-full rounded-lg border border-transparent bg-background px-3 py-2 text-xs text-foreground outline-none transition',
    'placeholder:text-muted-foreground',
    isActive
      ? 'border-primary/30 bg-primary/[0.05] ring-2 ring-primary/40 focus:border-primary/40 focus:bg-primary/[0.04] focus:ring-2 focus:ring-primary/45'
      : 'ring-1 ring-border/70 focus:border-border focus:bg-background focus:ring-1 focus:ring-border/70',
  ].join(' ')

// Section card highlight: the section the guide is currently on (or that
// the user has clicked/focused into) gets a visible dark-grey ring so the
// workflow's current "zone" is obvious at a glance; it moves as the user
// progresses instead of lighting up everything together, and disappears
// once every field in that section is filled.
const sectionClass = (_isActive: boolean, base: string): string =>
  [base, 'transition-shadow'].join(' ')

// Enter advances focus to the next fillable field instead of submitting the
// form, mirroring a step-by-step guided intake. Textareas keep their
// default Enter behavior (new line) since users need to type multi-line
// messages/addresses there.
const FOCUSABLE_SELECTOR =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button[role="combobox"]:not([disabled])'

const handleGuidedEnter = (event: KeyboardEvent<HTMLFormElement>) => {
  if (event.key !== 'Enter') return
  const target = event.target as HTMLElement
  if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return

  event.preventDefault()
  const form = event.currentTarget
  const focusable = Array.from(
    form.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.offsetParent !== null)
  const currentIndex = focusable.indexOf(target)
  if (currentIndex > -1 && currentIndex < focusable.length - 1) {
    focusable[currentIndex + 1].focus()
  }
}

/**
 * @description New order intake sheet with basic validation, customer/order item
 * sections, local draft persistence, and a final review step.
 */
export const NewOrderSheet: FC<NewOrderSheetViewModel> = (viewModel) => {
  const {
    open,
    errors,
    infoMessage,
    step,
    branchLabel,
    estimatedOrderTotalIdr,
    catalogPriceFormatter,
    isFormReady,
    closeConfirmationOpen,
    onClose,
    onContinueEditing,
    onDiscardAndClose,
    onSubmit,
    onSaveDraft,
    onBackToEdit,
    onGuideFieldFocus,
    onGuideFieldBlur,
  } = viewModel

  if (!open) return null

  const validationErrorCount = Object.values(errors).filter(Boolean).length

  return (
    <>
      <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/32 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New order"
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet-up mobile-focus-workflow flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-2xl bg-card shadow-lg ring-1 ring-border/60 sm:max-h-[90vh] sm:rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold leading-6 text-foreground">
              New order
            </h2>
            <p className="text-xs text-muted-foreground">{branchLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale inline-flex items-center justify-center rounded-full bg-muted text-xs text-muted-foreground transition cursor-pointer hover:bg-accent hover:text-foreground rounded-full p-0 size-11 rounded-full p-0 whitespace-nowrap"
            aria-label="Close new order"
          >
            ×
          </button>
        </div>

        {infoMessage && (
          <div className="border-b border-success/15 bg-success/10 px-5 py-2 text-xs font-medium text-success">
            {infoMessage}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          onKeyDown={handleGuidedEnter}
          onFocusCapture={(event) => {
            const target = event.target as HTMLElement
            const field = target.dataset.guideField ?? target.id
            if (field) onGuideFieldFocus(field)
          }}
          onBlurCapture={onGuideFieldBlur}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-5">
            {step === 'edit' && (
              <>
                {validationErrorCount > 0 && (
                  <section
                    role="alert"
                    className="rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5"
                  >
                    <p className="text-xs font-semibold text-destructive">
                      Complete {validationErrorCount} highlighted {validationErrorCount === 1 ? 'field' : 'fields'} before review.
                    </p>
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      Start with the highlighted section below. Your entered details are still saved in this form.
                    </p>
                  </section>
                )}

                <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                  <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-ios-sm">
                    <div className="border-b border-border/70 px-3.5 py-3">
                      <p className="text-sm font-semibold leading-5 text-foreground">Order details</p>
                      <p className="mt-0.5 text-2xs text-muted-foreground">Customer and item information.</p>
                    </div>
                    <div className="space-y-0 divide-y divide-border/70 px-3 py-1">
                      <NewOrderCustomerSection
                        viewModel={viewModel}
                        fieldClass={fieldClass}
                        sectionClass={sectionClass}
                      />
                      <NewOrderItemsSection
                        viewModel={viewModel}
                        fieldClass={fieldClass}
                        sectionClass={sectionClass}
                      />
                    </div>
                  </section>

                  <div className="space-y-3">
                    <NewOrderPaymentSection
                      viewModel={viewModel}
                      fieldClass={fieldClass}
                      textAreaClass={textAreaClass}
                      sectionClass={sectionClass}
                    />
                  </div>
                </div>
              </>
            )}

            {step === 'review' && (
              <NewOrderSummarySection viewModel={viewModel} />
            )}
          </div>

          <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-t border-border bg-surface-footer px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:justify-between sm:px-5 sm:pb-3">
            {step === 'edit' ? (
              <>
                <button type="button" onClick={onClose} className="sr-only min-h-11 rounded-full px-[18px] whitespace-nowrap">Cancel</button>
                <button
                  type="button"
                  onClick={onSaveDraft}
                  className="inline-flex items-center justify-center rounded-full text-xs font-medium text-muted-foreground ring-1 ring-border transition hover:bg-muted hover:text-foreground rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  className={[
                    'inline-flex h-11 items-center justify-center rounded-full px-[18px] text-sm font-semibold shadow-ios-sm transition',
                    isFormReady
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  Review order · Rp {catalogPriceFormatter.format(estimatedOrderTotalIdr)}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onBackToEdit}
                  className="inline-flex items-center justify-center rounded-full text-xs font-medium text-muted-foreground ring-1 ring-border transition hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                >
                  Back
                </button>
                <button
                  type="submit"
                  aria-label="Confirm & create order"
                  className="inline-flex items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                >
                  Confirm & create
                </button>
              </>
            )}
          </div>
        </form>
        </div>
      </div>

      <AlertDialog
        open={closeConfirmationOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onContinueEditing()
        }}
      >
        <AlertDialogContent className="sm:max-w-xl">
          <AlertDialogHeader>
            <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"><FileText className="size-5" /></span><AlertDialogTitle>Keep this order draft?</AlertDialogTitle></div>
            <AlertDialogDescription>
              You have unsaved order details. Save them as a draft before
              closing, or discard them permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:grid sm:grid-cols-3">
            <AlertDialogCancel onClick={onContinueEditing}>Continue editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDiscardAndClose}
              className="!border !border-destructive/30 !bg-destructive/5 !text-destructive !shadow-none hover:!bg-destructive/10"
            >
              <Trash2 className="size-4" /> Discard changes
            </AlertDialogAction>
            <AlertDialogAction onClick={onSaveDraft}><Save className="size-4" /> Save draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
