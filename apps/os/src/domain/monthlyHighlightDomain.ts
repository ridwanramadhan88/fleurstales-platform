/** "Flower of the Month": one hand-picked product per calendar month. */

export const MONTHLY_HIGHLIGHT_LIMIT = 1
export const MONTHLY_HIGHLIGHT_NOTE_LIMIT = 160

export interface MonthlyHighlight {
  /** YYYY-MM */
  month: string
  note: string | null
  productIds: string[]
}

const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const formatHighlightMonth = (month: string, language: 'en' | 'id'): string => {
  const [year, monthNumber] = month.split('-').map(Number)
  const names = language === 'id' ? MONTH_NAMES_ID : MONTH_NAMES_EN
  return names[monthNumber - 1] ? `${names[monthNumber - 1]} ${year}` : month
}

/** Picking a product replaces the current one; picking it again clears it. */
export const toggleHighlightProduct = (productIds: string[], productId: string): string[] =>
  productIds.includes(productId) ? [] : [productId]

/** Keep the chosen order and drop ids that are not in the given catalog. */
export const pickHighlightedProducts = <T extends { id: string }>(products: T[], productIds: string[]): T[] => {
  const byId = new Map(products.map((product) => [product.id, product]))
  return productIds.map((id) => byId.get(id)).filter((product): product is T => Boolean(product))
}
