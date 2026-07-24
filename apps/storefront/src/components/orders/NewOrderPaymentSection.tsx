import type { FC } from 'react'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'
import { NewOrderStructureSection } from './NewOrderStructureSection'
import { NewOrderGreetingCardSection } from './NewOrderGreetingCardSection'
import { NewOrderPaymentDetailsSection } from './NewOrderPaymentDetailsSection'
import { NewOrderNotesSection } from './NewOrderNotesSection'

/**
 * @file NewOrderPaymentSection.tsx
 * @description Composes the four cards shown in this part of the New Order
 * sheet — order structure, greeting card, payment, and order notes. Each
 * card previously lived inline in this one file; they're now their own
 * components (`NewOrderStructureSection`, `NewOrderGreetingCardSection`,
 * `NewOrderPaymentDetailsSection`, `NewOrderNotesSection`) so each can be
 * read, tested, and changed independently. This file keeps the same public
 * name/props so existing call sites (`NewOrderSheet.tsx`) are unaffected.
 */

interface NewOrderPaymentSectionProps {
  viewModel: NewOrderSheetViewModel
  fieldClass: (isActive: boolean) => string
  textAreaClass: (isActive: boolean) => string
  sectionClass: (isActive: boolean, base: string) => string
}

export const NewOrderPaymentSection: FC<NewOrderPaymentSectionProps> = ({
  viewModel,
  fieldClass,
  textAreaClass,
  sectionClass,
}) => {
  return (
    <>
      <NewOrderStructureSection
        viewModel={viewModel}
        fieldClass={fieldClass}
        textAreaClass={textAreaClass}
        sectionClass={sectionClass}
      />
      <NewOrderGreetingCardSection
        viewModel={viewModel}
        fieldClass={fieldClass}
        textAreaClass={textAreaClass}
        sectionClass={sectionClass}
      />
      <NewOrderPaymentDetailsSection
        viewModel={viewModel}
        fieldClass={fieldClass}
        sectionClass={sectionClass}
      />
      <NewOrderNotesSection
        viewModel={viewModel}
        textAreaClass={textAreaClass}
        sectionClass={sectionClass}
      />
    </>
  )
}
