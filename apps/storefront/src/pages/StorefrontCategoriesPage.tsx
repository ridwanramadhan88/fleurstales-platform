import { useMemo, useState, type FC } from 'react'
import type { CatalogProduct } from '../store/catalogStoreTypes'
import { StorefrontHeader } from '../components/storefront/StorefrontHeader'
import { StorefrontContainer } from '../components/storefront/StorefrontContainer'
import { StorefrontFooter } from '../components/storefront/StorefrontFooter'
import type { StoreProfileSettings } from '../types/settings'
import generalGiftingCard from '../assets/storefront-occasions/general-gifting.svg'
import birthdayCard from '../assets/storefront-occasions/birthday.svg'
import weddingCard from '../assets/storefront-occasions/wedding.svg'
import graduationCard from '../assets/storefront-occasions/graduation.svg'
import congratulationsCard from '../assets/storefront-occasions/congratulations.svg'
import condolenceCard from '../assets/storefront-occasions/condolence.svg'
import anniversaryCard from '../assets/storefront-occasions/anniversary.svg'
import bouquetArrangementCard from '../assets/storefront-arrangements/bouquet.svg'
import boxBasketVaseArrangementCard from '../assets/storefront-arrangements/box-basket-vase.svg'
import standingFlowerArrangementCard from '../assets/storefront-arrangements/standing-flower.svg'
import flowerCakeArrangementCard from '../assets/storefront-arrangements/flower-cake.svg'
import classicRoseCollectionCard from '../assets/storefront-collections/classic-rose.svg'
import medLilyCollectionCard from '../assets/storefront-collections/med-lily-series.svg'
import thumbelinaCollectionCard from '../assets/storefront-collections/thumbelina.svg'
import omakaseCollectionCard from '../assets/storefront-collections/omakase.svg'

type CategoryTab = 'occasion' | 'arrangement' | 'collection'

interface Props {
  products: CatalogProduct[]
  occasionNames: string[]
  cartCount: number
  storeProfile: StoreProfileSettings
  onOpenCart: () => void
  onOpenHome: () => void
  onOpenSearch: () => void
  onToggleMenu: () => void
  menuOpen: boolean
  onSelectOccasion: (occasion: string) => void
  onSelectArrangement: (arrangementType: string) => void
  onSelectCollection: (collectionSeries: string) => void
}

interface ArtworkCardDefinition {
  name: string
  displayName?: string
  titleLines?: readonly [string, string]
  subtitle?: string
  image: string
  textColor: string
  arrowBackground?: string
  arrowColor?: string
}

interface ArtworkCardItem extends ArtworkCardDefinition {
  count: number
  onClick: () => void
}

const tabs: Array<{ id: CategoryTab; label: string; mobileLabel?: string }> = [
  { id: 'occasion', label: 'Occasion' },
  { id: 'arrangement', label: 'Arrangement Type', mobileLabel: 'Arrangement.' },
  { id: 'collection', label: 'Collection Series' },
]

const occasionCards: ArtworkCardDefinition[] = [
  { name: 'General Gifting', subtitle: 'Bouquet, Vase, & more', image: generalGiftingCard, textColor: '#fbf9ef' },
  { name: 'Birthday', subtitle: 'Cake, Bouquet, & more', image: birthdayCard, textColor: '#fbf9ef' },
  { name: 'Wedding', subtitle: 'Bridal Bouquet, Omakase', image: weddingCard, textColor: '#fbf9ef' },
  { name: 'Graduation', subtitle: 'Bouquet, Grad Gift, & more', image: graduationCard, textColor: '#144d36' },
  { name: 'Congratulations', subtitle: 'Standing Flower, Box, & more', image: congratulationsCard, textColor: '#fbf9ef' },
  { name: 'Condolence', subtitle: 'Standing Flower, Vase, & more', image: condolenceCard, textColor: '#6d4b85' },
  { name: 'Anniversary', subtitle: 'Rose Bouquet, Vase, & more', image: anniversaryCard, textColor: '#fbf9ef' },
]

