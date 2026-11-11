/**
 * @file OperationsSettingsEntry.tsx
 * @description Manager Home card that opens the operational settings editor.
 */

import { useState, type FC } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { OperationsSettingsDialog } from '../settings/OperationsSettingsDialog'
import { surfaceCardClass } from '../ui/card'

export const OperationsSettingsEntry: FC = () => {
  const tr = useBilingualCopy()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="operations-settings-entry"
        className={`${surfaceCardClass('standard')} flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent`}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-panel"><SlidersHorizontal className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{tr('Operational settings', 'Pengaturan operasional')}</span>
          <span className="block text-xs text-muted-foreground">{tr('Branch hours, delivery fees, minimum staff', 'Jam cabang, ongkir, staf minimum')}</span>
        </span>
      </button>
      <OperationsSettingsDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
