import { useEffect, useLayoutEffect, useRef, useState, type FC } from 'react'
import { CartBagIcon } from './StorefrontCartIcon'

interface Props {
  count: number
  totalIdr: number
  formatter: Intl.NumberFormat
  onOpen: () => void
  concealed?: boolean
  suppressUnderlay?: boolean
}

export const StorefrontMiniCart: FC<Props> = ({
  count,
  totalIdr,
  formatter,
  onOpen,
  concealed = false,
  suppressUnderlay = false,
}) => {
  const isVisible = !concealed
  const [panelVisible, setPanelVisible] = useState(false)
  const panelRevealFrameRef = useRef<number | null>(null)
  const underlayReleaseTimerRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const root = document.documentElement
    const body = document.body
    const className = 'storefront-mini-cart-underlay-active'

    if (panelRevealFrameRef.current !== null) {
      window.cancelAnimationFrame(panelRevealFrameRef.current)
      panelRevealFrameRef.current = null
    }

    if (underlayReleaseTimerRef.current !== null) {
      window.clearTimeout(underlayReleaseTimerRef.current)
      underlayReleaseTimerRef.current = null
    }

    if (isVisible) {
      if (suppressUnderlay) {
        // The side navigation owns the full viewport while open. Remove the
        // browser underlay immediately, but keep the cart panel state intact
        // behind the navigation layer.
        root.classList.remove(className)
        body.classList.remove(className)
        setPanelVisible(true)
        return
      }

      // Paint the browser underlay first. The cart panel starts its entrance on
      // the following frame, so Safari never waits for the movement to finish.
      root.classList.add(className)
      body.classList.add(className)
      panelRevealFrameRef.current = window.requestAnimationFrame(() => {
        setPanelVisible(true)
        panelRevealFrameRef.current = null
      })
      return
    }

    setPanelVisible(false)
    if (!root.classList.contains(className)) return

    // Release the browser underlay twice as quickly on exit so it does not
    // linger after the cart bar starts leaving the viewport.
    underlayReleaseTimerRef.current = window.setTimeout(() => {
      root.classList.remove(className)
      body.classList.remove(className)
      underlayReleaseTimerRef.current = null
    }, 540)
  }, [isVisible, suppressUnderlay])

  useEffect(() => () => {
    if (panelRevealFrameRef.current !== null) {
      window.cancelAnimationFrame(panelRevealFrameRef.current)
    }
    if (underlayReleaseTimerRef.current !== null) {
      window.clearTimeout(underlayReleaseTimerRef.current)
    }
    document.documentElement.classList.remove('storefront-mini-cart-underlay-active')
    document.body.classList.remove('storefront-mini-cart-underlay-active')
  }, [])

  return (
    <div
      className={`storefront-mini-cart${panelVisible ? ' storefront-mini-cart--visible' : ''}`}
      aria-hidden={!panelVisible}
    >
      <div className="storefront-mini-cart__panel">
        <div className="storefront-mini-cart__content">
          <div className="storefront-mini-cart__summary">
            <span className="storefront-mini-cart__count">
              {count} {count === 1 ? 'item' : 'items'}
            </span>
            <span className="storefront-mini-cart__price tabular-nums">
              Rp. {formatter.format(totalIdr)}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpen}
            className="storefront-mini-cart__button"
            aria-label={`View cart, ${count} ${count === 1 ? 'item' : 'items'}`}
            tabIndex={panelVisible ? 0 : -1}
          >
            <CartBagIcon tone="light" className="h-auto w-5" />
            <span>View cart</span>
          </button>
        </div>
      </div>
    </div>
  )
}
