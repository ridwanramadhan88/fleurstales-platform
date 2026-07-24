import type { FC, HTMLAttributes } from 'react'

export const STOREFRONT_CONTAINER_CLASS =
  'mx-auto w-full max-w-[1320px] px-[18px] sm:px-7 lg:px-10 xl:px-12 2xl:px-14'

export const StorefrontContainer: FC<HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...props
}) => (
  <div
    {...props}
    className={`${STOREFRONT_CONTAINER_CLASS} ${className}`.trim()}
  />
)
