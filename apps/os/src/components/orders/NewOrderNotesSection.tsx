import { useState, type FC } from 'react'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'

/**
 * @description "Order note" card of the New Order sheet. Split out of
 * `NewOrderPaymentSection.tsx`.
 */

interface NewOrderNotesSectionProps {
  viewModel: NewOrderSheetViewModel
  textAreaClass: (filled: boolean) => string
  sectionClass: (isActive: boolean, base: string) => string
}

export const NewOrderNotesSection: FC<NewOrderNotesSectionProps> = ({
  viewModel,
  textAreaClass,
  sectionClass,
}) => {
  const { values, activeGuideField, activeGuideSection, onFieldChange, onSectionFocus } = viewModel
  const hasNote = Boolean(values.orderNote.trim())
  const [expanded, setExpanded] = useState(hasNote)

  if (!expanded && !hasNote) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primary hover:underline"
      >
        + Add note
      </button>
    )
  }

  return (
    <section
      onFocus={() => onSectionFocus('notes')}
      className={sectionClass(
        activeGuideSection === 'notes',
        'space-y-1.5 px-1 py-1',
      )}
    >
      <label htmlFor="orderNote" className="text-sm font-semibold leading-5 text-foreground">
        Order note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
      </label>
      <textarea
        autoFocus={!hasNote}
        id="orderNote"
        value={values.orderNote}
        onChange={onFieldChange('orderNote')}
        className={textAreaClass(activeGuideField === 'orderNote')}
        placeholder="Special requests, recipient instructions, or other notes for this order."
      />
    </section>
  )
}
