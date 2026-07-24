import { DEFAULT_BRANCH_OPENING_HOURS, WEEKDAY_KEYS } from '../../domain/branchOpeningHoursDomain'
import { normalizeBankAccounts } from '../../domain/settings/paymentMethodSettingsDomain'
import type {
  BankAccountDetail,
  BranchOpeningHours,
  BranchSettings,
  OwnerSettingsStateValue,
  PaymentMethodSettings,
  StoreProfileSettings,
} from '../../types/settings'
import { validateSharedStoreSnapshot as validateSharedStoreContract } from './sharedStoreContract'
import type {
  BranchDayHours,
  SharedBranch,
  SharedPaymentAccount,
  SharedStoreProfile,
  SharedStoreSnapshot,
} from './contracts'

export type PublicOwnerSettingsSlice = Pick<OwnerSettingsStateValue, 'storeProfile' | 'branches' | 'paymentMethods'>

const clean = (value: string | undefined): string => value?.trim() ?? ''
const optionalClean = (value: string | undefined): string | undefined => {
  const normalized = clean(value)
  return normalized || undefined
}

const normalizeTime = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback

export const normalizeSharedOpeningHours = (
  openingHours: SharedBranch['openingHours'] | BranchOpeningHours | undefined,
): BranchOpeningHours => {
  const result = {} as BranchOpeningHours
  for (const day of WEEKDAY_KEYS) {
    const fallback = DEFAULT_BRANCH_OPENING_HOURS[day]
    const source = openingHours?.[day] as BranchDayHours | undefined
    result[day] = {
      isOpen: source?.isOpen ?? fallback.isOpen,
      opensAt: normalizeTime(source?.opensAt, fallback.opensAt),
      closesAt: normalizeTime(source?.closesAt, fallback.closesAt),
    }
  }
  return result
}

const toSharedOpeningHours = (openingHours: BranchOpeningHours | undefined): SharedBranch['openingHours'] => {
  const normalized = normalizeSharedOpeningHours(openingHours)
  return Object.fromEntries(
    WEEKDAY_KEYS.map((day) => [day, { ...normalized[day] }]),
  )
}

export const mapStoreProfileToShared = (profile: StoreProfileSettings): SharedStoreProfile => ({
  id: 'primary',
  storeName: clean(profile.storeName),
  legalName: optionalClean(profile.legalName),
  logoUrl: optionalClean(profile.logoUrl),
  phone: clean(profile.phone),
  whatsapp: clean(profile.whatsapp),
  email: clean(profile.email),
  address: clean(profile.address),
  currency: 'IDR',
  timezone: 'Asia/Jakarta',
})

export const mapBranchToShared = (branch: BranchSettings, sortOrder: number): SharedBranch => ({
  id: branch.id,
  name: clean(branch.name),
  code: clean(branch.code).toUpperCase(),
  address: clean(branch.address),
  phone: clean(branch.phone),
  isActive: branch.isActive,
  isDefault: branch.isDefault === true,
  sortOrder,
  deliveryFeeIdr: Math.max(0, Math.round(branch.deliveryFeeIdr ?? 0)),
  openingHours: toSharedOpeningHours(branch.openingHours),
  ...(branch.location && Number.isFinite(branch.location.latitude) ? { latitude: branch.location.latitude } : {}),
  ...(branch.location && Number.isFinite(branch.location.longitude) ? { longitude: branch.location.longitude } : {}),
})

export const mapPaymentAccountToShared = (account: BankAccountDetail): SharedPaymentAccount => ({
  id: account.id,
  bankName: clean(account.bankName),
  accountNumber: clean(account.accountNumber),
  accountHolder: clean(account.accountHolder),
  type: account.type,
  isActive: account.isActive,
  isDefault: account.isDefault,
  displayOrder: Math.max(0, Math.round(account.displayOrder)),
  isCustomerVisible: account.isCustomerVisible,
  branchIds: [...new Set(account.branchIds.filter(Boolean))],
})

export const buildSharedStoreSnapshot = (settings: PublicOwnerSettingsSlice): SharedStoreSnapshot => {
  const paymentMethods = normalizeBankAccounts(settings.paymentMethods)
  return {
    profile: mapStoreProfileToShared(settings.storeProfile),
    branches: settings.branches.map(mapBranchToShared),
    paymentAccounts: paymentMethods.bankAccounts.map(mapPaymentAccountToShared),
    paymentInstructions: clean(paymentMethods.paymentInstructions),
  }
}

const mergeStoreProfile = (
  current: StoreProfileSettings,
  shared: SharedStoreProfile,
): StoreProfileSettings => ({
  ...current,
  storeName: shared.storeName,
  legalName: shared.legalName,
  logoUrl: shared.logoUrl,
  phone: shared.phone,
  whatsapp: shared.whatsapp,
  email: shared.email,
  address: shared.address,
  currency: 'IDR',
  timezone: 'Asia/Jakarta',
})

const mergeBranch = (current: BranchSettings | undefined, shared: SharedBranch): BranchSettings => ({
  ...(current ?? {
    id: shared.id,
    managerEmployeeId: undefined,
    dailyOrderLimit: undefined,
  }),
  id: shared.id,
  name: shared.name,
  code: shared.code,
  address: shared.address,
  phone: shared.phone,
  isActive: shared.isActive,
  isDefault: shared.isDefault,
  deliveryFeeIdr: shared.deliveryFeeIdr,
  openingHours: normalizeSharedOpeningHours(shared.openingHours),
  ...(shared.latitude !== undefined && shared.longitude !== undefined
    ? { location: { latitude: shared.latitude, longitude: shared.longitude } }
    : { location: current?.location }),
})

const mapSharedAccount = (account: SharedPaymentAccount): BankAccountDetail => ({
  id: account.id,
  bankName: account.bankName,
  accountNumber: account.accountNumber,
  accountHolder: account.accountHolder,
  type: account.type,
  isActive: account.isActive,
  isDefault: account.isDefault,
  displayOrder: account.displayOrder,
  isCustomerVisible: account.isCustomerVisible,
  branchIds: [...account.branchIds],
})

export const mergeSharedStoreSnapshot = (
  current: PublicOwnerSettingsSlice,
  snapshot: SharedStoreSnapshot,
): PublicOwnerSettingsSlice => {
  const existingById = new Map(current.branches.map((branch) => [branch.id, branch]))
  const branches = [...snapshot.branches]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((branch) => mergeBranch(existingById.get(branch.id), branch))

  const paymentMethods: PaymentMethodSettings = normalizeBankAccounts({
    bankAccounts: snapshot.paymentAccounts.map(mapSharedAccount),
    paymentInstructions: snapshot.paymentInstructions,
  })

  return {
    storeProfile: mergeStoreProfile(current.storeProfile, snapshot.profile),
    branches,
    paymentMethods,
  }
}

export const validateSharedStoreSnapshot = (snapshot: SharedStoreSnapshot): string[] =>
  validateSharedStoreContract(snapshot)
