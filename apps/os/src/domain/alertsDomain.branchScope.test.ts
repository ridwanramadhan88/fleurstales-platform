import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { getSystemAlerts } from './alertsDomain'

describe('Admin alert read scope', () => {
  it('keeps order alerts company-wide even when the UI branch filter is specific', () => {
    const alerts = getSystemAlerts({
      role: 'admin',
      branch: 'Kedamaian',
      stockItems: [],
      orders: [
        makeOrder({ orderNumber: 'KDM-REJECTED', branch: 'Kedamaian', financeVerificationStatus: 'rejected' }),
        makeOrder({ orderNumber: 'PHM-REJECTED', branch: 'Pahoman', financeVerificationStatus: 'rejected' }),
      ],
    })

    expect(alerts.map((item) => item.orderNumber)).toEqual(['KDM-REJECTED', 'PHM-REJECTED'])
  })
})
