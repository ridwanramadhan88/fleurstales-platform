/**
 * @file useFinanceAccounts.ts
 * @description Finance accounts (active bank accounts + Cash) and their
 * display labels, in one place. Every Finance screen that lists accounts or
 * shows "BCA · 123…" next to a ledger row reads from here.
 */

import { useMemo } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

export const CASH_ACCOUNT_ID = 'cash:main'
export const LEGACY_ACCOUNT_ID = 'legacy:unassigned'

export interface FinanceAccountOption {
  id: string
  label: string
}

export interface FinanceAccounts {
  /** Active bank/e-wallet accounts, default first. */
  bankAccounts: FinanceAccountOption[]
  /** Bank accounts followed by Cash — the accounts money can move through. */
  options: FinanceAccountOption[]
  /** Label for any account id, including inactive and legacy ones. */
  labelOf: (accountId: string | undefined) => string
}

export const useFinanceAccounts = (): FinanceAccounts => {
  const tr = useBilingualCopy()
  const configured = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const cashLabel = tr('Cash', 'Kas tunai')
  const legacyLabel = tr('Unassigned (old)', 'Belum ada rekening (lama)')

  return useMemo(() => {
    const bankAccounts = configured
      .filter((account) => account.isActive !== false)
      .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((account) => ({ id: account.id, label: `${account.bankName} · ${account.accountNumber}` }))
    const labels = new Map<string, string>([
      ...configured.map((account) => [account.id, `${account.bankName} · ${account.accountNumber}`] as [string, string]),
      [CASH_ACCOUNT_ID, cashLabel],
      [LEGACY_ACCOUNT_ID, legacyLabel],
    ])
    return {
      bankAccounts,
      options: [...bankAccounts, { id: CASH_ACCOUNT_ID, label: cashLabel }],
      labelOf: (accountId) => labels.get(accountId ?? LEGACY_ACCOUNT_ID) ?? accountId ?? legacyLabel,
    }
  }, [cashLabel, configured, legacyLabel])
}
