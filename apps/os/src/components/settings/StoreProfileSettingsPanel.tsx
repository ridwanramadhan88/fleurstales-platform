/**
 * @file StoreProfileSettingsPanel.tsx
 * @description Owner-editable store identity/contact info. View mode is
 * deliberately informational; form controls only exist after Edit is pressed.
 */

import type { ChangeEvent, FC, ReactNode } from 'react'
import { useRef, useState } from 'react'
import { ImageUp, Store, Trash2 } from 'lucide-react'
import type { StoreProfileSettings } from '../../types/settings'
import type { SettingsValidationErrors } from '../../domain/settings/settingsValidation'
import { createStoreLogoDataUrl } from '../../domain/settings/storeLogoDomain'
import { StoreBrandMark } from '../common/StoreBrandMark'
import { Switch } from '../ui/switch'
import { SettingsCard, SettingsSectionHeader } from './SettingsPrimitives'

interface Props {
  profile: StoreProfileSettings
  onUpdate: (patch: Partial<StoreProfileSettings>) => void
  isEditing: boolean
  validationErrors: SettingsValidationErrors
}

const FIELD_CLASS =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'
const LABEL_CLASS = 'text-2xs font-semibold uppercase tracking-wide text-muted-foreground'

const InfoField: FC<{ label: string; value?: ReactNode; className?: string }> = ({ label, value, className = '' }) => (
  <div className={`min-w-0 border-b border-border/70 py-2.5 sm:rounded-lg sm:border-b-0 sm:bg-surface-panel sm:px-3 sm:ring-1 sm:ring-border/50 ${className}`}>
    <p className={LABEL_CLASS}>{label}</p>
    <div className="mt-1 break-words text-sm font-medium text-foreground">{value || '—'}</div>
  </div>
)

export const StoreProfileSettingsPanel: FC<Props> = ({ profile, onUpdate, isEditing, validationErrors }) => {
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [isReadingLogo, setIsReadingLogo] = useState(false)

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setLogoError(null)
    setIsReadingLogo(true)
    try {
      onUpdate({ logoUrl: await createStoreLogoDataUrl(file) })
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : 'Logo could not be uploaded.')
    } finally {
      setIsReadingLogo(false)
    }
  }

  return (
    <section className="space-y-5">
      <SettingsSectionHeader icon={Store} title="Store identity" description="Name, contact details, and store-wide defaults." />

      {!isEditing ? (
        <SettingsCard className="space-y-5" emphasis="primary">
          <div className="flex items-center gap-3 border-b border-border/70 pb-4">
            <StoreBrandMark
              logoUrl={profile.logoUrl}
              alt={`${profile.storeName} logo`}
              className="h-14 w-14 rounded-lg ring-1 ring-border/60"
              iconClassName="h-7 w-7"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">{profile.storeName || 'Unnamed store'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{profile.legalName || 'No legal name added'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 sm:gap-3">
            <InfoField label="WhatsApp" value={profile.whatsapp || profile.phone} />
            <InfoField label="Email" value={profile.email} className="col-span-2 sm:col-span-1" />
            <InfoField label="Address" value={profile.address} className="col-span-2 sm:col-span-1" />
            <InfoField label="Currency" value={profile.currency} />
            <InfoField label="Timezone" value={profile.timezone} />
          </div>

          {profile.inventoryEnabled && (
            <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-panel px-4 py-3 ring-1 ring-border/60">
              <div>
                <p className="text-sm font-semibold leading-5 text-foreground">Inventory</p>
                <p className="text-xs text-muted-foreground">Stock tracking and inventory tools across the app.</p>
              </div>
              <span className="rounded-full bg-success/10 px-2.5 py-1 text-2xs font-semibold text-success">Enabled</span>
            </div>
          )}
        </SettingsCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={LABEL_CLASS}>Store name</span>
            <input value={profile.storeName} onChange={(event) => onUpdate({ storeName: event.target.value })} placeholder="Fleurstales Florist" className={FIELD_CLASS} />
            {validationErrors.storeName && <p className="text-2xs font-medium text-destructive">{validationErrors.storeName}</p>}
          </label>

          <label className="space-y-1">
            <span className={LABEL_CLASS}>Legal name (optional)</span>
            <input value={profile.legalName ?? ''} onChange={(event) => onUpdate({ legalName: event.target.value })} placeholder="PT Fleurstales Florist Indonesia" className={FIELD_CLASS} />
          </label>

          <label className="space-y-1"><span className={LABEL_CLASS}>WhatsApp</span><input value={profile.whatsapp || profile.phone} onChange={(event) => onUpdate({ whatsapp: event.target.value, phone: event.target.value })} placeholder="+62 812-0000-0000" className={FIELD_CLASS} /></label>
          <label className="space-y-1"><span className={LABEL_CLASS}>Email</span><input value={profile.email} onChange={(event) => onUpdate({ email: event.target.value })} placeholder="hello@fleurstales.com" className={FIELD_CLASS} />{validationErrors.email && <p className="text-2xs font-medium text-destructive">{validationErrors.email}</p>}</label>
          <label className="space-y-1"><span className={LABEL_CLASS}>Address</span><input value={profile.address} onChange={(event) => onUpdate({ address: event.target.value })} placeholder="Lampung, Indonesia" className={FIELD_CLASS} /></label>

          <div className="space-y-1 sm:col-span-2">
            <span className={LABEL_CLASS}>Store logo (optional)</span>
            <div className="flex min-h-24 items-center gap-3 rounded-lg border border-border/70 bg-background p-3">
              <StoreBrandMark logoUrl={profile.logoUrl} alt={`${profile.storeName} logo`} className="h-16 w-16 rounded-lg ring-1 ring-border/60" iconClassName="h-7 w-7" />
              <div className="min-w-0 flex-1">
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoUpload} className="sr-only" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => logoInputRef.current?.click()} disabled={isReadingLogo} className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-[18px] text-sm font-semibold text-background disabled:opacity-50">
                    <ImageUp className="size-3.5" />{isReadingLogo ? 'Uploading…' : profile.logoUrl ? 'Replace logo' : 'Upload logo'}
                  </button>
                  {profile.logoUrl && <button type="button" onClick={() => { setLogoError(null); onUpdate({ logoUrl: '' }) }} className="inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-sm font-semibold text-destructive ring-1 ring-destructive/25"><Trash2 className="size-3.5" /> Remove</button>}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">PNG, JPG, WebP, or SVG. Maximum 1 MB.</p>
              </div>
            </div>
            {(logoError || validationErrors.logoUrl) && <p className="text-2xs font-medium text-destructive">{logoError ?? validationErrors.logoUrl}</p>}
          </div>

          {profile.inventoryEnabled && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-surface-panel p-3 sm:col-span-2">
              <div><p className="text-sm font-semibold leading-5 text-foreground">Inventory</p><p className="text-xs text-muted-foreground">Turn off to hide and pause inventory while preserving saved data.</p></div>
              <Switch checked onCheckedChange={(checked) => onUpdate({ inventoryEnabled: checked })} aria-label="Inventory enabled" />
            </div>
          )}

          <InfoField label="Currency" value={profile.currency} />
          <InfoField label="Timezone" value={profile.timezone} />
        </div>
      )}
    </section>
  )
}
