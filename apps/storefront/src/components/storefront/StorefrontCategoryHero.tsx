import type { CSSProperties, FC } from 'react'
import generalGiftingCard from '../../assets/storefront-occasions/general-gifting.svg'
import birthdayCard from '../../assets/storefront-occasions/birthday.svg'
import weddingCard from '../../assets/storefront-occasions/wedding.svg'
import graduationCard from '../../assets/storefront-occasions/graduation.svg'
import congratulationsCard from '../../assets/storefront-occasions/congratulations.svg'
import condolenceCard from '../../assets/storefront-occasions/condolence.svg'
import anniversaryCard from '../../assets/storefront-occasions/anniversary.svg'
import bouquetCard from '../../assets/storefront-arrangements/bouquet.svg'
import boxBasketVaseCard from '../../assets/storefront-arrangements/box-basket-vase.svg'
import standingFlowerCard from '../../assets/storefront-arrangements/standing-flower.svg'
import flowerCakeCard from '../../assets/storefront-arrangements/flower-cake.svg'
import classicRoseCard from '../../assets/storefront-collections/classic-rose.svg'
import medLilyCard from '../../assets/storefront-collections/med-lily-series.svg'
import thumbelinaCard from '../../assets/storefront-collections/thumbelina.svg'
import omakaseCard from '../../assets/storefront-collections/omakase.svg'

const normalise = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')

type HeroCategory = {
  artwork: string
  background: string
  title: string
  subtitle: string
  foreground?: string
}

const artworkByCategory = new Map<string, HeroCategory>([
  ['all categories', { artwork: generalGiftingCard, background: '#057640', title: 'General Gifts', subtitle: 'Bouquet, Vase, & more' }],
  ['flowers', { artwork: generalGiftingCard, background: '#057640', title: 'General Gifts', subtitle: 'Bouquet, Vase, & more' }],
  ['general gifting', { artwork: generalGiftingCard, background: '#057640', title: 'General Gifts', subtitle: 'Bouquet, Vase, & more' }],
  ['general gifts', { artwork: generalGiftingCard, background: '#057640', title: 'General Gifts', subtitle: 'Bouquet, Vase, & more' }],
  ['birthday', { artwork: birthdayCard, background: '#4972d1', title: 'Birthday', subtitle: 'Cake, Bouquet, & more' }],
  ['wedding', { artwork: weddingCard, background: '#f684b1', title: 'Wedding', subtitle: 'Bridal Bouquet, Omakase' }],
  ['graduation', { artwork: graduationCard, background: '#a2cfeb', foreground: '#175d46', title: 'Graduation', subtitle: 'Bouquet, Grad Gift, & more' }],
  ['congratulations', { artwork: congratulationsCard, background: '#fa771c', title: 'Congratulations', subtitle: 'Standing Flowers, & more' }],
  ['congratulation', { artwork: congratulationsCard, background: '#fa771c', title: 'Congratulations', subtitle: 'Standing Flowers, & more' }],
  ['condolence', { artwork: condolenceCard, background: '#e4ccf0', foreground: '#0d452d', title: 'Condolence', subtitle: 'Standing Flowers, & more' }],
  ['anniversary', { artwork: anniversaryCard, background: '#fcbe0c', foreground: '#0d452d', title: 'Anniversary', subtitle: 'Roses, Bouquet, & more' }],
  ['bouquet', { artwork: bouquetCard, background: '#057640', title: 'Bouquet', subtitle: 'Fresh & artificial bouquets' }],
  ['box basket vase', { artwork: boxBasketVaseCard, background: '#f684b1', title: 'Box, Basket & Vase', subtitle: 'Flowers in styled containers' }],
  ['standing flower', { artwork: standingFlowerCard, background: '#fcbe0c', foreground: '#0d452d', title: 'Standing Flower', subtitle: 'Celebration & condolence' }],
  ['flower cake', { artwork: flowerCakeCard, background: '#4972d1', title: 'Flower Cake', subtitle: 'Floral cakes for every moment' }],
  ['classic rose', { artwork: classicRoseCard, background: '#a84361', title: 'Classic Rose', subtitle: 'Timeless rose arrangements' }],
  ['med lily series', { artwork: medLilyCard, background: '#c9ddb1', foreground: '#0d452d', title: 'Med Lily Series', subtitle: 'Signature lily arrangements' }],
  ['thumbelina', { artwork: thumbelinaCard, background: '#f6bf46', foreground: '#0d452d', title: 'Thumbelina', subtitle: 'Playful petite arrangements' }],
  ['omakase', { artwork: omakaseCard, background: '#5546a8', title: 'Omakase', subtitle: 'Florist-designed arrangements' }],
])

interface Props {
  categoryLabel: string
}

export const StorefrontCategoryHero: FC<Props> = ({ categoryLabel }) => {
  const category = artworkByCategory.get(normalise(categoryLabel)) ?? {
    artwork: generalGiftingCard,
    background: '#057640',
    title: categoryLabel || 'General Gifts',
    subtitle: 'Bouquet, Vase, & more',
  }

  return (
    <section
      className="storefront-category-hero"
      aria-label={`${category.title} category`}
      style={{
        backgroundColor: category.background,
        color: category.foreground ?? '#fbf9ef',
        '--storefront-category-background': category.background,
      } as CSSProperties}
    >
      <img src={category.artwork} alt="" aria-hidden="true" />
      <div className="storefront-category-hero__text">
        <h1>{category.title}</h1>
        <p>{category.subtitle}</p>
      </div>
    </section>
  )
}
