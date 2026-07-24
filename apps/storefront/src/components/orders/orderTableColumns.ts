/**
 * @description Columns the orders list can be sorted by. Available on every
 * scope/tab (Active and Completed) since they share this component.
 */
export type OrderSortKey =
  | 'order'
  | 'source'
  | 'fulfillment'
  | 'status'
  | 'florist'
  | 'total'
  | 'createdAt'
  | 'eta'

/**
 * @description Sort direction for the currently selected column.
 */
export type SortDirection = 'asc' | 'desc'
