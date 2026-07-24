import type { BankAccountDetail, BranchSettings, PaymentMethodSettings } from '../../types/settings'

export const normalizeBankAccounts = (
  settings: PaymentMethodSettings,
): PaymentMethodSettings => {
  const normalized = settings.bankAccounts.map((account, index) => ({
    ...account,
    type: account.type ?? 'bank_transfer',
    isActive: account.isActive ?? true,
    isDefault: account.isDefault ?? index === 0,
    displayOrder: Number.isFinite(account.displayOrder) ? Number(account.displayOrder) : index,
    isCustomerVisible: account.isCustomerVisible ?? true,
    branchIds: Array.isArray(account.branchIds) ? [...account.branchIds] : [],
  }))
  const active = normalized.filter((account) => account.isActive)
  const defaultId = active.find((account) => account.isDefault)?.id ?? active[0]?.id
  return {
    ...settings,
    bankAccounts: normalized
      .map((account) => ({ ...account, isDefault: account.id === defaultId }))
      .sort((a, b) => a.displayOrder - b.displayOrder),
  }
}

export const getCustomerVisiblePaymentAccounts = (
  settings: PaymentMethodSettings,
  branchId?: string,
): BankAccountDetail[] =>
  normalizeBankAccounts(settings).bankAccounts.filter((account) =>
    account.isActive
    && account.isCustomerVisible
    && (account.branchIds.length === 0 || Boolean(branchId && account.branchIds.includes(branchId))),
  )

export const accountAppliesToBranch = (
  account: BankAccountDetail,
  branch: BranchSettings,
): boolean => account.branchIds.length === 0 || account.branchIds.includes(branch.id)
