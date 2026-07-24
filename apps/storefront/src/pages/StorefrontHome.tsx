import { useEffect, useState, type CSSProperties, type FC, type KeyboardEvent } from 'react'
import heroFlowerArtwork from '../assets/storefront-home/main-artwork-group.svg'
import desktopHeroArtwork from '../assets/storefront-home/desktop-main-artwork.svg'
import { StorefrontHeader } from '../components/storefront/StorefrontHeader'

const mobileBlueFlowerPath = 'M272.52,929.07l85.09,3.61c10.93.46,19.69,9.19,20.19,20.12l1.68,36.34c.56,12.08-9.12,22.16-21.21,22.09l-69.7-.4c-14.02-.08-24.22,13.27-20.46,26.78l25.05,89.93c2.81,10.1-2.21,20.73-11.79,24.97l-32.5,14.39c-11.42,5.06-24.7-.85-28.6-12.7l-19.09-58c-5.29-16.09-26.43-19.71-36.77-6.29l-35.53,46.08c-7,9.07-19.95,10.91-29.2,4.14l-52.37-38.37c-11-8.06-11.59-24.27-1.21-33.1l50.15-42.69c11.68-9.94,9.19-28.63-4.68-35.17l-40.65-19.17c-7.54-3.55-12.28-11.21-12.1-19.54l.94-45.06c.31-15.03,15.78-24.92,29.56-18.91l61.51,26.87c11.1,4.85,24-.62,28.23-11.98l32.6-87.49c4.43-11.89,18.27-17.22,29.53-11.36l38.07,19.81c9.06,4.72,13.45,15.25,10.41,25.01l-16.42,52.72c-4.12,13.23,5.41,26.78,19.26,27.37Z'
const desktopBlueFlowerPath = 'M301.78,697.94l77.63,24.45c9.97,3.14,15.89,13.37,13.64,23.57l-7.46,33.95c-2.48,11.28-13.91,18.18-25.05,15.12l-64.22-17.66c-12.92-3.55-25.64,6.24-25.52,19.64l.81,89.21c.09,10.01-7.18,18.58-17.07,20.12l-33.57,5.22c-11.79,1.83-22.58-6.91-23.24-18.82l-3.22-58.26c-.89-16.16-19.5-24.74-32.37-14.93l-44.22,33.71c-8.71,6.64-21.12,5.12-27.97-3.42l-38.81-48.4c-8.15-10.16-4.67-25.27,7.1-30.85l56.87-26.96c13.24-6.28,15.58-24.14,4.41-33.62l-32.75-27.77c-6.07-5.15-8.55-13.39-6.32-21.03l12.05-41.35c4.02-13.79,20.75-19.08,31.97-10.11l50.1,40.05c9.04,7.23,22.31,5.38,29.03-4.05l51.79-72.65c7.04-9.87,21.13-11.35,30.07-3.15l30.22,27.73c7.19,6.6,8.63,17.41,3.4,25.66l-28.23,44.57c-7.09,11.19-1.65,26.06,10.98,30.04Z'

interface Props {
  cartCount: number
  onOpenCart: () => void
  onOpenCategories: () => void
  onOpenHome: () => void
  onOpenSearch: () => void
  onToggleMenu: () => void
  menuOpen: boolean
}

/** Poster-style storefront landing page reconstructed from the supplied mockup. */
export const StorefrontHome: FC<Props> = ({
  cartCount,
  onOpenCart,
  onOpenCategories,
  onOpenHome,
  onOpenSearch,
  onToggleMenu,
  menuOpen,
}) => {
  const [artworkSpin, setArtworkSpin] = useState(0)
  const replayArtworkSpin = () => setArtworkSpin((spin) => spin + 1)
  const handleArtworkKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      replayArtworkSpin()
    }
  }
  const flowerRotationStyle = {
    '--flower-rotation': `${artworkSpin * 180}deg`,
  } as CSSProperties

  useEffect(() => {
    const frame = window.requestAnimationFrame(replayArtworkSpin)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <main className="storefront-home" aria-label="Fleurstales online flower store">
    <StorefrontHeader
      cartCount={cartCount}
      onOpenCart={onOpenCart}
      onOpenHome={onOpenHome}
      onOpenSearch={onOpenSearch}
      onToggleMenu={onToggleMenu}
      menuOpen={menuOpen}
    />

    <div className="storefront-home__poster">
      <img
        className="storefront-home__flower storefront-home__artwork-base"
        src={heroFlowerArtwork}
        alt=""
        aria-hidden="true"
      />
      <svg
        className="storefront-home__flower storefront-home__blue-flower storefront-home__blue-flower--mobile"
        viewBox="0 0 1031.5 1853.15"
        role="button"
        tabIndex={0}
        aria-label="Rotate the blue flower"
        style={flowerRotationStyle}
        onClick={replayArtworkSpin}
        onKeyDown={handleArtworkKeyDown}
      >
        <path d={mobileBlueFlowerPath} />
      </svg>
      <img
        className="storefront-home__desktop-flower storefront-home__artwork-base"
        src={desktopHeroArtwork}
        alt=""
        aria-hidden="true"
      />
      <svg
        className="storefront-home__desktop-flower storefront-home__blue-flower storefront-home__blue-flower--desktop"
        viewBox="0 0 914.78 1565.65"
        role="button"
        tabIndex={0}
        aria-label="Rotate the blue flower"
        style={flowerRotationStyle}
        onClick={replayArtworkSpin}
        onKeyDown={handleArtworkKeyDown}
      >
        <path d={desktopBlueFlowerPath} />
      </svg>
      <div
        className="storefront-home__desktop-ground"
        aria-hidden="true"
      />

      <div className="storefront-home__headline">
        <span className="storefront-home__headline-line">You’ll get</span>
        <span className="storefront-home__headline-line storefront-home__headline-line--accent">Flowers</span>
        <span className="storefront-home__headline-line">Today!</span>
      </div>

      <button
        type="button"
        className="storefront-home__hero-shop tap-scale"
        onClick={onOpenCategories}
        aria-label="Open flower categories"
      >
        <span>Shop</span>
        <svg
          className="storefront-home__hero-shop-arrow"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 14.5h15.1l-4.7-5.15 2.15-1.95L25.4 16l-7.85 8.6-2.15-1.95 4.7-5.15H5v-3Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
    </main>
  )
}

export default StorefrontHome
