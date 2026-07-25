export type PayrollWorkflowCommand =
  | 'set_compensation'
  | 'prepare'
  | 'generate'
  | 'submit'
  | 'resolve_rejected'
  | 'approve_employee'
  | 'reject_employee'
  | 'approve_all'
  | 'record_payment'
  | 'adjust_schedule'

type Listener = (command: PayrollWorkflowCommand) => void
const listeners = new Set<Listener>()

export const publishPayrollWorkflowMutation = (command: PayrollWorkflowCommand): void => {
  for (const listener of listeners) listener(command)
}

export const subscribePayrollWorkflowMutations = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
