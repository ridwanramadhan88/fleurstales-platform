import { useMemo, type FC } from "react";
import type { OrderFulfillment, OrderStatus } from "../../types/orders";
import { isWorkflowHappyPathStatus } from "../../domain/orderBusinessRules";
import { getOrderStatusOptionsForFulfillment } from "./orderTableLabels";
import { OrderProgressStepper } from "./OrderProgressStepper";

export interface OrderStatusStepperProps {
  fulfillment: OrderFulfillment;
  isOrderFuture: boolean;
  status: OrderStatus;
}

export const OrderStatusStepper: FC<OrderStatusStepperProps> = ({
  fulfillment,
  isOrderFuture,
  status,
}) => {
  const options = useMemo(
    () =>
      getOrderStatusOptionsForFulfillment(fulfillment, isOrderFuture).filter(
        (option) => isWorkflowHappyPathStatus(option.id),
      ),
    [fulfillment, isOrderFuture],
  );
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.id === status),
  );

  return (
    <OrderProgressStepper
      options={options}
      currentIndex={currentIndex}
      className="mb-4"
    />
  );
};

export default OrderStatusStepper;
