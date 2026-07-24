import type { FC } from 'react'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'

/**
 * @description "Greeting card" card of the New Order sheet: the gift
 * message and the name it should be signed with. Message comes first since
 * it's what the florist actually writes on the card; the "from" name reads
 * as a caption directly under it rather than a disconnected label above.
 */

interface NewOrderGreetingCardSectionProps {
  viewModel: NewOrderSheetViewModel
  fieldClass: (isActive: boolean) => string
  textAreaClass: (isActive: boolean) => string
  sectionClass: (isActive: boolean, base: string) => string
}

export const NewOrderGreetingCardSection: FC<NewOrderGreetingCardSectionProps> = ({
  viewModel,
  fieldClass,
  textAreaClass,
  sectionClass,
}) => {
  const { values, activeGuideField, activeGuideSection, onFieldChange, onSectionFocus } =
    viewModel

  return (
    <section
      onFocus={() => onSectionFocus('greetingCard')}
      className={sectionClass(
        activeGuideSection === 'greetingCard',
        'space-y-3 rounded-lg bg-surface-panel px-3 py-3',
      )}
    >
      <h3 className="text-sm font-semibold leading-5 text-foreground">Greeting card</h3>
      <div className="space-y-1.5">
        <label htmlFor="greetingMessage" className="text-xs font-medium text-muted-foreground">
          Message
        </label>
        <textarea
          id="greetingMessage"
          value={values.greetingMessage}
          onChange={onFieldChange('greetingMessage')}
          className={textAreaClass(activeGuideField === 'greetingMessage')}
          placeholder="Write the message on the card."
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="greetingCardName"
          className="text-xs font-semibold text-foreground"
        >
          Name on card
        </label>
        <input
          id="greetingCardName"
          type="text"
          value={values.greetingCardName}
          onChange={onFieldChange('greetingCardName')}
          className={fieldClass(activeGuideField === 'greetingCardName')}
          placeholder="e.g. From Budi"
        />
      </div>
    </section>
  )
}
