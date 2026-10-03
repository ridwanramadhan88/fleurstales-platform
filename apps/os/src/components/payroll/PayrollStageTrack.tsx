/**
 * @file PayrollStageTrack.tsx
 * @description One picture of the monthly payroll flow, shown the same way on
 * the HR and Finance payroll screens: HR prepares -> Finance reviews ->
 * Finance pays. Everyone sees every stage; the line under it says whose turn
 * it is, so each role knows when to act. Display only: it reads the proposal
 * status and never changes it.
 */

import { Check } from 'lucide-react'
import type { PayrollProposalStatus } from '../../store/payrollStore'
import type { UserRole } from '../../store/userStore'
import { cn } from '../../lib/utils'

export type PayrollStage = 'prepare' | 'review' | 'pay'

const STAGES: { id: PayrollStage; label: string; owner: 'hr' | 'finance' }[] = [
  { id: 'prepare', label: 'HR prepares', owner: 'hr' },
  { id: 'review', label: 'Finance reviews', owner: 'finance' },
  { id: 'pay', label: 'Finance pays', owner: 'finance' },
]

/** Index of the current stage; 3 means every stage is done. */
export const getPayrollStageIndex = (status: PayrollProposalStatus | undefined): number => {
  if (status === 'submitted_to_finance') return 1
  if (status === 'finance_approved') return 2
  if (status === 'paid' || status === 'resolved') return 3
  // No proposal yet, a draft, or returned for corrections: HR's turn.
  return 0
}

const canActFor = (viewer: UserRole, owner: 'hr' | 'finance') =>
  viewer === 'owner' || viewer === owner

export const getPayrollTurnLabel = (status: PayrollProposalStatus | undefined, viewer: UserRole): string => {
  const index = getPayrollStageIndex(status)
  if (index >= STAGES.length) return 'Payroll paid'
  const owner = STAGES[index].owner
  if (canActFor(viewer, owner)) return status === 'returned_to_hr' ? 'Your turn: corrections from Finance' : 'Your turn'
  return owner === 'hr' ? 'Waiting for HR' : 'Waiting for Finance'
}

export const PayrollStageTrack = ({
  status,
  viewer,
  className,
}: {
  status: PayrollProposalStatus | undefined
  viewer: UserRole
  className?: string
}) => {
  const current = getPayrollStageIndex(status)
  return (
    <div className={cn('space-y-2', className)}>
      <ol aria-label="Payroll stages" className="grid grid-cols-3 gap-2">
        {STAGES.map((stage, index) => {
          const done = index < current
          const active = index === current
          return (
            <li
              key={stage.id}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold leading-tight ring-1 sm:text-sm',
                active
                  ? 'bg-primary/10 text-primary ring-primary/30'
                  : done
                    ? 'bg-success/10 text-success ring-success/20'
                    : 'bg-muted/50 text-muted-foreground ring-border/60',
              )}
            >
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-2xs',
                  active ? 'bg-primary text-primary-foreground' : done ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              <span>{stage.label}</span>
            </li>
          )
        })}
      </ol>
      <p className="text-xs font-medium text-muted-foreground">{getPayrollTurnLabel(status, viewer)}</p>
    </div>
  )
}
