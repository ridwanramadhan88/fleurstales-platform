import type { FC } from 'react'
import logoIcon from '../../assets/storefront-shop/Logo_Icon.svg'
import logoType from '../../assets/storefront-shop/Logo_Type.svg'

interface Props {
  className?: string
  variant?: 'header' | 'home' | 'footer'
  showIcon?: boolean
  showType?: boolean
}

export const StorefrontBrand: FC<Props> = ({
  className = '',
  variant = 'header',
  showIcon = true,
  showType = true,
}) => (
  <span className={`storefront-brand storefront-brand--${variant} ${className}`.trim()} aria-hidden="true">
    {showIcon && <img src={logoIcon} alt="" className="storefront-brand__icon" />}
    {showType && <img src={logoType} alt="" className="storefront-brand__type" />}
  </span>
)
