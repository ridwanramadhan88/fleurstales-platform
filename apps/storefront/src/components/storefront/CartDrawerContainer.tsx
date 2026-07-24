import type { FC } from 'react'
import { CartDrawer, type CartDrawerProps } from './CartDrawer'
import { useCartDrawerController } from './CartDrawerController'

export const CartDrawerContainer: FC<CartDrawerProps> = (props) => {
  const viewModel = useCartDrawerController(props)

  return <CartDrawer {...viewModel} />
}
