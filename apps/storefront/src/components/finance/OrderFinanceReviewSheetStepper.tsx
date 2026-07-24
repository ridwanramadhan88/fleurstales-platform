import type { FC } from "react";
import { OrderProgressStepper } from "../orders/OrderProgressStepper";
import type { OrderFinanceReviewSheetViewModel } from "./OrderFinanceReviewSheetController";

type OrderFinanceReviewSheetStepperProps = Pick<
  OrderFinanceReviewSheetViewModel,
  "isTerminalIssue" | "horizontalOptions" | "horizontalCurrentIndex"
>;

export const OrderFinanceReviewSheetStepper: FC<
  OrderFinanceReviewSheetStepperProps
> = ({ isTerminalIssue, horizontalOptions, horizontalCurrentIndex }) => {
  if (isTerminalIssue) return null;

  return (
    <OrderProgressStepper
      options={horizontalOptions}
      currentIndex={Math.max(0, horizontalCurrentIndex)}
      ariaLabel="Finance order progress"
      className="mb-3 bg-muted/35"
    />
  );
};
