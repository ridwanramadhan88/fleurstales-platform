/** "Flower of the Month": a short, ordered, hand-picked list per calendar month. */

export const MONTHLY_HIGHLIGHT_LIMIT = 6
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

/** Add at the end, or remove; never exceeds the limit. */
export const toggleHighlightProduct = (productIds: string[], productId: string): string[] => {
  if (productIds.includes(productId)) return productIds.filter((id) => id !== productId)
  if (productIds.length >= MONTHLY_HIGHLIGHT_LIMIT) return productIds
  return [...productIds, productId]
}

export const moveHighlightProduct = (productIds: string[], productId: string, direction: -1 | 1): string[] => {
  const index = productIds.indexOf(productId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= productIds.length) return productIds
  const next = [...productIds]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** Keep the chosen order and drop ids that are not in the given catalog. */
export const pickHighlightedProducts = <T extends { id: string }>(products: T[], productIds: string[]): T[] => {
  const byId = new Map(products.map((product) => [product.id, product]))
  return productIds.map((id) => byId.get(id)).filter((product): product is T => Boolean(product))
}
