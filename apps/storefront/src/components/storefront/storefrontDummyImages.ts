import bouquet01 from '../../assets/storefront-products/dummy-bouquet-01.jpg'
import bouquet02 from '../../assets/storefront-products/dummy-bouquet-02.jpg'
import bouquet03 from '../../assets/storefront-products/dummy-bouquet-03.jpg'
import bouquet04 from '../../assets/storefront-products/dummy-bouquet-04.jpg'
import bouquet05 from '../../assets/storefront-products/dummy-bouquet-05.jpg'
import bouquet06 from '../../assets/storefront-products/dummy-bouquet-06.jpg'
import bouquet07 from '../../assets/storefront-products/dummy-bouquet-07.jpg'
import bouquet08 from '../../assets/storefront-products/dummy-bouquet-08.jpg'
import thumbelina01 from '../../assets/storefront-products/thumbelina-01.jpg'
import thumbelina02 from '../../assets/storefront-products/thumbelina-02.jpg'
import boxBasketVase01 from '../../assets/storefront-products/box-basket-vase-01.jpg'
import boxBasketVase02 from '../../assets/storefront-products/box-basket-vase-02.jpg'
import boxBasketVase03 from '../../assets/storefront-products/box-basket-vase-03.jpg'
import boxBasketVase04 from '../../assets/storefront-products/box-basket-vase-04.jpg'
import flowerCake01 from '../../assets/storefront-products/flower-cake-01.jpg'
import flowerCake02 from '../../assets/storefront-products/flower-cake-02.jpg'
import flowerCake03 from '../../assets/storefront-products/flower-cake-03.jpg'
import weddingBridal01 from '../../assets/storefront-products/wedding-bridal-01.jpg'
import weddingBridal02 from '../../assets/storefront-products/wedding-bridal-02.jpg'
import graduation01 from '../../assets/storefront-products/graduation-01.jpg'
import graduation02 from '../../assets/storefront-products/graduation-02.jpg'

const DUMMY_PRODUCT_IMAGES = [
  bouquet01,
  bouquet02,
  bouquet03,
  bouquet04,
  bouquet05,
  bouquet06,
  bouquet07,
  bouquet08,
] as const

const THUMBELINA_PRODUCT_IMAGES = [thumbelina01, thumbelina02] as const

const FLOWER_CAKE_PRODUCT_IMAGES = [flowerCake01, flowerCake02, flowerCake03] as const

const WEDDING_BRIDAL_PRODUCT_IMAGES = [weddingBridal01, weddingBridal02] as const

const GRADUATION_PRODUCT_IMAGES = [graduation01, graduation02] as const

const BOX_BASKET_VASE_PRODUCT_IMAGES = [
  boxBasketVase01,
  boxBasketVase02,
  boxBasketVase03,
  boxBasketVase04,
] as const



const GRADUATION_PRODUCT_IDS = new Set([
  'catalog_teddy_orchid_grad_154',
  'catalog_thumbelina_sunny_thumbelina_155',
  'catalog_single_sun_156',
  'catalog_thumbelina_sm_thumbelina_157',
  'catalog_hydra_sun_grad_158',
  'catalog_rainbow_jute_159',
  'catalog_graduation_cluster_160',
  'catalog_thumbelina_medium_thumbelina_grad_161',
  'catalog_mini_jute_teddy_162',
])

const WEDDING_BRIDAL_PRODUCT_IDS = new Set([
  'catalog_mix_phalaenopsis_bridal_bouquet_163',
  'catalog_local_phalaenopsis_bridal_bouquet_164',
  'catalog_imported_bridal_bouquet_165',
  'catalog_preserved_cascading_bouquet_166',
  'catalog_mixed_lily_bouquet_167',
  'catalog_standard_roses_bouquet_168',
  'catalog_posy_bouquet_169',
  'catalog_omakase_omakase_small_170',
  'catalog_omakase_omakase_medium_171',
  'catalog_omakase_omakase_large_172',
])

const FLOWER_CAKE_PRODUCT_IDS = new Set([
  'catalog_thumbelina_dome_cake_d15cm_129',
  'catalog_thumbelina_dome_cake_d20cm_132',
])

const BOX_BASKET_VASE_PRODUCT_IDS = new Set([
  'catalog_white_lily_100',
  'catalog_classic_jute_101',
  'catalog_homey_vase_102',
  'catalog_orchid_galaxy_103',
  'catalog_ume_104',
  'catalog_pinky_pastel_105',
  'catalog_daisy_gradation_106',
  'catalog_misty_magic_107',
  'catalog_elegant_orchid_108',
  'catalog_emerald_elegant_109',
  'catalog_maroon_five_110',
  'catalog_fuschia_lily_111',
  'catalog_mini_basket_112',
  'catalog_mini_box_113',
  'catalog_cherrie_amour_114',
  'catalog_hollo_blue_115',
  'catalog_silvery_white_116',
  'catalog_confetti_box_117',
  'catalog_heaven_scent_118',
  'catalog_bold_maroon_119',
  'catalog_winter_orchid_120',
  'catalog_anmber_awe_121',
])

const isGraduationProduct = (productKey: string): boolean =>
  GRADUATION_PRODUCT_IDS.has(productKey)

const isWeddingBridalProduct = (productKey: string): boolean =>
  WEDDING_BRIDAL_PRODUCT_IDS.has(productKey)

const isFlowerCakeProduct = (productKey: string): boolean =>
  FLOWER_CAKE_PRODUCT_IDS.has(productKey)

const isThumbelinaProduct = (productKey: string): boolean =>
  productKey.toLowerCase().includes('thumbelina')

const isBoxBasketVaseProduct = (productKey: string): boolean =>
  BOX_BASKET_VASE_PRODUCT_IDS.has(productKey)

const getProductImagePool = (productKey: string) => {
  if (isGraduationProduct(productKey)) return GRADUATION_PRODUCT_IMAGES
  if (isWeddingBridalProduct(productKey)) return WEDDING_BRIDAL_PRODUCT_IMAGES
  if (isFlowerCakeProduct(productKey)) return FLOWER_CAKE_PRODUCT_IMAGES
  if (isThumbelinaProduct(productKey)) return THUMBELINA_PRODUCT_IMAGES
  if (isBoxBasketVaseProduct(productKey)) return BOX_BASKET_VASE_PRODUCT_IMAGES
  return DUMMY_PRODUCT_IMAGES
}

const hashProductKey = (value: string): number => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

export const getStorefrontDummyThumbnail = (productKey: string): string => {
  const images = getProductImagePool(productKey)
  return images[hashProductKey(productKey) % images.length]
}

export const getStorefrontDummyGallery = (productKey: string): string[] => {
  const images = getProductImagePool(productKey)
  const startIndex = hashProductKey(productKey) % images.length
  return images.map((_, offset) => images[(startIndex + offset) % images.length])
}
