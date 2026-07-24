import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FC,
} from 'react'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { StorefrontProductCard } from './StorefrontProductCard'

interface Props {
  title?: string
  products: CatalogProduct[]
  formatter: Intl.NumberFormat
  onOpen: (productId: string) => void
}

const sectionTitleClass = 'sf-section-title text-black'
const INTRO_FIRST_SLIDE_DELAY = 750
const INTRO_SLIDE_CARD_COUNT = 1
const LOOP_SCROLL_IDLE_DELAY = 140

export const StorefrontProductRail: FC<Props & { title: string }> = ({
  title,
  products,
  formatter,
  onOpen,
}) => {
  const railRef = useRef<HTMLDivElement | null>(null)
  const introTimersRef = useRef<number[]>([])
  const scrollIdleTimerRef = useRef<number | null>(null)
  const userInterruptedRef = useRef(false)
  const productSignature = products.map((product) => product.id).join('|')
  const isPhoneLayout = window.matchMedia('(max-width: 639px)').matches
  const shouldLoop = isPhoneLayout && products.length > 2

  const renderedProducts = useMemo(
    () =>
      shouldLoop
        ? Array.from({ length: 3 }, (_, copyIndex) =>
            products.map((product, productIndex) => ({
              product,
              copyIndex,
              productIndex,
            })),
          ).flat()
        : products.map((product, productIndex) => ({
            product,
            copyIndex: 0,
            productIndex,
          })),
    [products, shouldLoop],
  )

  const clearIntroTimers = useCallback(() => {
    introTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    introTimersRef.current = []
  }, [])

  const getRailItems = useCallback(() => {
    const rail = railRef.current
    if (!rail) return []
    return Array.from(
      rail.querySelectorAll<HTMLElement>('[data-featured-product]'),
    )
  }, [])

  const getLeadingInset = useCallback((rail: HTMLDivElement) => {
    const parsedInset = Number.parseFloat(
      window.getComputedStyle(rail).paddingLeft,
    )
    return Number.isFinite(parsedInset) ? parsedInset : 0
  }, [])

  const placeAtMiddleCopy = useCallback(() => {
    if (!shouldLoop) return

    const rail = railRef.current
    const items = getRailItems()
    const middleFirstItem = items[products.length]
    if (!rail || !middleFirstItem) return

    rail.scrollLeft = middleFirstItem.offsetLeft - getLeadingInset(rail)
  }, [getLeadingInset, getRailItems, products.length, shouldLoop])

  const normalizeLoopPosition = useCallback(() => {
    if (!shouldLoop) return

    const rail = railRef.current
    const items = getRailItems()
    const firstCopyStart = items[0]
    const middleCopyStart = items[products.length]
    const lastCopyStart = items[products.length * 2]

    if (!rail || !firstCopyStart || !middleCopyStart || !lastCopyStart) return

    const leadingInset = getLeadingInset(rail)
    const groupWidth = middleCopyStart.offsetLeft - firstCopyStart.offsetLeft
    if (groupWidth <= 0) return

    const middleStart = middleCopyStart.offsetLeft - leadingInset
    const lastStart = lastCopyStart.offsetLeft - leadingInset

    if (rail.scrollLeft < middleStart - 1) {
      rail.scrollLeft += groupWidth
    } else if (rail.scrollLeft >= lastStart - 1) {
      rail.scrollLeft -= groupWidth
    }
  }, [getLeadingInset, getRailItems, products.length, shouldLoop])

  const slideByCards = useCallback(
    (cardCount: number) => {
      if (userInterruptedRef.current) return

      const rail = railRef.current
      const items = getRailItems()
      if (!rail || items.length < 2) return

      const cardStep = items[1].offsetLeft - items[0].offsetLeft
      if (cardStep <= 0) return

      rail.scrollTo({
        left: rail.scrollLeft + cardStep * cardCount,
        behavior: 'smooth',
      })
    },
    [getRailItems],
  )

  const stopIntroMotion = useCallback(() => {
    userInterruptedRef.current = true
    clearIntroTimers()
  }, [clearIntroTimers])

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return

    userInterruptedRef.current = false
    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current)
      scrollIdleTimerRef.current = null
    }

    const frameId = window.requestAnimationFrame(() => {
      if (shouldLoop) placeAtMiddleCopy()
      else rail.scrollLeft = 0
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [placeAtMiddleCopy, productSignature, shouldLoop])

  useEffect(() => {
    clearIntroTimers()

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    if (!shouldLoop || reduceMotion) return

    introTimersRef.current = [
      window.setTimeout(
        () => slideByCards(INTRO_SLIDE_CARD_COUNT),
        INTRO_FIRST_SLIDE_DELAY,
      ),
    ]

    return clearIntroTimers
  }, [clearIntroTimers, productSignature, shouldLoop, slideByCards])

  useEffect(
    () => () => {
      clearIntroTimers()
      if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current)
      }
    },
    [clearIntroTimers],
  )

  const handleScroll = () => {
    if (!shouldLoop) return

    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current)
    }

    scrollIdleTimerRef.current = window.setTimeout(() => {
      normalizeLoopPosition()
      scrollIdleTimerRef.current = null
    }, LOOP_SCROLL_IDLE_DELAY)
  }

  return (
    <section aria-label={`${title} products`} className="space-y-3.5 lg:space-y-5">
      <h2 className={sectionTitleClass}>{title}</h2>

      <div className="featured-products-shell relative left-1/2 w-screen -translate-x-1/2">
        <div
          ref={railRef}
          onScroll={handleScroll}
          onPointerDown={stopIntroMotion}
          onTouchStart={stopIntroMotion}
          onWheel={stopIntroMotion}
          onKeyDown={stopIntroMotion}
          className="featured-products-rail no-scrollbar flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-2 sm:gap-5 lg:gap-7"
        >
          {renderedProducts.map(({ product, copyIndex, productIndex }) => (
            <div
              key={`${copyIndex}-${product.id}`}
              data-featured-product
              data-featured-copy={copyIndex}
              data-featured-index={productIndex}
              className="featured-product-item relative shrink-0 snap-start"
            >
              <span className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[#7050a8] text-sm text-white shadow-sm">
                ★
              </span>
              <StorefrontProductCard
                product={product}
                formatter={formatter}
                onOpenDetail={() => onOpen(product.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export const StorefrontProductGrid: FC<Props> = ({
  title,
  products,
  formatter,
  onOpen,
}) => (
  <section
    aria-label={title ?? 'Products'}
    className={`storefront-product-results ${title ? 'space-y-4 lg:space-y-5' : ''}`}
  >
    {title && <h2 className={sectionTitleClass}>{title}</h2>}
    {products.length === 0 ? (
      <div className="flex min-h-52 items-center justify-center rounded-[var(--sf-radius-panel)] bg-[#eee4dc] px-7 py-10 text-center">
        <p className="max-w-xs sf-support text-black/55">
          No products match this collection. Try a different category or type.
        </p>
      </div>
    ) : (
      <div className="sf-product-grid">
        {products.map((product) => (
          <StorefrontProductCard
            key={product.id}
            product={product}
            formatter={formatter}
            onOpenDetail={() => onOpen(product.id)}
            presentation="collection"
          />
        ))}
      </div>
    )}
  </section>
)
