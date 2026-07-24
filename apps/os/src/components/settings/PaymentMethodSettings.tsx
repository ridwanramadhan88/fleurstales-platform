import type { FC } from 'react'
import { CreditCard, Plus, Trash2 } from 'lucide-react'
import type { BankAccountDetail, BranchSettings, PaymentMethodSettings as PaymentMethodSettingsValue } from '../../types/settings'
import type { SettingsValidationErrors } from '../../domain/settings/settingsValidation'
import { SettingsSectionHeader } from './SettingsPrimitives'
import { Switch } from '../ui/switch'

interface Props {
  isEditing: boolean
  settings: PaymentMethodSettingsValue
  branches: BranchSettings[]
  validationErrors: SettingsValidationErrors
  onUpdateBankAccount: (id: string, patch: Partial<Omit<BankAccountDetail, 'id'>>) => void
  onAddBankAccount: () => void
  onRemoveBankAccount: (id: string) => void
  onPaymentInstructionsChange: (value: string) => void
}

const FIELD_CLASS = 'h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'
const ERROR_CLASS = 'text-2xs font-medium text-destructive'
const LABEL_CLASS = 'text-2xs font-semibold uppercase tracking-wide text-muted-foreground'

const accountTypeLabel = (type: BankAccountDetail['type']) => type === 'ewallet' ? 'E-wallet' : 'Bank transfer'

