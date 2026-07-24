import type {
  FinanceBuiltInCategory,
  FinanceCategory,
  FinanceCategoryDefinition,
  FinanceCategoryOverride,
  FinanceCustomCategory,
  FinancePaymentMethod,
  FinanceScopePolicy,
  FinanceTransactionType,
} from '../store/financeStoreTypes'

const builtIn = (
  id: FinanceBuiltInCategory,
  label: string,
  direction: FinanceTransactionType,
  scopePolicy: FinanceScopePolicy,
  options: Partial<FinanceCategoryDefinition> = {},
): FinanceCategoryDefinition => ({
  id,
  systemKey:id,
  label,
  direction,
  kind:options.linkedWorkflow ? 'system' : 'manual',
  active:true,
  manuallyCreatable:true,
  branchRequired:scopePolicy === 'branch',
  scopePolicy,
  allowScopeOverride:true,
  paymentMethodRequired:true,
  placeholder:`e.g. ${label}`,
  ...options,
})

const BUILT_IN_FINANCE_CATEGORIES: readonly FinanceCategoryDefinition[] = [
  builtIn('order_payment','Order','income','branch',{ linkedWorkflow:'orders', description:'Created automatically when Finance confirms a completed order.', placeholder:'Manual correction or historical order income' }),
  builtIn('walk_in_sale','Walk-in sale','income','branch',{ description:'Direct branch sales not linked to an order record.', placeholder:'e.g. Walk-in cash sale' }),
  builtIn('other_income','Other income','income','company',{ description:'Other operating money received by the company.', placeholder:'e.g. Other business income' }),
  builtIn('reimbursement_received','Reimbursement received','income','company',{ description:'Money returned by a supplier or another party.', placeholder:'e.g. Supplier reimbursement' }),
  builtIn('owner_deposit','Owner deposit / capital','income','company',{ description:'Owner funding or working capital, separate from sales revenue.', placeholder:'e.g. Owner working-capital deposit' }),
  builtIn('order_refund','Refund','expense','user_choice',{ linkedWorkflow:'refunds', description:'Created automatically when a customer refund is completed.', placeholder:'Manual refund correction or historical refund' }),
  builtIn('supplies','Supplies','expense','user_choice',{ description:'Flowers, wrapping, tools, and other operating supplies.', placeholder:'e.g. Wrapping paper and ribbon' }),
  builtIn('payroll','Payroll','expense','company',{ linkedWorkflow:'payroll', description:'Created automatically when final payroll payment is recorded.', placeholder:'Manual payroll correction or historical payroll' }),
  builtIn('rent','Rent','expense','branch',{ description:'Store, office, or workspace rent for a specific branch.', placeholder:'e.g. Pahoman store rent — July 2026' }),
  builtIn('utilities','Utilities','expense','user_choice',{ description:'Electricity, water, internet, and other utility costs.', placeholder:'e.g. Electricity bill — July 2026' }),
  builtIn('other','Other expense','expense','user_choice',{ description:'Operating expenses that do not fit another category.', placeholder:'e.g. Other operating expense' }),
] as const

const applyOverride = (definition: FinanceCategoryDefinition, overrides: FinanceCategoryOverride[]): FinanceCategoryDefinition => {
  const override = overrides.find((item) => item.categoryId === definition.id)
  if (!override) return definition
  const scopePolicy = override.scopePolicy ?? definition.scopePolicy ?? (definition.branchRequired ? 'branch' : 'company')
  return {
    ...definition,
    label:override.label?.trim() || definition.label,
    description:override.description?.trim() || definition.description,
    active:override.active ?? definition.active,
    scopePolicy,
    branchRequired:scopePolicy === 'branch',
    allowScopeOverride:override.allowScopeOverride ?? definition.allowScopeOverride,
    placeholder:override.placeholder?.trim() || definition.placeholder,
  }
}

const customCategoryToDefinition = (category: FinanceCustomCategory): FinanceCategoryDefinition => {
  const scopePolicy = category.scopePolicy ?? (category.branchRequired ? 'branch' : 'company')
  return {
    id:category.id,
    label:category.name,
    direction:'expense',
    kind:'custom',
    active:category.active,
    manuallyCreatable:true,
    branchRequired:scopePolicy === 'branch',
    scopePolicy,
    allowScopeOverride:category.allowScopeOverride ?? true,
    paymentMethodRequired:category.paymentMethodRequired,
    placeholder:category.placeholder || `e.g. ${category.name}`,
    description:category.description,
  }
}

export const getFinanceCategoryDefinitions = (
  customCategories: FinanceCustomCategory[],
  overrides: FinanceCategoryOverride[] = [],
): FinanceCategoryDefinition[] => [
  ...BUILT_IN_FINANCE_CATEGORIES.map((item) => applyOverride(item, overrides)),
  ...customCategories.map(customCategoryToDefinition),
]

export const getFinanceCategoryDefinition = (
  category: FinanceCategory,
  customCategories: FinanceCustomCategory[] = [],
  overrides: FinanceCategoryOverride[] = [],
): FinanceCategoryDefinition | undefined =>
  getFinanceCategoryDefinitions(customCategories, overrides).find((item) => item.id === category)

export const getFinanceCategoryLabel = (
  category: FinanceCategory,
  customCategories: FinanceCustomCategory[] = [],
  overrides: FinanceCategoryOverride[] = [],
): string => getFinanceCategoryDefinition(category, customCategories, overrides)?.label ?? category.replace(/^custom:/, '').replaceAll('_', ' ')

export const getCategoriesForDirection = (
  direction: FinanceTransactionType,
  customCategories: FinanceCustomCategory[],
  overrides: FinanceCategoryOverride[] = [],
): FinanceCategoryDefinition[] => getFinanceCategoryDefinitions(customCategories, overrides).filter((item) => item.direction === direction && item.active)

export const validateCustomExpenseCategoryName = (
  name: string,
  customCategories: FinanceCustomCategory[],
  ignoreId?: string,
  overrides: FinanceCategoryOverride[] = [],
): string | null => {
  const trimmed = name.trim()
  if (!trimmed) return 'Category name is required.'
  const collision = getFinanceCategoryDefinitions(customCategories, overrides).find(
    (item) => item.id !== ignoreId && item.label.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  return collision ? 'A transaction category with this name already exists.' : null
}

export const normalizeFinancePaymentMethod = (value?: string): FinancePaymentMethod =>
  value === 'cash' || value === 'transfer' || value === 'card' || value === 'other' ? value : 'transfer'
