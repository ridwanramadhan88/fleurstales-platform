import type { FC } from 'react'
import { NewOrderReviewStep } from './NewOrderReviewStep'
import type { NewOrderSheetViewModel } from './NewOrderSheetController'

interface NewOrderSummarySectionProps {
  viewModel: NewOrderSheetViewModel
}

export const NewOrderSummarySection: FC<NewOrderSummarySectionProps> = ({
  viewModel,
}) => {
  const {
    values,
    selectedCatalogProduct,
    estimatedOrderTotalIdr,
    voucherDiscountIdr,
    depositValueForReview,
    paymentStatusLabelForReview,
    paymentMethodLabelForReview,
    fulfillmentLabelForReview,
    catalogPriceFormatter,
    onBackToEdit,
  } = viewModel

  return (
    <NewOrderReviewStep
      values={values}
      selectedCatalogProduct={selectedCatalogProduct}
      estimatedOrderTotalIdr={estimatedOrderTotalIdr}
      voucherDiscountIdr={voucherDiscountIdr}
      depositValueForReview={depositValueForReview}
      paymentStatusLabel={paymentStatusLabelForReview}
      paymentMethodLabel={paymentMethodLabelForReview}
      fulfillmentLabel={fulfillmentLabelForReview}
      formatter={catalogPriceFormatter}
      onEdit={onBackToEdit}
    />
  )
}
