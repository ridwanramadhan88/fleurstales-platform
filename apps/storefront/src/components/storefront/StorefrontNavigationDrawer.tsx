import { useEffect, useRef, type FC } from 'react'
import { ChevronRight } from 'lucide-react'
import classicRoseCollectionCard from '../../assets/storefront-collections/classic-rose.svg'
import medLilyCollectionCard from '../../assets/storefront-collections/med-lily-series.svg'
import thumbelinaCollectionCard from '../../assets/storefront-collections/thumbelina.svg'
import omakaseCollectionCard from '../../assets/storefront-collections/omakase.svg'

const collectionCards = [
  {
    name: 'Classic Rose',
    image: classicRoseCollectionCard,
    textColor: '#fbf9ef',
  },
  {
    name: 'Med Lily Series',
    image: medLilyCollectionCard,
    textColor: '#174c38',
  },
  {
    name: 'Thumbelina',
    image: thumbelinaCollectionCard,
    textColor: '#174c38',
  },
  {
    name: 'Omakase',
    image: omakaseCollectionCard,
    textColor: '#fbf9ef',
  },
] as const

interface Props {
  open: boolean
  onClose: () => void
  onOpenCategories: () => void
  onOpenAllFlowers: () => void
  onOpenCollection: (collection: string) => void
}

export const StorefrontNavigationDrawer: FC<Props> = ({
  open,
  onClose,
  onOpenCategories,
  onOpenAllFlowers,
  onOpenCollection,
}) => {
  const collectionRailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => {
      collectionRailRef.current?.scrollTo({ left: 0, behavior: 'auto' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [open])

  return (
    <div
      className={`storefront-navigation-layer ${open ? 'storefront-navigation-layer--open' : ''}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="storefront-navigation-backdrop"
        onClick={onClose}
        aria-label="Close navigation menu"
        tabIndex={open ? 0 : -1}
      />

    <aside
      className="storefront-navigation-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Store navigation"
    >
      <div className="storefront-navigation-drawer__content no-scrollbar">
        <div className="storefront-navigation-drawer__heading">
          <h2 className="font-display text-[2.7rem] font-medium leading-[0.92] sm:text-[2.95rem] lg:text-[3.35rem]">
            Explore
          </h2>
        </div>

        <nav aria-label="Store navigation" className="storefront-navigation-list">
          <button
            type="button"
            className="storefront-navigation-parent flex w-full items-center justify-between gap-4"
            onClick={onOpenCategories}
          >
            <span>Categories</span>
            <ChevronRight className="size-5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="storefront-navigation-parent"
            onClick={onOpenAllFlowers}
          >
            All Flowers
          </button>
        </nav>

        <section
          className="storefront-navigation-collections"
          aria-labelledby="storefront-navigation-collections-title"
        >
          <div className="storefront-navigation-collections__heading">
            <h3 id="storefront-navigation-collections-title">Collection Series</h3>
            <span aria-hidden="true">Swipe</span>
          </div>

          <div
            ref={collectionRailRef}
            className="storefront-navigation-collections__rail no-scrollbar"
          >
            {collectionCards.map((collection) => (
              <button
                key={collection.name}
                type="button"
                className="storefront-navigation-collection-card tap-scale"
                onClick={() => onOpenCollection(collection.name)}
                aria-label={`Shop ${collection.name} collection`}
              >
                <img src={collection.image} alt="" aria-hidden="true" />
                <span style={{ color: collection.textColor }}>
                  {collection.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
      </aside>
    </div>
  )
}
