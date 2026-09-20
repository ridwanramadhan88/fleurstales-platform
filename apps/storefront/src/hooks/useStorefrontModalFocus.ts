import { useCallback, useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const getFocusableElements = (container: HTMLElement | null): HTMLElement[] => {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.tabIndex >= 0)
}

export const useStorefrontModalFocus = <T extends HTMLElement>(
  open: boolean,
  initialFocusRef?: RefObject<HTMLElement | null>,
) => {
  const containerRef = useRef<T | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const frame = window.requestAnimationFrame(() => {
      const initialFocus = initialFocusRef?.current ?? getFocusableElements(containerRef.current)[0]
      initialFocus?.focus()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      const previousFocus = previousFocusRef.current
      if (previousFocus?.isConnected) previousFocus.focus()
      previousFocusRef.current = null
    }
  }, [initialFocusRef, open])

  const onKeyDown = useCallback((event: KeyboardEvent<T>) => {
    if (!open || event.key !== 'Tab') return

    const focusable = getFocusableElements(containerRef.current)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey) {
      if (active === first || !containerRef.current?.contains(active)) {
        event.preventDefault()
        last.focus()
      }
      return
    }

    if (active === last || !containerRef.current?.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }, [open])

  return { containerRef, onKeyDown }
}
