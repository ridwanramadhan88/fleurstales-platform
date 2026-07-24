import { useEffect } from 'react'

/**
 * @file useDismissableModal.ts
 * @description Shared dismiss behavior for the app's modal/sheet shells
 * (Notification Center, Order Details, New Order). Previously the only way
 * to close any of these was the explicit X / Close button — this hook adds
 * the standard Escape-to-close behavior. Pair it with an `onClick={onClose}`
 * on the backdrop element (and `onClick={(e) => e.stopPropagation()}` on the
 * inner card) to also get click-outside-to-close.
 */
export const useDismissableModal = (open: boolean, onClose: () => void): void => {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])
}
