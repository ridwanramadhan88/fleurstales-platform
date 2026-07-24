import type { FC } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { CartBagIcon, CartCountBadge } from './StorefrontCartIcon'
import { StorefrontContainer } from './StorefrontContainer'
import { StorefrontBrand } from './StorefrontBrand'

interface Props {
  cartCount: number
  onOpenCart: () => void
  onOpenHome: () => void
  onOpenSearch: () => void
  onToggleMenu: () => void
  menuOpen: boolean
  onBack?: () => void
  backLabel?: string
}

export const StorefrontHeader: FC<Props> = ({
  cartCount,
  onOpenCart,
  onOpenHome,
  onOpenSearch,
  onToggleMenu,
  menuOpen,
  onBack,
  backLabel = 'Back',
}) => (
  <header className="storefront-topbar">
    <StorefrontContainer className="flex h-[56px] items-center sm:h-[60px] lg:h-[64px]">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="tap-scale -ml-2 mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition hover:bg-black/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
          aria-label={backLabel}
        >
          <ArrowLeft className="size-[18px] lg:size-5" strokeWidth={1.8} />
        </button>
      )}

      <button
        type="button"
        onClick={onOpenHome}
        className="tap-scale mr-auto inline-flex min-w-0 items-center rounded-md leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
        aria-label="Back to Fleurstales home"
      >
        <StorefrontBrand variant="header" showType />
      </button>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={onOpenSearch}
          className="tap-scale inline-flex size-11 items-center justify-center rounded-full transition hover:bg-black/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
          aria-label="Search flowers"
        >
          <Search className="size-[1.35rem] lg:size-6" strokeWidth={2.55} />
        </button>

        <button
          type="button"
          onClick={onOpenCart}
          className="tap-scale relative flex size-11 items-center justify-center rounded-full transition hover:bg-black/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
          aria-label={`Open cart${cartCount > 0 ? `, ${cartCount} items` : ''}`}
        >
          <span
            className={`storefront-cart-glyph ${
              cartCount > 0 ? 'storefront-cart-glyph--cutout' : ''
            } ${cartCount > 99 ? 'storefront-cart-glyph--cutout-wide' : ''}`.trim()}
            aria-hidden="true"
          >
            <CartBagIcon className="h-auto w-6 lg:w-[1.7rem]" />
          </span>
          <CartCountBadge count={cartCount} surface="light" />
        </button>

        <button
          type="button"
          onClick={onToggleMenu}
          className="tap-scale inline-flex size-11 items-center justify-center rounded-full transition hover:bg-black/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
          aria-label={menuOpen ? 'Close categories menu' : 'Open categories menu'}
          aria-expanded={menuOpen}
        >
          <span
            className={`storefront-menu-glyph ${
              menuOpen ? 'storefront-menu-glyph--open' : ''
            }`}
            aria-hidden="true"
          >
            <span />
            <span />
          </span>
        </button>
      </div>
    </StorefrontContainer>
  </header>
)
