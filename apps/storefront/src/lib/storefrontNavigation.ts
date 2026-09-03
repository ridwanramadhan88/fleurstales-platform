export const STOREFRONT_NAVIGATION_EVENT = 'fleurstales:storefront-navigation'

export interface StorefrontNavigationDetail {
  path: string
  replace?: boolean
}

export const requestStorefrontNavigation = (detail: StorefrontNavigationDetail): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<StorefrontNavigationDetail>(STOREFRONT_NAVIGATION_EVENT, { detail }))
}
