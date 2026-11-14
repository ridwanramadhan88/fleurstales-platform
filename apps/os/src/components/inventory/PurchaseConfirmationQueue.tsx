/**
 * @file PurchaseConfirmationQueue.tsx
 * @description Finance/Owner queue of stock purchases recorded by the Manager.
 * Confirming writes the expense to the Finance ledger; rejecting needs a reason
 * and takes the stock back out.
 */

import { useCallback, useEffect, useState, type FC } from 'react'
import { ChevronDown, PackageCheck } from 'lucide-react'
import { decideInventoryPurchase, fetchInventoryPurchases } from '../../data/inventorySupabase'
import { formatRupiah, summarizePendingPurchases, type InventoryPurchase } from '../../domain/inventoryDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useFinanceStore } from '../../store/financeStore'
import { useUserStore } from '../../store/userStore'
import { surfaceCardClass } from '../ui/card'

/** `hideWhenEmpty`: show nothing until there is a purchase to confirm. */
export const PurchaseConfirmationQueue: FC<{ hideWhenEmpty?: boolean }> = ({ hideWhenEmpty = false }) => {
  const tr = useBilingualCopy()
  const addTransaction = useFinanceStore((state) => state.addTransaction)
  const actorName = useUserStore((state) => state.name)
  const role = useUserStore((state) => state.role)
  const [open, setOpen] = useState(false)
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setPurchases(await fetchInventoryPurchases('pending_finance')); setError(null) }
    catch { setError(tr('Purchases could not be loaded. Try again.', 'Pembelian tidak bisa dimuat. Coba lagi.')) }
    finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void load() }, [load])

  const summary = summarizePendingPurchases(purchases)

  const confirm = async (purchase: InventoryPurchase) => {
    setBusyId(purchase.id); setError(null)
    try {
      const decision = await decideInventoryPurchase(purchase.id, 'confirmed')
      if (!decision.alreadyDecided) {
        const result = addTransaction({
          type: 'expense', category: 'supplies', scope: 'branch', branch: purchase.branchId, amount: purchase.totalIdr,
          method: purchase.fundingAccountId === 'cash:main' ? 'cash' : 'transfer',
          name: `${tr('Stock purchase', 'Pembelian stok')}: ${purchase.itemName}`,
          note: `${purchase.quantity} ${purchase.unit}${purchase.supplierName ? ` · ${purchase.supplierName}` : ''} · ${purchase.fundingAccountId}`,
          transactionDate: purchase.purchasedOn, actor: { name: actorName, role },
        })
        if (!result.allowed) setError(tr(`Confirmed, but the ledger entry failed: ${result.reason ?? ''}. Add it manually in Finance.`, `Terkonfirmasi, tetapi catatan buku gagal: ${result.reason ?? ''}. Tambahkan manual di Keuangan.`))
      }
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : tr('Could not confirm.', 'Gagal mengonfirmasi.')) }
    finally { setBusyId(null) }
  }

  const reject = async (purchase: InventoryPurchase) => {
    setBusyId(purchase.id); setError(null)
    try { await decideInventoryPurchase(purchase.id, 'rejected', reason); setRejectingId(null); setReason(''); await load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : tr('Could not reject.', 'Gagal menolak.')) }
    finally { setBusyId(null) }
  }

  if (hideWhenEmpty && !error && purchases.length === 0) return null

  return (
    <section aria-label={tr('Stock purchases to confirm', 'Pembelian stok untuk dikonfirmasi')} data-testid="purchase-confirmation-queue" className={surfaceCardClass('standard')}>
      <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PackageCheck className="size-5 shrink-0 text-primary" />
            <h2 className="text-sm font-semibold leading-5">{tr('Stock purchases to confirm', 'Pembelian stok untuk dikonfirmasi')}</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{loading ? tr('Loading…', 'Memuat…') : `${summary.count} ${tr('waiting', 'menunggu')} · ${formatRupiah(summary.totalIdr)}`}</p>
        </div>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          {!loading && purchases.length === 0 && <p className="text-sm text-muted-foreground">{tr('Nothing to confirm.', 'Tidak ada yang perlu dikonfirmasi.')}</p>}
          {purchases.map((purchase) => (
            <div key={purchase.id} className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">{purchase.itemName} · {purchase.quantity} {purchase.unit}</p>
              <p className="text-xs text-muted-foreground">{formatRupiah(purchase.totalIdr)} · {purchase.branchId}{purchase.supplierName ? ` · ${purchase.supplierName}` : ''} · {purchase.purchasedOn}</p>
              <p className="text-xs text-muted-foreground">{tr('Paid from', 'Dibayar dari')} {purchase.fundingAccountId === 'cash:main' ? tr('Cash', 'Kas') : purchase.fundingAccountId} · {tr('recorded by', 'dicatat oleh')} {purchase.recordedByName}</p>
              {purchase.note && <p className="mt-1 text-xs">{purchase.note}</p>}
              {rejectingId === purchase.id ? (
                <div className="mt-2 space-y-2">
                  <input value={reason} maxLength={300} placeholder={tr('Reason for rejecting', 'Alasan menolak')} aria-label={tr('Reason for rejecting', 'Alasan menolak')} onChange={(event) => setReason(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
                  <div className="flex gap-2">
                    <button type="button" disabled={busyId === purchase.id || reason.trim().length === 0} onClick={() => void reject(purchase)} className="min-h-10 rounded-full bg-destructive px-4 text-sm font-medium text-destructive-foreground disabled:opacity-50">{tr('Reject', 'Tolak')}</button>
                    <button type="button" onClick={() => setRejectingId(null)} className="min-h-10 rounded-full border border-border px-4 text-sm">{tr('Cancel', 'Batal')}</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busyId === purchase.id} onClick={() => void confirm(purchase)} className="min-h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{tr('Confirm', 'Konfirmasi')}</button>
                  <button type="button" disabled={busyId === purchase.id} onClick={() => { setRejectingId(purchase.id); setReason('') }} className="min-h-10 rounded-full border border-border px-4 text-sm">{tr('Reject', 'Tolak')}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
