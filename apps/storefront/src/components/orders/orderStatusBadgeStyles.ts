import type { ComponentType } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Navigation,
  Package,
  PackageCheck,
  RefreshCw,
  UserCheck,
  XCircle,
} from 'lucide-react'
import type { OrderStatus, PaymentStatus } from '../../types/orders'
import type { OrderUrgency } from '../../domain/ordersDomain'
import type { ChipTone } from '../ui/chip'
import { STATUS_LABELS } from './orderStatusLabels'

/**
 * @file orderStatusBadgeStyles.ts
 * @description Everything that decides how a status/payment/urgency value is
 * *drawn* — icon components, chip tones, dot colors, and CSS classes. This is
 * intentionally kept separate from `orderStatusLabels.ts` (plain text) so
 * that badge-rendering components (StatusChip, stepper, quick-action button)
 * consume decisions made here rather than each re-deriving their own tone or
 * icon from a raw status string.
 */

/**
 * @description Icon per order status. Status is intentionally colorless now
 * (color is reserved for the time-until-delivery/pickup chip and for
 * payment states that need attention) — the icon carries the meaning
 * instead of a tint.
 */
export const STATUS_ICONS: Record<OrderStatus, ComponentType<{ className?: string }>> = {
  pending_verification: Hourglass,
  confirmed: CheckCircle2,
  processing: RefreshCw,
  ready: Package,
  delivering: Navigation,
  delivered: PackageCheck,
  picked_up: UserCheck,
  cancelled: XCircle,
  failed: AlertTriangle,
}

/**
 * @description Chip tone per payment status, paired with STATUS_CHIP_TONE so
 * the status strip in Order Details uses two consistent StatusChips instead
 * of one hand-rolled pill with a dot and one without.
 */
export const PAYMENT_CHIP_TONE: Record<PaymentStatus, ChipTone> = {
  unpaid: 'destructive',
  partial: 'warning',
  paid: 'success',
  refund_pending: 'info',
  refunded: 'neutral',
}

/**
 * @description Solid-dot color per payment status, used for the compact
 * indicator next to Total in the desktop table row — a paid order looks
 * identical to an unpaid one there otherwise (bug 7 in the UX polish list).
 */
export const PAYMENT_DOT_TONE: Record<PaymentStatus, string> = {
  unpaid: 'bg-destructive',
  partial: 'bg-warning',
  paid: 'bg-success',
  refund_pending: 'bg-info',
  refunded: 'bg-muted-foreground/50',
}

/**
 * @description Chip tone + label for the time-until-delivery/pickup chip.
 * Color is reserved for orders that need attention: red once the scheduled time has
 * passed (late), orange once it's under 1 hour away (dueSoon). Anything
 * still comfortably on time (onTrack) is shown with no color (neutral) so
 * the color only draws the eye when it matters.
 */
export const URGENCY_CHIP: Record<OrderUrgency, { label: string; tone: ChipTone }> = {
  late: { label: 'Late', tone: 'destructive' },
  dueSoon: { label: 'Due soon', tone: 'warning' },
  onTrack: { label: 'On track', tone: 'neutral' },
  done: { label: 'Ready', tone: 'neutral' },
}

/**
 * @description Background tint for the order card/row, based on status:
 * - Everything from Pending through Ready (and Delivering) stays plain
 *   white/card — no tint while the order is still in motion.
 * - Finished successfully (delivered / picked up): a faint green tint.
 * - Cancelled / failed: a faint red tint.
 * This is a subtle background wash only — the time chip is still what
 * carries the strong, attention-grabbing color.
 */
export const ORDER_CARD_BG: Record<OrderStatus, string> = {
  pending_verification: 'bg-card',
  confirmed: 'bg-card',
  processing: 'bg-card',
  ready: 'bg-card',
  delivering: 'bg-card',
  delivered: 'bg-success/5',
  picked_up: 'bg-success/5',
  cancelled: 'bg-destructive/5',
  failed: 'bg-destructive/5',
}

/**
 * @description Color/animation styling for each pipeline stage:
 * Pending = grey, Confirm/Processing = blue, Ready/Delivering = green
 * (outline), Finished = filled green. Shared by the horizontal top stepper
 * and the vertical timeline list so both stay visually consistent.
 */
