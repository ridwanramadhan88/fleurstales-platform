export interface AppConfirmOptions {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  requiredText?: string
}

/**
 * Imperative application-styled confirmation for controller-only workflows.
 * Prefer the declarative ConfirmActionDialog when a component already owns UI state.
 */
export const requestAppConfirmation = (options: AppConfirmOptions): Promise<boolean> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false)
      return
    }

    const overlay = document.createElement('div')
    overlay.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4'
    overlay.setAttribute('role', 'presentation')

    const dialog = document.createElement('div')
    dialog.className = 'w-full max-w-lg rounded-xl border border-border/60 bg-surface-card p-4 text-foreground shadow-lg sm:p-5'
    dialog.setAttribute('role', 'alertdialog')
    dialog.setAttribute('aria-modal', 'true')

    const title = document.createElement('h2')
    title.className = 'font-display text-lg font-semibold leading-snug'
    title.textContent = options.title

    const description = document.createElement('p')
    description.className = 'mt-2 text-sm text-muted-foreground'
    description.textContent = options.description

    const input = options.requiredText ? document.createElement('input') : null
    if (input) {
      input.className = 'mt-4 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none ring-primary focus:ring-2'
      input.placeholder = `Type ${options.requiredText} to confirm`
      input.setAttribute('aria-label', `Type ${options.requiredText} to confirm`)
      input.autocomplete = 'off'
    }

    const actions = document.createElement('div')
    actions.className = 'mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4'

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent'
    cancel.textContent = options.cancelLabel ?? 'Cancel'

    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.className = options.destructive
      ? 'rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-40'
      : 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40'
    confirm.textContent = options.confirmLabel ?? 'Confirm'
    confirm.disabled = Boolean(options.requiredText)

    const cleanup = (result: boolean) => {
      document.removeEventListener('keydown', onKeyDown)
      overlay.remove()
      resolve(result)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cleanup(false)
    }

    input?.addEventListener('input', () => {
      confirm.disabled = input.value.trim() !== options.requiredText
    })
    cancel.addEventListener('click', () => cleanup(false))
    confirm.addEventListener('click', () => cleanup(true))
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) cleanup(false)
    })
    document.addEventListener('keydown', onKeyDown)

    actions.append(cancel, confirm)
    dialog.append(title, description)
    if (input) dialog.append(input)
    dialog.append(actions)
    overlay.append(dialog)
    document.body.append(overlay)
    ;(input ?? cancel).focus()
  })
