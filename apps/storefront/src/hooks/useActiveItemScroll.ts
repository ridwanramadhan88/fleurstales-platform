import { useEffect, useRef } from 'react'

export const useActiveItemScroll = <T extends HTMLElement>(
  activeKey: unknown,
  selector = '[data-active="true"]',
) => {
  const containerRef = useRef<T>(null)

  useEffect(() => {
    const activeItem = containerRef.current?.querySelector<HTMLElement>(selector)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    activeItem?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeKey, selector])

  return containerRef
}