export interface StatusStageStyle {
  currentDot: string
  doneDot: string
  currentText: string
  pulse: boolean
}

export const STATUS_STAGE_STYLE: Record<OrderStatus, StatusStageStyle> = {
  pending_verification: {
    currentDot: 'bg-muted-foreground ring-4 ring-muted-foreground/20',
    doneDot: 'bg-muted-foreground',
    currentText: 'text-muted-foreground',
    pulse: true,
  },
  confirmed: {
    currentDot: 'bg-info ring-4 ring-info/20',
    doneDot: 'bg-info',
    currentText: 'text-info',
    pulse: true,
  },
  processing: {
    currentDot: 'bg-info ring-4 ring-info/20',
    doneDot: 'bg-info',
    currentText: 'text-info',
    pulse: true,
  },
  ready: {
    currentDot: 'bg-success ring-4 ring-success/20',
    doneDot: 'bg-success',
    currentText: 'text-success',
    pulse: true,
  },
  delivering: {
    currentDot: 'bg-success ring-4 ring-success/20',
    doneDot: 'bg-success',
    currentText: 'text-success',
    pulse: true,
  },
  delivered: {
    currentDot: 'bg-success ring-4 ring-success/20',
    doneDot: 'bg-success',
    currentText: 'text-success',
    pulse: false,
  },
  picked_up: {
    currentDot: 'bg-success ring-4 ring-success/20',
    doneDot: 'bg-success',
    currentText: 'text-success',
    pulse: false,
  },
  cancelled: {
    currentDot: 'bg-destructive ring-4 ring-destructive/20',
    doneDot: 'bg-destructive',
    currentText: 'text-destructive',
    pulse: false,
  },
  failed: {
    currentDot: 'bg-destructive ring-4 ring-destructive/20',
    doneDot: 'bg-destructive',
    currentText: 'text-destructive',
    pulse: false,
  },
}

/**
 * @description Styling for the one-tap "quick advance" button (mobile card +
 * desktop row), colored to match the status it's advancing the order *to* —
 * e.g. advancing into "Ready" shows a green button. The final step reads
 * "Finished" instead of the raw delivered/picked-up status name, with a
 * solid filled green background so it stands out as the last action.
 */
export interface QuickActionButtonStyle {
  className: string
  /** True for the terminal step (delivered/picked up) — shows "Finished" instead of the raw status label. */
  isFinishStep: boolean
}

export const QUICK_ACTION_BUTTON_STYLE: Record<OrderStatus, QuickActionButtonStyle> = {
  pending_verification: {
    className: 'border border-info/30 bg-info/10 text-info hover:bg-info/10',
    isFinishStep: false,
  },
  confirmed: {
    className: 'border border-info/30 bg-info/10 text-info hover:bg-info/10',
    isFinishStep: false,
  },
  processing: {
    className: 'border border-info/30 bg-info/10 text-info hover:bg-info/10',
    isFinishStep: false,
  },
  ready: {
    className: 'border border-info/30 bg-info/10 text-info hover:bg-info/10',
    isFinishStep: false,
  },
  delivering: {
    className: 'border border-info/30 bg-info/10 text-info hover:bg-info/10',
    isFinishStep: false,
  },
  delivered: {
    className: 'border border-transparent bg-success text-white hover:bg-success/90',
    isFinishStep: true,
  },
  picked_up: {
    className: 'border border-transparent bg-success text-white hover:bg-success/90',
    isFinishStep: true,
  },
  cancelled: {
    className: 'border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10',
    isFinishStep: false,
  },
  failed: {
    className: 'border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10',
    isFinishStep: false,
  },
}

/**
 * @description Label to show on the quick-advance button for a given target
 * status — the terminal delivered/picked-up steps both read "Finished"
 * instead of exposing the raw backend status name.
 */
export const getQuickActionLabel = (status: OrderStatus): string =>
  QUICK_ACTION_BUTTON_STYLE[status].isFinishStep ? 'Finished' : STATUS_LABELS[status]
