import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { SESSION_WARNING_MS, getSessionRemainingMs } from '../../data/shared/sessionLifetime'
import { useUiLanguage } from '../../i18n/uiLanguage'

export const SessionExpiryNotice = () => {
  const language = useUiLanguage((state) => state.language)
  const [remainingMs, setRemainingMs] = useState<number | null>(() => getSessionRemainingMs())

  useEffect(() => {
    const tick = () => setRemainingMs(getSessionRemainingMs())
    tick()
    const timer = window.setInterval(tick, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  if (remainingMs === null || remainingMs > SESSION_WARNING_MS) return null

  const minutes = Math.max(0, Math.ceil(remainingMs / 60_000))
  const text = language === 'id'
    ? (minutes <= 0
      ? 'Sesi Anda segera berakhir. Simpan pekerjaan Anda, lalu masuk kembali.'
      : `Sesi Anda berakhir sekitar ${minutes} menit lagi. Simpan pekerjaan Anda, lalu keluar dan masuk kembali.`)
    : (minutes <= 0
      ? 'Your session is about to end. Save your work, then sign in again.'
      : `Your session ends in about ${minutes} minute${minutes === 1 ? '' : 's'}. Save your work, then sign out and sign in again.`)

  return (
    <aside role="status" aria-live="polite" className="fixed left-4 right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-warning/35 bg-surface-popover p-3 text-foreground shadow-ios-lg md:left-auto md:right-5 md:mx-0 md:max-w-md">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/12 text-warning"><Clock className="size-4" aria-hidden="true" /></span>
      <p className="text-xs leading-5">{text}</p>
    </aside>
  )
}
