/**
 * @file FlowerOfTheMonthDialog.tsx
 * @description Catalog editors pick one active product as the
 * storefront's "Flower of the Month", for this month or next month.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { Check, Search, X } from 'lucide-react'
import { useCatalogStore } from '../../store/catalogStore'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { fetchMonthlyHighlights, saveMonthlyHighlight } from '../../data/monthlyHighlightSupabase'
import {
  formatHighlightMonth, MONTHLY_HIGHLIGHT_NOTE_LIMIT,
  pickHighlightedProducts, toggleHighlightProduct, type MonthlyHighlight,
} from '../../domain/monthlyHighlightDomain'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'

export interface FlowerOfTheMonthDialogProps {
  open: boolean
  onClose: () => void
}

export const FlowerOfTheMonthDialog: FC<FlowerOfTheMonthDialogProps> = ({ open, onClose }) => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const products = useCatalogStore((state) => state.products)
  const [months, setMonths] = useState<MonthlyHighlight[]>([])
  const [monthIndex, setMonthIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMonth, setSavedMonth] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSavedMonth(null)
    setQuery('')
    setMonthIndex(0)
    void fetchMonthlyHighlights()
      .then((rows) => { if (!cancelled) setMonths(rows) })
      .catch(() => { if (!cancelled) setError(tr('The monthly picks could not be loaded. Try again.', 'Pilihan bulanan tidak bisa dimuat. Coba lagi.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const current = months[monthIndex]
  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products])
  const chosen = useMemo(() => (current ? pickHighlightedProducts(activeProducts, current.productIds) : []), [activeProducts, current])
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = needle ? activeProducts.filter((product) => `${product.name} ${product.productId}`.toLowerCase().includes(needle)) : activeProducts
    return list.slice(0, 40)
  }, [activeProducts, query])

  const patchCurrent = (patch: Partial<MonthlyHighlight>) => {
    setSavedMonth(null)
    setMonths((rows) => rows.map((row, index) => (index === monthIndex ? { ...row, ...patch } : row)))
  }


  const handleSave = async () => {
    if (!current || saving) return
    setSaving(true)
    setError(null)
    try {
      // Only send products that are still active; the server rejects the rest.
      const saved = await saveMonthlyHighlight({ ...current, productIds: chosen.map((product) => product.id), note: current.note?.trim() || null })
      setMonths((rows) => rows.map((row, index) => (index === monthIndex ? saved : row)))
      setSavedMonth(saved.month)
    } catch {
      setError(tr('The picks could not be saved. Check your connection and try again.', 'Pilihan tidak bisa disimpan. Periksa koneksi lalu coba lagi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-2xl gap-4">
        <DialogHeader>
          <DialogTitle data-no-translate>Flower of the Month</DialogTitle>
          <DialogDescription>
            {tr('Pick the one product to feature as a banner at the top of the online shop. It switches by itself when the month changes.', 'Pilih satu produk untuk ditampilkan sebagai banner di atas toko online. Berganti sendiri saat bulan berganti.')}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">{tr('Loading…', 'Memuat…')}</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        {!loading && current && (
          <>
            <div className="flex gap-2" role="tablist" aria-label={tr('Month', 'Bulan')}>
              {months.map((month, index) => (
                <button key={month.month} type="button" role="tab" aria-selected={index === monthIndex} onClick={() => { setMonthIndex(index); setSavedMonth(null) }}
                  className={`h-11 flex-1 rounded-full px-4 text-sm font-medium ${index === monthIndex ? 'bg-primary text-white' : 'border border-border text-foreground'}`}>
                  {formatHighlightMonth(month.month, language === 'id' ? 'id' : 'en')}
                  {month.productIds.length > 0 ? ` · ${month.productIds.length}` : ''}
                </button>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                {tr('Chosen', 'Terpilih')}
              </p>
              {chosen.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{tr('Nothing chosen yet. The shop shows no Flower of the Month for this month.', 'Belum ada yang dipilih. Toko tidak menampilkan Flower of the Month untuk bulan ini.')}</p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {chosen.map((product) => (
                    <li key={product.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
                      {product.thumbnail ? <img src={product.thumbnail} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-surface-panel" />}
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</p>
                      <button type="button" onClick={() => patchCurrent({ productIds: toggleHighlightProduct(current.productIds, product.id) })} aria-label={`${tr('Remove', 'Hapus')} ${product.name}`} className="flex size-11 items-center justify-center rounded-full border border-border text-destructive"><X className="size-4" /></button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <label className="block text-xs font-semibold text-muted-foreground">
              {tr('Short note (optional)', 'Catatan singkat (opsional)')}
              <input value={current.note ?? ''} maxLength={MONTHLY_HIGHLIGHT_NOTE_LIMIT} onChange={(event) => patchCurrent({ note: event.target.value })}
                placeholder={tr('e.g. Peony season', 'mis. Musim peony')}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-primary/50" />
            </label>

            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search active products…', 'Cari produk aktif…')} aria-label={tr('Search active products', 'Cari produk aktif')}
                  className="h-11 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
              </div>
              <ul className="mt-2 max-h-[32vh] space-y-1 overflow-y-auto">
                {matches.length === 0 && <li className="py-3 text-center text-xs text-muted-foreground">{tr('No active product matches.', 'Tidak ada produk aktif yang cocok.')}</li>}
                {matches.map((product) => {
                  const selected = current.productIds.includes(product.id)
                  return (
                    <li key={product.id}>
                      <button type="button" aria-pressed={selected} onClick={() => patchCurrent({ productIds: toggleHighlightProduct(current.productIds, product.id) })}
                        className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left disabled:opacity-40 ${selected ? 'bg-primary/10' : 'hover:bg-accent'}`}>
                        {product.thumbnail ? <img src={product.thumbnail} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg object-cover" /> : <span className="size-9 shrink-0 rounded-lg bg-surface-panel" />}
                        <span className="min-w-0 flex-1 truncate text-sm">{product.name}</span>
                        {selected && <Check className="size-4 shrink-0 text-primary" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3">
              {savedMonth === current.month && <p role="status" className="text-xs font-medium text-success">{tr('Saved', 'Tersimpan')}</p>}
              <Button type="button" variant="outline" onClick={onClose}>{tr('Close', 'Tutup')}</Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? tr('Saving…', 'Menyimpan…') : tr('Save', 'Simpan')}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
