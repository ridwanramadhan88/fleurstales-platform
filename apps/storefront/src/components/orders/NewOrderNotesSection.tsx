import type { FC } from 'react'
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

  return (
    <section
      onFocus={() => onSectionFocus('notes')}
      className={sectionClass(
        activeGuideSection === 'notes',
        'space-y-1.5 rounded-lg bg-surface-panel px-3 py-3',
      )}
    >
      <label htmlFor="orderNote" className="text-sm font-semibold leading-5 text-foreground">
        Order note
      </label>
      <textarea
        id="orderNote"
        value={values.orderNote}
        onChange={onFieldChange('orderNote')}
        className={textAreaClass(activeGuideField === 'orderNote')}
        placeholder="Special requests, recipient instructions, or other notes for this order."
      />
    </section>
  )
}
