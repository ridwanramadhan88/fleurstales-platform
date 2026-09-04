import './orders'

declare module './orders' {
  interface OrderChangeRequest {
    /** Unique id for this request. */
    id: string
  }
}
