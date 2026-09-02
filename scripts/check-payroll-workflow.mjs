#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative) => readFile(path.join(root, relative), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const [store, hrUi, financeUi, validation, migration, policyMigration, test] = await Promise.all([
  read('apps/os/src/store/payrollStore.ts'),
  read('apps/os/src/components/hr/HrPayrollSection.tsx'),
  read('apps/os/src/components/finance/FinancePayrollReview.tsx'),
  read('apps/os/src/domain/payrollFinanceReviewDomain.ts'),
  read('supabase/migrations/20260805104118_payroll_manual_payees_and_self_approval.sql'),
  read('supabase/migrations/20260903000500_freeze_payroll_calculation_policy.sql'),
  read('apps/os/src/store/payrollManualPayeeWorkflow.test.ts'),
])

assert(store.includes('saveManualPayrollDraft'), 'HR manual-payee command is missing.')
assert(store.includes('removeManualPayrollDraft'), 'Unsubmitted manual-payee removal is missing.')
assert(store.includes("entryMode:'manual'"), 'Manual payroll rows are not explicitly classified.')
assert(store.includes('...drafts, ...manualDrafts'), 'Regeneration does not preserve manual payroll rows.')
assert(store.includes('selfApprovalEmployeeIds'), 'Group self-approval audit evidence is missing.')
assert(store.includes('selfApproval:true'), 'Employee self-approval audit evidence is missing.')
assert(store.includes('calculationPolicy?: PayrollCalculationPolicy'), 'Frozen payroll policy is missing from the client payroll contract.')
assert(!store.includes('Another Finance reviewer or Owner must approve your payroll'), 'Finance self-approval is still blocked in the store.')
assert(hrUi.includes('Add manual payee'), 'HR manual-payee UI is missing.')
assert(hrUi.includes('Manual payroll payee saved.'), 'HR manual-payee confirmation is missing.')
assert(financeUi.includes('Self-approval is allowed'), 'Finance self-approval disclosure is missing.')
assert(!financeUi.includes('Group approval waits for another reviewer'), 'Finance group approval still waits for another reviewer.')
assert(validation.includes("draft.entryMode === 'manual'"), 'Manual payroll validation is missing.')
assert(migration.includes('private.payroll_manual_payee_guard'), 'Database manual-payee guard is missing.')
assert(migration.includes("manualPayeeType"), 'Manual-payee fields are not protected by the HR projection.')
assert(migration.includes('full join jsonb_array_elements'), 'Submitted manual-payee deletion is not protected.')
assert(migration.includes('MANUAL_PAYEE_LOCKED_AFTER_SUBMISSION'), 'Submitted manual-payee edits are not blocked.')
assert(policyMigration.includes('private.payroll_hr_owned_projection'), 'Frozen payroll policy is not included in the authoritative HR projection.')
assert(policyMigration.includes("'calculationPolicy', e->'calculationPolicy'"), 'Employee payroll calculation policy is not HR-owned at the database boundary.')
assert(policyMigration.includes("'calculationPolicy', p->'calculationPolicy'"), 'Proposal calculation policy is not HR-owned at the database boundary.')
assert(policyMigration.includes('private.payroll_calculation_policy_guard'), 'Database payroll calculation-policy submission guard is missing.')
assert(policyMigration.includes('PAYROLL_CALCULATION_POLICY_MISMATCH'), 'Database does not reject generated rows whose policy differs from the proposal.')
assert(test.includes('allows Finance to approve its own HR-submitted payroll'), 'Finance self-approval regression test is missing.')

console.log('Payroll HR/Finance workflow checks passed.')
