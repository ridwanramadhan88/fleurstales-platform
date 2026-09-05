import { useState } from 'react'
import type { OrderTableRow } from '../../types/orders'
import { toast } from '../../hooks/use-toast'
import {
  buildOrderCancelledMessage,
  buildOrderConfirmedMessage,
  buildOrderTrackingUrl,
  cancelPendingStorefrontOrder,
  confirmPendingStorefrontOrder,
  getOrderTrackingId,
} from '../../data/orderCustomerConfirmation'
import { buildWhatsAppLink } from './orderTableWhatsApp'

const openWhatsAppPlaceholder = (): Window | null => {
  const target = window.open('about:blank', '_blank')
  try {
    if (target) target.opener = null
  } catch {
    // Cross-browser safety; the target can still be navigated below.
  }
  return target
}

const navigateWhatsAppWindow = (target: Window | null, url: string): void => {
  if (target && !target.closed) {
    target.location.href = url
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export type StorefrontDecisionPreviewKind = 'confirm' | 'reject'

export const useOrderStorefrontConfirmation = ({
  order,
  customerWhatsappNumber,
  enabled,
}: {
  order: OrderTableRow
  customerWhatsappNumber?: string
  enabled: boolean
}) => {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [previewModal, setPreviewModal] = useState<StorefrontDecisionPreviewKind | null>(null)
  const [previewMessage, setPreviewMessage] = useState('')
  const [pendingRejectReason, setPendingRejectReason] = useState('')

  const buildPreviewFailureMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Please try again.'

  /** Step 1 for Confirm: fetch the tracking link and show the exact WhatsApp
   * text before anything is sent — no network mutation yet. */
  const onOpenConfirmPreview = async () => {
    if (!enabled || busy || !order.id) return
    setPreviewLoading(true)
    try {
      const trackingId = await getOrderTrackingId(order.id)
      const trackingUrl = buildOrderTrackingUrl(order.orderNumber, trackingId, 'confirmed')
      setPreviewMessage(buildOrderConfirmedMessage(order, trackingUrl))
      setPreviewModal('confirm')
    } catch (error) {
      toast({
        title: 'Could not prepare the confirmation message',
        description: buildPreviewFailureMessage(error),
        variant: 'destructive',
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  /** Step 2 for Confirm: the modal's own "Send WhatsApp" click — still a
   * direct user gesture, so the WhatsApp placeholder window can still open
   * synchronously here before the async confirm call resolves. */
  const onSendConfirmWhatsApp = async () => {
    if (!enabled || busy) return
    const waWindow = openWhatsAppPlaceholder()
    setBusy('confirm')
    try {
      const result = await confirmPendingStorefrontOrder(order)
      const trackingUrl = buildOrderTrackingUrl(order.orderNumber, result.publicTrackingId, 'confirmed')
      const message = buildOrderConfirmedMessage(order, trackingUrl)
      navigateWhatsAppWindow(waWindow, buildWhatsAppLink(customerWhatsappNumber, message))
      setPreviewModal(null)
      toast({ title: 'Order confirmed', description: 'WhatsApp confirmation is ready to send.' })
    } catch (error) {
      waWindow?.close()
      toast({
        title: 'Order was not confirmed',
        description: buildPreviewFailureMessage(error),
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  /** Step 1 for Reject: the existing cancel-reason dialog collects the
   * reason, then this transitions into the reject preview (step 2) instead
   * of sending immediately. */
  const onSubmitCancel = async () => {
    const reason = cancelReason.trim()
    if (!enabled || busy || !reason || !order.id) return
    setPreviewLoading(true)
    try {
      const trackingId = await getOrderTrackingId(order.id)
      const trackingUrl = buildOrderTrackingUrl(order.orderNumber, trackingId, 'confirmed')
      setPendingRejectReason(reason)
      setPreviewMessage(buildOrderCancelledMessage(order, reason, trackingUrl))
      setCancelOpen(false)
      setPreviewModal('reject')
    } catch (error) {
      toast({
        title: 'Could not prepare the rejection message',
        description: buildPreviewFailureMessage(error),
        variant: 'destructive',
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  /** Step 2 for Reject: the preview modal's "Send WhatsApp" click. */
  const onSendRejectWhatsApp = async () => {
    if (!enabled || busy || !pendingRejectReason) return
    const waWindow = openWhatsAppPlaceholder()
    setBusy('cancel')
    try {
      const result = await cancelPendingStorefrontOrder(order, pendingRejectReason)
      const trackingUrl = buildOrderTrackingUrl(order.orderNumber, result.publicTrackingId, 'confirmed')
      const message = buildOrderCancelledMessage(order, pendingRejectReason, trackingUrl)
      navigateWhatsAppWindow(waWindow, buildWhatsAppLink(customerWhatsappNumber, message))
      setPreviewModal(null)
      setCancelReason('')
      setPendingRejectReason('')
      toast({ title: 'Order cancelled', description: 'WhatsApp cancellation message is ready to send.' })
    } catch (error) {
      waWindow?.close()
      toast({
        title: 'Order was not cancelled',
        description: buildPreviewFailureMessage(error),
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  return {
    storefrontDecisionBusy: busy,
    storefrontPreviewLoading: previewLoading,
    storefrontCancelOpen: cancelOpen,
    storefrontCancelReason: cancelReason,
    setStorefrontCancelReason: setCancelReason,
    onOpenStorefrontCancel: () => enabled && setCancelOpen(true),
    onCloseStorefrontCancel: () => {
      if (busy) return
      setCancelOpen(false)
      setCancelReason('')
    },
    storefrontPreviewModal: previewModal,
    storefrontPreviewMessage: previewMessage,
    onOpenStorefrontConfirmPreview: onOpenConfirmPreview,
    onCloseStorefrontPreview: () => { if (!busy) setPreviewModal(null) },
    onSendConfirmWhatsApp,
    onSendRejectWhatsApp,
    onSubmitStorefrontCancel: onSubmitCancel,
  }
}