export const PaymentMethodSettings: FC<Props> = ({
  isEditing,
  settings,
  branches,
  validationErrors,
  onUpdateBankAccount,
  onAddBankAccount,
  onRemoveBankAccount,
  onPaymentInstructionsChange,
}) => (
  <section className="space-y-5">
    <SettingsSectionHeader icon={CreditCard} title="Payment accounts" description="Payment accounts, branch availability, customer visibility, and checkout instructions." />

    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Payment accounts</p>
          <p className="text-xs text-muted-foreground">No branch selection means the account applies to every active branch.</p>
        </div>
        {isEditing && <button type="button" onClick={onAddBankAccount} className="inline-flex items-center bg-primary text-sm font-semibold text-primary-foreground shadow-sm rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"><Plus className="size-3.5" /> Add account</button>}
      </div>

      {settings.bankAccounts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">No payment account configured.</div>
      )}

      {settings.bankAccounts.map((account, index) => {
        const branchNames = account.branchIds
          .map((id) => branches.find((branch) => branch.id === id)?.name)
          .filter((name): name is string => Boolean(name))
        return (
          <article key={account.id} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold leading-5">{account.bankName || `Payment account ${index + 1}`}</span>
                {account.isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">Default</span>}
                <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${account.isActive ? 'bg-success/10 text-success' : 'bg-surface-neutral text-foreground ring-1 ring-border/80'}`}>{account.isActive ? 'Active' : 'Inactive'}</span>
                {!account.isCustomerVisible && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-2xs font-semibold text-warning">Internal only</span>}
              </div>
              {isEditing && <button type="button" onClick={() => onRemoveBankAccount(account.id)} aria-label="Remove payment account" className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>}
            </div>

            {!isEditing ? (
              <div className="divide-y divide-border/60 sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 lg:grid-cols-4">
                <Info label="Type" value={accountTypeLabel(account.type)} />
                <Info label={account.type === 'ewallet' ? 'Provider' : 'Bank name'} value={account.bankName} />
                <Info label="Account number" value={account.accountNumber} />
                <Info label="Account holder" value={account.accountHolder} />
                <Info label="Display order" value={String(account.displayOrder)} />
                <Info label="Branch availability" value={branchNames.length ? branchNames.join(', ') : 'All active branches'} className="sm:col-span-2 lg:col-span-3" />
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1"><span className={LABEL_CLASS}>Type</span><select value={account.type} onChange={(event) => onUpdateBankAccount(account.id, { type: event.target.value as BankAccountDetail['type'] })} className={`${FIELD_CLASS} w-full`}><option value="bank_transfer">Bank transfer</option><option value="ewallet">E-wallet</option></select></label>
                  <label className="space-y-1"><span className={LABEL_CLASS}>{account.type === 'ewallet' ? 'Provider' : 'Bank name'}</span><input value={account.bankName} onChange={(event) => onUpdateBankAccount(account.id, { bankName: event.target.value })} className={`${FIELD_CLASS} w-full`} placeholder={account.type === 'ewallet' ? 'GoPay' : 'BCA'} />{validationErrors[`paymentMethods.bankAccounts.${index}.bankName`] && <p className={ERROR_CLASS}>{validationErrors[`paymentMethods.bankAccounts.${index}.bankName`]}</p>}</label>
                  <label className="space-y-1"><span className={LABEL_CLASS}>Account number</span><input value={account.accountNumber} onChange={(event) => onUpdateBankAccount(account.id, { accountNumber: event.target.value })} className={`${FIELD_CLASS} w-full`} />{validationErrors[`paymentMethods.bankAccounts.${index}.accountNumber`] && <p className={ERROR_CLASS}>{validationErrors[`paymentMethods.bankAccounts.${index}.accountNumber`]}</p>}</label>
                  <label className="space-y-1"><span className={LABEL_CLASS}>Account holder</span><input value={account.accountHolder} onChange={(event) => onUpdateBankAccount(account.id, { accountHolder: event.target.value })} className={`${FIELD_CLASS} w-full`} />{validationErrors[`paymentMethods.bankAccounts.${index}.accountHolder`] && <p className={ERROR_CLASS}>{validationErrors[`paymentMethods.bankAccounts.${index}.accountHolder`]}</p>}</label>
                </div>

                <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                  <label className="space-y-1"><span className={LABEL_CLASS}>Display order</span><input type="number" min={0} value={account.displayOrder} onChange={(event) => onUpdateBankAccount(account.id, { displayOrder: Number(event.target.value) })} className={`${FIELD_CLASS} w-full`} />{validationErrors[`paymentMethods.bankAccounts.${index}.displayOrder`] && <p className={ERROR_CLASS}>{validationErrors[`paymentMethods.bankAccounts.${index}.displayOrder`]}</p>}</label>
                  <div className="space-y-1">
                    <span className={LABEL_CLASS}>Branch availability</span>
                    <div className="flex flex-wrap gap-2 rounded-lg bg-background p-2.5 ring-1 ring-border/70">
                      {branches.filter((branch) => branch.isActive).map((branch) => {
                        const selected = account.branchIds.includes(branch.id)
                        return <button key={branch.id} type="button" aria-pressed={selected} onClick={() => onUpdateBankAccount(account.id, { branchIds: selected ? account.branchIds.filter((id) => id !== branch.id) : [...account.branchIds, branch.id] })} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${selected ? 'bg-surface-selected text-primary-foreground ring-primary/30' : 'bg-surface-panel text-muted-foreground ring-border'}`}>{branch.name}</button>
                      })}
                      <span className="self-center text-xs text-muted-foreground">{account.branchIds.length === 0 ? 'All branches' : `${account.branchIds.length} selected`}</span>
                    </div>
                    {validationErrors[`paymentMethods.bankAccounts.${index}.branchIds`] && <p className={ERROR_CLASS}>{validationErrors[`paymentMethods.bankAccounts.${index}.branchIds`]}</p>}
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg bg-background p-3 ring-1 ring-border/70 sm:grid-cols-3">
                  <ToggleRow label="Active" checked={account.isActive} onChange={(checked) => onUpdateBankAccount(account.id, { isActive: checked, isDefault: checked ? account.isDefault : false })} />
                  <ToggleRow label="Show at checkout" checked={account.isCustomerVisible} onChange={(checked) => onUpdateBankAccount(account.id, { isCustomerVisible: checked })} />
                  <ToggleRow label="Default account" checked={account.isDefault} disabled={!account.isActive} onChange={(checked) => { if (checked) onUpdateBankAccount(account.id, { isDefault: true }) }} />
                </div>
                {validationErrors[`paymentMethods.bankAccounts.${index}.isDefault`] && <p className={ERROR_CLASS}>{validationErrors[`paymentMethods.bankAccounts.${index}.isDefault`]}</p>}
              </>
            )}
          </article>
        )
      })}

      {validationErrors['paymentMethods.bankAccounts'] && <p className={ERROR_CLASS}>{validationErrors['paymentMethods.bankAccounts']}</p>}
      {validationErrors['paymentMethods.bankAccounts.active'] && <p className={ERROR_CLASS}>{validationErrors['paymentMethods.bankAccounts.active']}</p>}
      {validationErrors['paymentMethods.bankAccounts.default'] && <p className={ERROR_CLASS}>{validationErrors['paymentMethods.bankAccounts.default']}</p>}
    </div>

    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3"><h3 className="text-base font-semibold leading-6 text-foreground">Customer payment instructions</h3><p className="mt-1 text-sm text-muted-foreground">Shown to customers during checkout and payment confirmation.</p></div>
      {isEditing ? (
        <textarea value={settings.paymentInstructions} onChange={(event) => onPaymentInstructionsChange(event.target.value)} className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40" />
      ) : (
        <p className="whitespace-pre-wrap rounded-xl bg-surface-panel px-4 py-3 text-sm leading-relaxed text-foreground ring-1 ring-border/50">{settings.paymentInstructions || 'No customer payment instructions.'}</p>
      )}
      {validationErrors['paymentMethods.paymentInstructions'] && <p className={ERROR_CLASS}>{validationErrors['paymentMethods.paymentInstructions']}</p>}
    </div>
  </section>
)

const Info: FC<{ label: string; value?: string; className?: string }> = ({ label, value, className = '' }) => (
  <div className={`border-b border-border/60 py-2.5 last:border-b-0 sm:rounded-lg sm:border-b-0 sm:bg-background/80 sm:px-3 sm:ring-1 sm:ring-border/50 ${className}`}><p className={LABEL_CLASS}>{label}</p><p className="mt-1 break-words text-sm font-medium text-foreground">{value || '—'}</p></div>
)

const ToggleRow: FC<{ label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, disabled, onChange }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-panel px-3 py-2">
    <span className="text-xs font-medium text-foreground">{label}</span>
    <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
  </div>
)