const arrangementCards: ArtworkCardDefinition[] = [
  {
    name: 'Bouquet',
    image: bouquetArrangementCard,
    textColor: '#fbf9ef',
    arrowBackground: '#f5eee6',
    arrowColor: '#057640',
  },
  {
    name: 'Box, Basket & Vase',
    titleLines: ['Box, Basket', '& Vase'],
    image: boxBasketVaseArrangementCard,
    textColor: '#fbf9ef',
    arrowBackground: '#f5eee6',
    arrowColor: '#f684b1',
  },
  {
    name: 'Standing Flower',
    titleLines: ['Standing', 'Flower'],
    image: standingFlowerArrangementCard,
    textColor: '#0a6240',
    arrowBackground: '#0a6240',
    arrowColor: '#fcbe0c',
  },
  {
    name: 'Flower Cake',
    image: flowerCakeArrangementCard,
    textColor: '#fbf9ef',
    arrowBackground: '#f5eee6',
    arrowColor: '#4972d1',
  },
]

const collectionCards: ArtworkCardDefinition[] = [
  {
    name: 'Classic Rose',
    image: classicRoseCollectionCard,
    textColor: '#fbf9ef',
    arrowBackground: '#fbf6ec',
    arrowColor: '#174c38',
  },
  {
    name: 'Med Lily Series',
    image: medLilyCollectionCard,
    textColor: '#174c38',
    arrowBackground: '#174c38',
    arrowColor: '#fbf6ec',
  },
  {
    name: 'Thumbelina',
    image: thumbelinaCollectionCard,
    textColor: '#174c38',
    arrowBackground: '#174c38',
    arrowColor: '#fbf6ec',
  },
  {
    name: 'Omakase',
    image: omakaseCollectionCard,
    textColor: '#fbf9ef',
    arrowBackground: '#fbf6ec',
    arrowColor: '#5546a8',
  },
]

const normaliseCategoryName = (value: string) => value.trim().toLowerCase()

const countProducts = (products: CatalogProduct[], predicate: (product: CatalogProduct) => boolean) =>
  products.filter((product) => product.isActive && predicate(product)).length

const usesCompactCategoryTitle = (value: string) => value.length >= 14

