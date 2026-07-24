/**
 * @file defaultOwnerSettings.ts
 * @description Default values for the Owner Settings Center, seeded to
 * match the app's current hardcoded behavior so wiring this in causes no
 * visual/behavioral regression. Phase 1 scope: storeProfile + branches.
 */

import type { OwnerSettingsStateValue } from '../../types/settings'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../../config/permissions'
import { DEFAULT_COMPANY_WEEKLY_SCHEDULE } from '../hrSchedulingDomain'

const everyDay = (opensAt: string, closesAt: string) => ({
  monday:{isOpen:true,opensAt,closesAt}, tuesday:{isOpen:true,opensAt,closesAt},
  wednesday:{isOpen:true,opensAt,closesAt}, thursday:{isOpen:true,opensAt,closesAt},
  friday:{isOpen:true,opensAt,closesAt}, saturday:{isOpen:true,opensAt,closesAt},
  sunday:{isOpen:true,opensAt,closesAt},
})

export const DEFAULT_OWNER_SETTINGS: OwnerSettingsStateValue = {
  storeProfile: {
    storeName: 'Fleurstales Florist',
    phone: '+62 812-0000-0000',
    whatsapp: '+62 812-0000-0000',
    email: 'hello@fleurstales.com',
    address: 'Lampung, Indonesia',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    inventoryEnabled: false,
  },
  branches: [
    {
      id: 'Kedamaian',
      name: 'Kedamaian',
      code: 'KDM',
      address: '',
      phone: '',
      isActive: true,
      isDefault: true,
      deliveryFeeIdr: 15000,
      openingHours: everyDay('07:00','16:00'),
      location: { latitude: -5.3971, longitude: 105.2668 },
    },
    {
      id: 'Pahoman',
      name: 'Pahoman',
      code: 'PHM',
      address: '',
      phone: '',
      isActive: true,
      isDefault: false,
      deliveryFeeIdr: 15000,
      openingHours: everyDay('10:00','19:00'),
      location: { latitude: -5.4210, longitude: 105.2580 },
    },
  ],
  attendance: { locationRadiusMeters: 100, lateGraceMinutes: 10, checkoutGraceMinutes: 30 },
  scheduling: {
    defaultWeeklySchedule: structuredClone(DEFAULT_COMPANY_WEEKLY_SCHEDULE),
    minimumCoverage: { admin: 1, florist: 2 },
  },
  payroll: {
    frequency: 'monthly',
    periodStartDay: 21,
    periodEndDay: 20,
    hrSubmissionDay: 24,
    financeReviewDay: 27,
    paymentDay: 28,
    timezone: 'Asia/Jakarta',
    pointValueIdr: 1000,
    baseSalaryByRole: { admin: 4_500_000, finance: 5_000_000, hr: 4_500_000, florist: 4_000_000 },
  },
  paymentMethods: {
    bankAccounts: [
      {
        id: 'bank-bca',
        bankName: 'BCA',
        accountNumber: '1234 5678 90',
        accountHolder: 'Fleurstales Florist',
        type: 'bank_transfer',
        isActive: true,
        isDefault: true,
        displayOrder: 0,
        isCustomerVisible: true,
        branchIds: [],
      },
    ],
    paymentInstructions:
      'Please complete payment within 1 hour and keep your receipt. Our team will verify your payment and confirm the order shortly after.',
  },
  staffRoles: {
    roles: ['owner', 'admin', 'finance', 'hr', 'florist'],
    defaultRole: 'florist',
    hrManagedRoles: {
      employees: ['admin', 'florist'],
      attendance: ['admin', 'florist'],
      scheduling: ['admin', 'florist'],
      points: ['admin', 'florist'],
      payroll: ['admin', 'florist'],
    },
  },
  // Seeded from the existing static matrix so wiring this in causes no
  // behavior change — Owner can now edit a copy of it from Settings.
  permissions: DEFAULT_ROLE_SECTION_ACCESS,
}
