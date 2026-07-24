import type { FC } from 'react'
import cartBagDark from '../../assets/storefront-shop/cart-bag.svg'
import cartBagLight from '../../assets/storefront-shop/cart-bag-outline.svg'

interface CartBagIconProps {
  tone?: 'dark' | 'light'
  className?: string
}

/**
 * Uses the approved storefront cart-bag SVG assets directly so every cart
 * surface stays visually consistent with the provided icon pack.
 */
export const CartBagIcon: FC<CartBagIconProps> = ({
  tone = 'dark',
  className = 'h-auto w-7',
}) => {
  const src = tone === 'light' ? cartBagLight : cartBagDark

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`block shrink-0 object-contain ${className}`.trim()}
      draggable={false}
    />
  )
}

interface CartCountBadgeProps {
  count: number
  surface: 'light' | 'dark'
  className?: string
}

export const CartCountBadge: FC<CartCountBadgeProps> = ({
  count,
  surface,
  className = '',
}) => {
  if (count <= 0) return null

  const displayCount = count > 99 ? '99+' : String(count)
  const densityClass = count > 99 ? 'storefront-cart-badge--wide' : count > 9 ? 'storefront-cart-badge--double' : ''

  return (
    <span
      className={`storefront-cart-badge storefront-cart-badge--${surface} ${densityClass} ${className}`.trim()}
      aria-hidden="true"
    >
      {displayCount}
    </span>
  )
}
