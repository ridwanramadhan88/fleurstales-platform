import type { OrderActivityEvent } from '../../store/orderRuntimeStore'

/**
 * @description Stable, shared empty-array reference used as a selector fallback.
 * IMPORTANT: never inline `?? []` in a zustand selector — a fresh array on
 * every call is a *new reference* each render, which makes React's
 * useSyncExternalStore think the store snapshot changed every time, causing
 * an infinite render loop ("Maximum update depth exceeded"). Using one
 * shared constant reference fixes that.
 */
export const EMPTY_ACTIVITIES: OrderActivityEvent[] = []
