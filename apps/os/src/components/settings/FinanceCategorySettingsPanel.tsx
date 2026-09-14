import { useMemo, useState, type FC } from 'react'
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useFinanceStore } from '../../store/financeStore'
import { useUserStore } from '../../store/userStore'
import type {
  FinanceBuiltInCategory,
  FinanceCategory,
  FinancePaymentMethod,
  FinanceScopePolicy,
} from '../../store/financeStoreTypes'
import {
  getFinanceCategoryDefinition,
  getFinanceCategoryDefinitions,
} from '../../domain/financeTransactionCategoryDomain'
import { AppSheet } from '../ui/app-sheet'
import { ActionFooter } from '../ui/action-footer'

interface CategoryDraft {
  name: string
  description: string
  scopePolicy: FinanceScopePolicy
  allowScopeOverride: boolean
  paymentMethodRequired: boolean
  defaultPaymentMethod: FinancePaymentMethod
  placeholder: string
  active: boolean
}

const emptyCategoryDraft = (): CategoryDraft => ({
  name: '',
  description: '',
  scopePolicy: 'user_choice',
  allowScopeOverride: true,
  paymentMethodRequired: true,
  defaultPaymentMethod: 'transfer',
  placeholder: '',
  active: true,
})

const scopeLabel = (scope: FinanceScopePolicy): string =>
  scope === 'company' ? 'Company-wide suggested' : scope === 'branch' ? 'Specific branch suggested' : 'User chooses scope'