const ArtworkCategoryCard: FC<{ item: ArtworkCardItem }> = ({ item }) => {
  const title = item.displayName ?? item.name
  const compactTitle = usesCompactCategoryTitle(title)
  const hasFixedTitleLines = Boolean(item.titleLines)

  return (
  <button
    type="button"
    onClick={item.onClick}
    className="category-art-card group relative block aspect-[955.84/357.97] w-full overflow-hidden rounded-[1.05rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-[#fdf6ee]"
    aria-label={`Shop ${item.name}${item.count === 0 ? ', no products yet' : ''}`}
  >
    <img
      src={item.image}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 block h-full w-full object-fill"
    />
    <span
      className={`pointer-events-none absolute left-[7.25%] top-[18.5%] flex flex-col gap-[clamp(0.28rem,1vw,0.52rem)] ${
        item.subtitle ? 'max-w-[56%]' : 'max-w-[63%]'
      }`}
      aria-hidden="true"
    >
      <span
        className={`category-art-card__title block whitespace-nowrap font-host font-semibold [font-kerning:normal] ${
          hasFixedTitleLines
            ? 'text-[clamp(1.76rem,7.2vw,3.48rem)] leading-[0.88] sm:text-[clamp(1.86rem,3.7vw,3.4rem)]'
            : compactTitle
              ? 'text-[clamp(1.575rem,6.48vw,3.158rem)] leading-[0.98] sm:text-[clamp(1.662rem,3.32vw,3.071rem)]'
              : 'text-[clamp(1.766rem,7.266vw,3.54rem)] leading-[0.98] sm:text-[clamp(1.863rem,3.726vw,3.443rem)]'
        }`}
        style={{ color: item.textColor }}
      >
        {item.titleLines
          ? item.titleLines.map((line) => <span key={line} className="block">{line}</span>)
          : title}
      </span>
      {item.subtitle && (
        <span
          className="category-art-card__subtitle block whitespace-nowrap font-host text-[clamp(0.71rem,2.82vw,1.17rem)] font-semibold leading-[1.16] [font-kerning:normal] sm:text-[clamp(0.8rem,1.48vw,1.17rem)]"
          style={{ color: item.textColor }}
        >
          {item.subtitle}
        </span>
      )}
    </span>
    {item.arrowBackground && item.arrowColor && (
      <span
        className="category-art-card__arrow pointer-events-none absolute grid aspect-square w-[5.92%] place-items-center rounded-full"
        style={{
          left: '7.16%',
          top: '68.03%',
          backgroundColor: item.arrowBackground,
          color: item.arrowColor,
        }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 32" className="h-[52%] w-[52%]" fill="none" aria-hidden="true">
          <path
            d="M5 14.5h15.1l-4.7-5.15 2.15-1.95L25.4 16l-7.85 8.6-2.15-1.95 4.7-5.15H5v-3Z"
            fill="currentColor"
          />
        </svg>
      </span>
    )}
    {item.count === 0 && (
      <span className="absolute right-3 top-3 rounded-full bg-[#fdf6ee] px-2.5 py-1 font-host text-[0.68rem] font-semibold leading-none text-black/62">
        Coming soon
      </span>
    )}
  </button>
  )
}

export const StorefrontCategoriesPage: FC<Props> = ({
  products,
  occasionNames,
  cartCount,
  storeProfile,
  onOpenCart,
  onOpenHome,
  onOpenSearch,
  onToggleMenu,
  menuOpen,
  onSelectOccasion,
  onSelectArrangement,
  onSelectCollection,
}) => {
  const [activeTab, setActiveTab] = useState<CategoryTab>('occasion')

  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  )

  const arrangementTypes = useMemo(
    () => [...new Set(activeProducts.map((product) => product.productType?.trim()).filter(Boolean) as string[])],
    [activeProducts],
  )

  const collections = useMemo(
    () => [...new Set(activeProducts.map((product) => product.collectionSeries?.trim()).filter(Boolean) as string[])],
    [activeProducts],
  )

  const configuredOccasions = useMemo(
    () => new Map(occasionNames.map((name) => [normaliseCategoryName(name), name])),
    [occasionNames],
  )

  const occasionItems = occasionCards.flatMap((card): ArtworkCardItem[] => {
    const routedName = configuredOccasions.get(normaliseCategoryName(card.name))
    const count = countProducts(activeProducts, (product) =>
      (product.occasionTags ?? []).some((tag) => normaliseCategoryName(tag) === normaliseCategoryName(card.name)),
    )
    if (!routedName && count === 0) return []
    const name = routedName ?? card.name
    return [{ ...card, name, count, onClick: () => onSelectOccasion(name) }]
  })

  const configuredArrangementTypes = useMemo(
    () => new Map(arrangementTypes.map((name) => [normaliseCategoryName(name), name])),
    [arrangementTypes],
  )

  const arrangementItems = arrangementCards.flatMap((card): ArtworkCardItem[] => {
    const routedName = configuredArrangementTypes.get(normaliseCategoryName(card.name))
    const count = countProducts(activeProducts, (product) =>
      normaliseCategoryName(product.productType ?? '') === normaliseCategoryName(card.name),
    )
    if (!routedName && count === 0) return []
    const name = routedName ?? card.name
    return [{ ...card, name, count, onClick: () => onSelectArrangement(name) }]
  })

  const configuredCollections = useMemo(
    () => new Map(collections.map((name) => [normaliseCategoryName(name), name])),
    [collections],
  )

  const collectionItems = collectionCards.flatMap((card): ArtworkCardItem[] => {
    const routedName = configuredCollections.get(normaliseCategoryName(card.name))
    if (!routedName) return []
    const count = countProducts(activeProducts, (product) =>
      normaliseCategoryName(product.collectionSeries ?? '') === normaliseCategoryName(card.name),
    )
    return [{ ...card, name: routedName, count, onClick: () => onSelectCollection(routedName) }]
  })

  const activeItems = activeTab === 'occasion'
    ? occasionItems
    : activeTab === 'arrangement'
      ? arrangementItems
      : collectionItems

  const activeCategoryLabel = activeTab === 'occasion'
    ? 'Occasion'
    : activeTab === 'arrangement'
      ? 'Arrangement Type'
      : 'Collection Series'

  return (
    <div className="storefront-categories-page min-h-screen bg-[var(--sf-cream)] text-black">
      <StorefrontHeader
        cartCount={cartCount}
        onOpenCart={onOpenCart}
        onOpenHome={onOpenHome}
        onOpenSearch={onOpenSearch}
        onToggleMenu={onToggleMenu}
        menuOpen={menuOpen}
      />

      <StorefrontContainer className="pb-0 pt-0">
        <main className="mx-auto max-w-[72rem]">
          <header className="hidden border-b border-black/10 pb-6 pt-9 lg:block">
            <div className="flex items-end justify-between gap-8">
              <div>
                <p className="sf-label text-[#00813f]">Browse flowers</p>
                <h1 className="mt-2 sf-page-title font-display leading-[0.94]">Categories</h1>
              </div>
              <p className="max-w-md sf-body leading-6 text-black/54">
                Browse the catalog by occasion, arrangement type, or collection series.
              </p>
            </div>
          </header>

          <div className="category-tabs-shell -mx-[18px] border-b border-black/10 bg-[var(--sf-cream)] px-[18px] py-4 sm:-mx-7 sm:px-7 sm:py-5 lg:mx-0 lg:px-0 lg:pt-5" role="tablist" aria-label="Category groups">
            <div className="grid grid-cols-3 gap-2">
              {tabs.map((tab) => {
                const selected = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tab.id)}
                    className={`category-tab min-h-[3.75rem] min-w-0 whitespace-nowrap px-3 font-host text-[0.94rem] font-semibold leading-none transition-colors sm:min-h-16 sm:px-5 sm:text-[1.08rem] ${
                      selected
                        ? 'category-tab--active bg-black text-[#fdf6ee]'
                        : 'bg-[#f0e6dd] text-black/72 hover:bg-[#e9ded3]'
                    }`}
                  >
                    <span className="sm:hidden">{tab.mobileLabel ?? tab.label}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-9 sm:mt-11">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-host text-base font-semibold leading-none text-black/58 sm:text-[1.05rem]">
                  Shop by
                </p>
                <h2 className="category-section-title mt-2 min-w-0 text-balance font-host text-[clamp(2.05rem,8vw,3.65rem)] font-semibold leading-[0.9] text-black">
                  {activeCategoryLabel}
                </h2>
              </div>
              <span className="shrink-0 pb-0.5 font-host text-[0.82rem] font-semibold tabular-nums text-black/48 sm:text-[0.9rem]">
                {activeItems.length} {activeItems.length === 1 ? 'category' : 'categories'}
              </span>
            </div>
            <div className="mt-5 border-b border-dashed border-black/20" aria-hidden="true" />
          </div>

          {activeItems.length > 0 ? (
            <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5" role="tabpanel">
              {activeItems.map((item) => <ArtworkCategoryCard key={item.name} item={item} />)}
            </section>
          ) : (
            <div className="mt-4 border border-black/10 bg-[#f0e6dd] px-5 py-12 text-center [clip-path:polygon(1%_2%,99%_0,98%_98%,0_96%)]">
              <p className="font-host sf-type-3 font-semibold">Nothing here yet</p>
              <p className="mt-2 sf-type-2 text-black/52">This group appears when products are assigned in Business OS.</p>
            </div>
          )}
        </main>

        <div className="mt-12 sm:mt-16">
          <StorefrontFooter storeProfile={storeProfile} />
        </div>
      </StorefrontContainer>
    </div>
  )
}

export default StorefrontCategoriesPage
