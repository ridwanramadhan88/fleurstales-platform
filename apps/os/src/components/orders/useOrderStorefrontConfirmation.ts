import { useState } from 'react'
import type { OrderTableRow } from '../../types/orders'
import { toast } from '../../hooks/use-toast'
import {
  buildOrderCancelledMessage,
  buildOrderConfirmedMessage,
  buildOrderTrackingUrl,
  cancelPendingStorefrontOrder,
  confirmPendingStorefrontOrder,
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
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const onConfirm = async () => {
    if (!enabled || busy) return
    const waWindow = openWhatsAppPlaceholder()
    setBusy('confirm')
    try {
      const result = await confirmPendingStorefrontOrder(order)
      const trackingUrl = buildOrderTrackingUrl(result.publicTrackingId)
      const message = buildOrderConfirmedMessage(order, trackingUrl)
      navigateWhatsAppWindow(waWindow, buildWhatsAppLink(customerWhatsappNumber, message))
      toast({ title: 'Order confirmed', description: 'WhatsApp confirmation is ready to send.' })
    } catch (error) {
      waWindow?.close()
      toast({
        title: 'Order was not confirmed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  const onSubmitCancel = async () => {
    const reason = cancelReason.trim()
    if (!enabled || busy || !reason) return
    const waWindow = openWhatsAppPlaceholder()
    setBusy('cancel')
    try {
      const result = await cancelPendingStorefrontOrder(order, reason)
      const trackingUrl = buildOrderTrackingUrl(result.publicTrackingId)
      const message = buildOrderCancelledMessage(order, reason, trackingUrl)
      navigateWhatsAppWindow(waWindow, buildWhatsAppLink(customerWhatsappNumber, message))
      setCancelOpen(false)
      setCancelReason('')
      toast({ title: 'Order cancelled', description: 'WhatsApp cancellation message is ready to send.' })
    } catch (error) {
      waWindow?.close()
      toast({
        title: 'Order was not cancelled',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  return {
    storefrontDecisionBusy: busy,
    storefrontCancelOpen: cancelOpen,
    storefrontCancelReason: cancelReason,
    setStorefrontCancelReason: setCancelReason,
    onOpenStorefrontCancel: () => enabled && setCancelOpen(true),
    onCloseStorefrontCancel: () => {
      if (busy) return
      setCancelOpen(false)
      setCancelReason('')
    },
    onConfirmStorefrontOrder: onConfirm,
    onSubmitStorefrontCancel: onSubmitCancel,
  }
}