export const FinanceCategorySettingsPanel: FC = () => {
  const actorName = useUserStore((state) => state.name)
  const actorRole = useUserStore((state) => state.role)
  const transactions = useFinanceStore((state) => state.transactions)
  const customCategories = useFinanceStore((state) => state.customCategories)
  const categoryOverrides = useFinanceStore((state) => state.categoryOverrides)
  const addExpenseCategory = useFinanceStore((state) => state.addExpenseCategory)
  const updateExpenseCategory = useFinanceStore((state) => state.updateExpenseCategory)
  const updateBuiltInCategory = useFinanceStore((state) => state.updateBuiltInCategory)
  const removeExpenseCategory = useFinanceStore((state) => state.removeExpenseCategory)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<FinanceCategory | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategoryDraft)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)

  const definitions = useMemo(
    () => getFinanceCategoryDefinitions(customCategories, categoryOverrides)
      .filter((definition) => definition.direction === 'expense'),
    [customCategories, categoryOverrides],
  )

  const inputClass = 'h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10'

  const beginEdit = (id: FinanceCategory) => {
    const definition = getFinanceCategoryDefinition(id, customCategories, categoryOverrides)
    if (!definition) return
    setEditingCategoryId(id)
    setCategoryDraft({
      name: definition.label,
      description: definition.description ?? '',
      scopePolicy: definition.scopePolicy ?? (definition.branchRequired ? 'branch' : 'company'),
      allowScopeOverride: definition.allowScopeOverride ?? true,
      paymentMethodRequired: definition.paymentMethodRequired,
      defaultPaymentMethod: 'transfer',
      placeholder: definition.placeholder,
      active: definition.active,
    })
    setCategoryError(null)
    setEditorOpen(true)
  }

  const beginAdd = () => {
    setEditingCategoryId(null)
    setCategoryDraft(emptyCategoryDraft())
    setCategoryError(null)
    setEditorOpen(true)
  }

  const setCategoryActive = (id: FinanceCategory, active: boolean) => {
    const definition = getFinanceCategoryDefinition(id, customCategories, categoryOverrides)
    if (!definition) return
    const actor = { name: actorName, role: actorRole }
    const result = id.startsWith('custom:')
      ? updateExpenseCategory({
          categoryId: id,
          name: definition.label,
          description: definition.description,
          branchRequired: (definition.scopePolicy ?? (definition.branchRequired ? 'branch' : 'company')) === 'branch',
          scopePolicy: definition.scopePolicy ?? (definition.branchRequired ? 'branch' : 'company'),
          allowScopeOverride: definition.allowScopeOverride ?? true,
          paymentMethodRequired: definition.paymentMethodRequired,
          defaultPaymentMethod: 'transfer',
          placeholder: definition.placeholder,
          active,
          actor,
        })
      : updateBuiltInCategory({
          categoryId: id as FinanceBuiltInCategory,
          name: definition.label,
          description: definition.description,
          scopePolicy: definition.scopePolicy ?? (definition.branchRequired ? 'branch' : 'company'),
          allowScopeOverride: definition.allowScopeOverride ?? true,
          placeholder: definition.placeholder,
          active,
          actor,
        })
    if (!result.allowed) setCategoryError(result.reason ?? 'Unable to update category.')
  }

  const saveCategory = () => {
    const actor = { name: actorName, role: actorRole }
    const result = editingCategoryId && !editingCategoryId.startsWith('custom:')
      ? updateBuiltInCategory({
          categoryId: editingCategoryId as FinanceBuiltInCategory,
          name: categoryDraft.name,
          description: categoryDraft.description,
          scopePolicy: categoryDraft.scopePolicy,
          allowScopeOverride: categoryDraft.allowScopeOverride,
          placeholder: categoryDraft.placeholder,
          active: categoryDraft.active,
          actor,
        })
      : editingCategoryId
        ? updateExpenseCategory({
            categoryId: editingCategoryId,
            name: categoryDraft.name,
            description: categoryDraft.description,
            branchRequired: categoryDraft.scopePolicy === 'branch',
            scopePolicy: categoryDraft.scopePolicy,
            allowScopeOverride: categoryDraft.allowScopeOverride,
            paymentMethodRequired: categoryDraft.paymentMethodRequired,
            defaultPaymentMethod: categoryDraft.defaultPaymentMethod,
            placeholder: categoryDraft.placeholder,
            active: categoryDraft.active,
            actor,
          })
        : addExpenseCategory({
            name: categoryDraft.name,
            description: categoryDraft.description,
            branchRequired: categoryDraft.scopePolicy === 'branch',
            scopePolicy: categoryDraft.scopePolicy,
            allowScopeOverride: categoryDraft.allowScopeOverride,
            paymentMethodRequired: categoryDraft.paymentMethodRequired,
            defaultPaymentMethod: categoryDraft.defaultPaymentMethod,
            placeholder: categoryDraft.placeholder,
            actor,
          })

    if (!result.allowed) {
      setCategoryError(result.reason ?? 'Unable to save category.')
      return
    }
    setEditorOpen(false)
    setCategoryError(null)
  }

  return (
    <section aria-label="Finance transaction categories" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Transaction categories</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure reusable Money Out categories here instead of from the daily Transactions workspace. Automatic category keys remain stable for source workflows and integrations.
          </p>
        </div>
        <button type="button" onClick={beginAdd} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground">
          <Plus className="size-4" /> Add category
        </button>
      </div>

      {categoryError && !editorOpen && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{categoryError}</p>}

      <div className="space-y-2">
        {definitions.map((definition) => {
          const custom = customCategories.find((item) => item.id === definition.id)
          const used = transactions.some((transaction) => transaction.category === definition.id)
          return (
            <article key={definition.id} className={`rounded-xl border px-4 py-3 ${definition.active ? 'border-border/70 bg-card' : 'border-border/50 bg-muted/35'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{definition.label}</p>
                    <span className="rounded-full bg-surface-neutral px-2 py-0.5 text-2xs text-muted-foreground">{definition.linkedWorkflow ? 'Automatic' : definition.kind === 'custom' ? 'Custom' : 'System'}</span>
                    {!definition.active && <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">Archived</span>}
                  </div>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{scopeLabel(definition.scopePolicy ?? (definition.branchRequired ? 'branch' : 'company'))}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{definition.description || 'No category description yet.'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => beginEdit(definition.id)} aria-label={`Edit ${definition.label}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted"><Pencil className="size-4" /></button>
                  <button type="button" onClick={() => setCategoryActive(definition.id, !definition.active)} aria-label={`${definition.active ? 'Archive' : 'Restore'} ${definition.label}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted">{definition.active ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}</button>
                  {custom && !used && <button type="button" aria-label={`Delete ${definition.label}`} onClick={() => setPendingRemoveId(custom.id)} className="flex size-11 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {pendingRemoveId && (
        <div className="rounded-xl bg-destructive/5 p-4 ring-1 ring-destructive/15">
          <p className="text-sm font-medium">Remove this unused custom category?</p>
          <p className="mt-1 text-xs text-muted-foreground">Categories already used by ledger history are archived instead of deleted.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setPendingRemoveId(null)} className="h-10 rounded-full px-4 text-sm">Cancel</button>
            <button type="button" onClick={() => { removeExpenseCategory({ categoryId: pendingRemoveId, actor: { name: actorName, role: actorRole } }); setPendingRemoveId(null) }} className="h-10 rounded-full bg-destructive px-4 text-sm font-semibold text-white">Remove</button>
          </div>
        </div>
      )}

      <AppSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        side="right"
        title={editingCategoryId ? 'Edit expense category' : 'Add expense category'}
        description={editingCategoryId ? 'Update the visible category settings. System integrations keep using the stable key.' : 'Create a reusable manual expense category.'}
        contentClassName="sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-dvh sm:w-[36rem] sm:max-w-[92vw] md:w-[40rem] sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:border-l"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-4">
            <label className="block space-y-1.5 text-xs font-medium">Display name<input aria-label="Expense category name" value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))} className={inputClass} /></label>
            <label className="block space-y-1.5 text-xs font-medium">Description<textarea aria-label="Expense category description" value={categoryDraft.description} onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
            <label className="block space-y-1.5 text-xs font-medium">Suggested scope<select aria-label="Expense category default scope" value={categoryDraft.scopePolicy} onChange={(event) => setCategoryDraft((current) => ({ ...current, scopePolicy: event.target.value as FinanceScopePolicy }))} className={inputClass}><option value="company">Company-wide</option><option value="branch">Specific branch</option><option value="user_choice">User chooses</option></select></label>
            <label className="block space-y-1.5 text-xs font-medium">Transaction placeholder<input aria-label="Expense category placeholder" value={categoryDraft.placeholder} onChange={(event) => setCategoryDraft((current) => ({ ...current, placeholder: event.target.value }))} className={inputClass} /></label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 text-sm"><span><span className="block font-medium">Allow scope override</span><span className="text-xs text-muted-foreground">Finance may switch between company-wide and a branch.</span></span><input aria-label="Allow scope override" type="checkbox" checked={categoryDraft.allowScopeOverride} onChange={(event) => setCategoryDraft((current) => ({ ...current, allowScopeOverride: event.target.checked }))} /></label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 text-sm"><span><span className="block font-medium">Active</span><span className="text-xs text-muted-foreground">Inactive categories stay in history but cannot be selected.</span></span><input aria-label="Category active" type="checkbox" checked={categoryDraft.active} onChange={(event) => setCategoryDraft((current) => ({ ...current, active: event.target.checked }))} /></label>
            {editingCategoryId && !editingCategoryId.startsWith('custom:') && <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">System key: <span className="font-mono text-foreground">{editingCategoryId}</span></p>}
            {categoryError && <p role="alert" className="text-xs text-destructive">{categoryError}</p>}
          </div>
          <ActionFooter className="shrink-0 border-t border-border bg-card/95">
            <button type="button" onClick={() => setEditorOpen(false)} className="h-11 rounded-full px-[18px]">Cancel</button>
            <button type="button" onClick={saveCategory} className="h-11 rounded-full bg-primary px-[18px] font-semibold text-primary-foreground">{editingCategoryId ? 'Save category' : 'Add category'}</button>
          </ActionFooter>
        </div>
      </AppSheet>
    </section>
  )
}

export default FinanceCategorySettingsPanel
