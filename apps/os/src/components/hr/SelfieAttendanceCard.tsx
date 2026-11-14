import type { ChangeEvent, FC } from 'react'
import { drawMirroredVideoFrame } from './selfieCapture'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Clock3 } from 'lucide-react'
import { useHrStore, todayIsoDate } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { nowInJakarta } from '../../domain/orderTimingDomain'
import { compressSelfieToSquareJpeg, estimateDataUrlBytes } from '../../domain/selfieImageDomain'
import { getDateLocale } from '../../i18n/uiLanguage'
import { findNearestAttendanceBranch, type GeoPoint } from '../../domain/attendanceLocationDomain'
import { InfoDisclosure } from '../ui/info-disclosure'
import { StatusChip } from '../ui/chip'
import { surfaceCardClass } from '../ui/card'
import { openAttendanceEvidence } from '../../data/attendanceEvidenceSupabase'
import { formatHumanDate } from '../../lib/humanDates'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { cameraFailureCopy, classifyLocationError, locationFailureCopy, openSelfieCameraStream, type CameraFailureKind, type LocationFailureKind } from '../../domain/selfieCameraDomain'

/** How long the live preview may stay black before we send the person to the phone camera. */
const CAMERA_PREVIEW_TIMEOUT_MS = 6000

class LocationFailure extends Error {
  kind: LocationFailureKind
  constructor(kind: LocationFailureKind) { super(kind); this.kind = kind }
}

const stopStream = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop())
const formatTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' }) : '—'
const minutesOfDay = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
const minutesUntilShiftEnd = (current: string, end: string) => {
  const now = minutesOfDay(current)
  let finish = minutesOfDay(end)
  if (finish <= minutesOfDay('04:00') && now >= minutesOfDay('12:00')) finish += 24 * 60
  return finish - now
}

type AttendanceAction = 'check-in' | 'check-out'

export const SelfieAttendanceCard: FC = () => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const employeeId = useUserStore((state) => state.employeeId)
  const employees = useHrStore((state) => state.employees)
  const attendance = useHrStore((state) => state.attendance)
  const scheduleOverrides = useHrStore((state) => state.scheduleOverrides)
  const recordSelfieAttendance = useHrStore((state) => state.recordSelfieAttendance)
  const recordSelfieCheckOut = useHrStore((state) => state.recordSelfieCheckOut)
  const branches = useSettingsStore((state) => state.branches)
  const attendanceSettings = useSettingsStore((state) => state.attendance)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [action, setAction] = useState<AttendanceAction>('check-in')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const [locationStatus, setLocationStatus] = useState<string | null>(null)
  const [verifiedLocation, setVerifiedLocation] = useState<GeoPoint | null>(null)
  const [verifiedAction, setVerifiedAction] = useState<AttendanceAction | null>(null)
  const [cameraFailed, setCameraFailed] = useState(false)
  const [locationFailures, setLocationFailures] = useState<Record<AttendanceAction, number>>({ 'check-in': 0, 'check-out': 0 })

  const employee = useMemo(
    () => employees.find((item) => item.id === employeeId && item.systemRole === role && item.status === 'active'),
    [employees, employeeId, role],
  )
  const today = todayIsoDate()
  const todayRecord = employee ? attendance.find((record) => record.employeeId === employee.id && record.date === today) : undefined
  const attendanceBranch = branches.find((item) => item.id === todayRecord?.checkInLocation?.detectedBranchId) ?? undefined
  const todayShift = employee ? scheduleOverrides.find((item) => item.employeeId === employee.id && item.date === today)?.shift : undefined
  const jakartaNow = useMemo(() => nowInJakarta(), [clockTick])
  const currentTime = `${String(jakartaNow.getHours()).padStart(2, '0')}:${String(jakartaNow.getMinutes()).padStart(2, '0')}`
  const shiftMinutesRemaining = todayShift?.isWorking ? minutesUntilShiftEnd(currentTime, todayShift.endTime) : null
  const checkOutWindow = Boolean(todayRecord?.checkInAt && !todayRecord.checkOutAt && todayShift?.isWorking && shiftMinutesRemaining !== null && shiftMinutesRemaining <= attendanceSettings.checkoutGraceMinutes)
  const checkOutAvailable = checkOutWindow
  // Past the shift end (plus grace) the employee says why: overtime goes to HR, a late check-out is not paid.
  const checkOutAfterShift = shiftMinutesRemaining !== null && -shiftMinutesRemaining > attendanceSettings.checkoutGraceMinutes
  const [checkOutReason, setCheckOutReason] = useState<'overtime' | 'late_checkout' | null>(null)
  const [checkOutReasonNote, setCheckOutReasonNote] = useState('')
  const tr = useBilingualCopy()
  const attendanceComplete = Boolean(todayRecord?.checkInAt && todayRecord.checkOutAt)
  const shouldForceExpanded = !todayRecord?.checkInAt || checkOutWindow

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30_000)
    return () => { window.clearInterval(timer); stopStream(streamRef.current) }
  }, [])

  // Attach the stream only once React has mounted the <video>. Doing it from the
  // click handler raced the render and left some phones with a black box.
  useEffect(() => {
    if (!cameraOpen) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    let settled = false
    const fail = (kind: CameraFailureKind) => {
      if (settled) return
      settled = true
      stopStream(streamRef.current)
      streamRef.current = null
      setCameraOpen(false)
      setCameraFailed(true)
      const copy = cameraFailureCopy(kind)
      setError(tr(copy.en, copy.id))
    }
    video.srcObject = stream
    void video.play().catch(() => { /* the watchdog below decides whether a picture arrived */ })
    const watchdog = window.setTimeout(() => { if (video.videoWidth === 0) fail('no_preview') }, CAMERA_PREVIEW_TIMEOUT_MS)
    const track = stream.getVideoTracks?.()[0]
    const onEnded = () => fail('busy')
    track?.addEventListener('ended', onEnded)
    return () => {
      settled = true
      window.clearTimeout(watchdog)
      track?.removeEventListener('ended', onEnded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen])

  useEffect(() => {
    if (shouldForceExpanded) setExpanded(true)
    else if (todayRecord?.checkInAt && !checkOutWindow) setExpanded(false)
  }, [checkOutWindow, shouldForceExpanded, todayRecord?.checkInAt, todayRecord?.checkOutAt])

  if (role !== 'admin' && role !== 'florist' && role !== 'courier' && role !== 'manager') return null

  const openCamera = async (nextAction: AttendanceAction) => {
    stopStream(streamRef.current)
    streamRef.current = null
    setCameraOpen(false)
    setPhoto(null)
    setAction(nextAction)
    setError(null)
    setSuccess(null)
    setCameraFailed(false)
    const result = await openSelfieCameraStream(navigator.mediaDevices)
    if (!result.ok) {
      const copy = cameraFailureCopy(result.kind)
      setCameraFailed(true)
      setError(tr(copy.en, copy.id))
      return
    }
    streamRef.current = result.stream
    setCameraOpen(true)
  }

  const compressSource = async (source: string | File) => {
    setProcessing(true)
    setError(null)
    try {
      const compressed = await compressSelfieToSquareJpeg(source)
      setPhoto(compressed)
      setSuccess(null)
    } catch (caught) {
      setPhoto(null)
      setError(caught instanceof Error ? caught.message : 'The selfie could not be processed.')
    } finally {
      setProcessing(false)
    }
  }

  const capturePhoto = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setError(tr('The camera is not ready yet. Wait a moment and try again.', 'Kamera belum siap. Tunggu sebentar lalu coba lagi.'))
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    // Saved photo = what the person saw in the (mirrored) live preview.
    if (context) drawMirroredVideoFrame(context, video, canvas.width)
    // JPEG keeps the full-resolution frame small enough for low-memory phones.
    const raw = canvas.toDataURL('image/jpeg', 0.92)
    stopStream(streamRef.current)
    streamRef.current = null
    setCameraOpen(false)
    await compressSource(raw)
  }

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Select a valid image file.')
      return
    }
    stopStream(streamRef.current)
    streamRef.current = null
    setCameraOpen(false)
    setCameraFailed(false)
    await compressSource(file)
  }

  const readLocation = (options: PositionOptions): Promise<GeoPoint> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new LocationFailure('unsupported')); return }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy }),
      (failure) => reject(new LocationFailure(classifyLocationError(failure?.code))),
      options,
    )
  })

  // A cold GPS start indoors often needs more than one try. Retry once with a
  // longer wait before telling the person it failed; a blocked permission is final.
  const getCurrentLocation = async (): Promise<GeoPoint> => {
    try {
      return await readLocation({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
    } catch (failure) {
      if (failure instanceof LocationFailure && (failure.kind === 'timeout' || failure.kind === 'unavailable')) {
        return readLocation({ enableHighAccuracy: true, timeout: 25000, maximumAge: 30000 })
      }
      throw failure
    }
  }

  const verifyLocation = async (captureAction: AttendanceAction) => {
    if (!employee) {
      setError('No active employee record is linked to this account.')
      return
    }
    if (!branches.some((item) => item.isActive && item.location)) {
      setError('No active branch location is configured. Ask the Owner to set a branch map pin.')
      return
    }
    setProcessing(true)
    setAction(captureAction)
    setError(null)
    setSuccess(null)
    setVerifiedLocation(null)
    setVerifiedAction(null)
    setLocationStatus('Verifying your location…')
    try {
      const location = await getCurrentLocation()
      const nearest = findNearestAttendanceBranch(location, branches, attendanceSettings.locationRadiusMeters)
      if (!nearest || !nearest.withinAnyBranchRange) {
        setLocationFailures((previous) => ({ ...previous, [captureAction]: previous[captureAction] + 1 }))
        const detail = nearest ? `Nearest branch: ${nearest.branch.name} · ${nearest.distanceMeters} m away.` : 'No branch location is available.'
        setError(`${detail} Move within ${attendanceSettings.locationRadiusMeters} m of an active branch. Contact Admin or HR if GPS still cannot verify your location.`)
        setLocationStatus(null)
        return
      }
      setVerifiedLocation(location)
      setVerifiedAction(captureAction)
      setLocationFailures((previous) => ({ ...previous, [captureAction]: 0 }))
      setLocationStatus(`Location verified · ${nearest.distanceMeters} m from ${nearest.branch.name} · limit ${attendanceSettings.locationRadiusMeters} m`)
    } catch (caught) {
      setLocationFailures((previous) => ({ ...previous, [captureAction]: previous[captureAction] + 1 }))
      const copy = locationFailureCopy(caught instanceof LocationFailure ? caught.kind : 'unavailable')
      setError(tr(copy.en, copy.id))
      setLocationStatus(null)
    } finally {
      setProcessing(false)
    }
  }




  const submit = () => {
    if (!employee || !photo || !verifiedLocation || verifiedAction !== action) {
      setError(!employee
        ? 'No active employee record is linked to this account.'
        : !verifiedLocation || verifiedAction !== action
          ? 'Verify your location near an active branch before taking and submitting a selfie.'
          : 'Take or upload a selfie first.')
      return
    }
    setProcessing(true)
    const result = action === 'check-in'
      ? recordSelfieAttendance({ employeeId: employee.id, selfieDataUrl: photo, actor: { name: actorName, role }, location: verifiedLocation })
      : recordSelfieCheckOut({ employeeId: employee.id, selfieDataUrl: photo, actor: { name: actorName, role }, location: verifiedLocation, checkOutReason: checkOutAfterShift ? checkOutReason ?? undefined : undefined, checkOutReasonNote: checkOutAfterShift ? checkOutReasonNote : undefined })
    if (!result.ok) {
      setError(result.reason)
      setProcessing(false)
      return
    }
    setPhoto(null)
    setVerifiedLocation(null)
    setVerifiedAction(null)
    setLocationStatus(null)
    setCheckOutReason(null)
    setCheckOutReasonNote('')
    setSuccess(action === 'check-in' ? 'Check-in recorded successfully.' : 'Check-out recorded successfully.')
    setError(null)
    setProcessing(false)
  }

  const captureArea = (captureAction: AttendanceAction) => {
    const locationVerified = verifiedAction === captureAction && Boolean(verifiedLocation)
    return (
      <div className="mt-4 space-y-3">
        {!locationVerified && (
          <div className="rounded-xl border border-border bg-surface-panel p-3">
            <p className="text-sm font-semibold leading-5">1. Verify work location</p>
            <p className="mt-1 text-xs text-muted-foreground">Location must be verified before the selfie camera or upload is unlocked.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void verifyLocation(captureAction)} disabled={!employee || processing} className="h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                {processing && action === captureAction ? 'Verifying…' : locationFailures[captureAction] > 0 ? 'Try location again' : 'Verify location'}
              </button>
            </div>
            {locationFailures[captureAction] >= 2 && <p className="mt-2 text-xs text-warning">Location could not be verified. Contact Admin or HR to record or correct attendance.</p>}
          </div>
        )}

        {locationVerified && (
          <>
            <div className="rounded-xl border border-success/30 bg-success/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-success">Location verified</p>
                  <p className="mt-1 text-xs text-success">You may continue with the {captureAction} selfie.</p>
                </div>
                <button type="button" onClick={() => void verifyLocation(captureAction)} disabled={processing} className="text-xs font-semibold text-success underline">Check again</button>
              </div>
            </div>

            {captureAction === 'check-out' && checkOutAfterShift && (
              <fieldset className="space-y-2 rounded-xl border border-border bg-surface-panel p-3" data-testid="checkout-reason">
                <legend className="px-1 text-sm font-semibold leading-5">{tr('Why are you checking out after your shift?', 'Kenapa absen pulang lewat jam sif?')}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    ['overtime', tr('Overtime', 'Lembur'), tr('I worked extra time. HR will confirm it.', 'Saya bekerja lebih lama. HR akan mengonfirmasi.')],
                    ['late_checkout', tr('Late check-out', 'Telat absen pulang'), tr('I forgot or was late to check out. Not overtime.', 'Saya lupa/telat absen pulang. Bukan lembur.')],
                  ] as const).map(([value, label, hint]) => (
                    <label key={value} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${checkOutReason === value ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <input type="radio" name="checkout-reason" value={value} checked={checkOutReason === value} onChange={() => setCheckOutReason(value)} className="mt-0.5" />
                      <span><span className="block font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
                    </label>
                  ))}
                </div>
                {checkOutReason === 'overtime' && (
                  <textarea aria-label={tr('Overtime note', 'Catatan lembur')} value={checkOutReasonNote} onChange={(event) => setCheckOutReasonNote(event.target.value)} rows={2} maxLength={300} placeholder={tr('What did you work on? (optional)', 'Mengerjakan apa? (opsional)')} className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                )}
              </fieldset>
            )}

            <p className="text-sm font-semibold leading-5">2. Take selfie</p>
            {cameraOpen && action === captureAction && (
              <div className="mx-auto aspect-square max-w-sm overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
              </div>
            )}
            {photo && !cameraOpen && action === captureAction && (
              <div className="mx-auto max-w-sm">
                <img src={photo} alt={`${captureAction} selfie preview`} className="aspect-square w-full rounded-xl object-cover ring-1 ring-border" />
                <p className="mt-1 text-center text-2xs text-muted-foreground">Square JPEG · {(estimateDataUrlBytes(photo) / 1024).toFixed(1)} KB</p>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex flex-wrap gap-2">
              {!cameraOpen && (
                <button type="button" onClick={() => openCamera(captureAction)} disabled={!employee || processing} className="h-11 rounded-full bg-primary px-[18px] text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {photo && action === captureAction ? 'Retake selfie' : 'Open camera'}
                </button>
              )}
              {cameraOpen && action === captureAction && <button type="button" onClick={capturePhoto} disabled={processing} className="rounded-full bg-primary text-sm font-medium text-white rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Capture selfie</button>}
              <label className={`flex h-11 cursor-pointer items-center rounded-full px-[18px] text-sm font-medium ${cameraFailed ? 'bg-primary text-white' : 'border border-border hover:bg-accent'}`}>
                {processing ? tr('Processing…', 'Memproses…') : tr('Use phone camera', 'Pakai kamera HP')}
                <input aria-label={`Upload ${captureAction} selfie photo`} type="file" accept="image/*" capture="user" onChange={(event) => { setAction(captureAction); void handleUpload(event) }} disabled={processing} className="sr-only" />
              </label>
              {photo && action === captureAction && <button type="button" onClick={submit} disabled={processing || (captureAction === 'check-out' && checkOutAfterShift && !checkOutReason)} className="rounded-full bg-foreground text-sm font-medium text-background rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Submit {captureAction}</button>}
            </div>
          </>
        )}
      </div>
    )
  }


  const summaryLabel = attendanceComplete
    ? `Completed · ${formatTime(todayRecord?.checkInAt ?? todayRecord?.createdAt)}–${formatTime(todayRecord?.checkOutAt)}`
    : todayRecord?.checkInAt
      ? checkOutWindow
        ? `Check-out available · ${todayShift?.endTime ?? '—'}`
        : `Checked in · ${formatTime(todayRecord.checkInAt ?? todayRecord.createdAt)} · ${todayShift?.branchId ?? attendanceBranch?.name ?? 'Branch'}`
      : todayShift?.isWorking
        ? `Ready to check in · ${todayShift.branchId} · ${todayShift.startTime}`
        : todayShift && !todayShift.isWorking
          ? 'OFF today'
          : 'No schedule for today'

  return (
    <section aria-label="My attendance" className={surfaceCardClass('standard')}>
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock3 className="size-5 shrink-0 text-primary" />
            <h2 className="text-sm font-semibold leading-5">My attendance</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{summaryLabel}</p>
        </div>
        {expanded ? <ChevronUp className="size-5 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-5 shrink-0 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="mt-3 border-t border-border/70 pt-3">
          <p className="text-xs text-muted-foreground">{`Check in and check out with a square selfie for ${formatHumanDate(today)}.`}</p>
          {todayShift && (
            <div className="mt-3 rounded-xl bg-surface-panel px-3 py-2 text-xs">
              <span className="font-semibold">Scheduled:</span>{' '}
              {todayShift.isWorking ? `${todayShift.branchId} · ${todayShift.startTime}–${todayShift.endTime}` : 'OFF'}
            </div>
          )}

          {employee ? <p className="mt-3 text-xs text-muted-foreground">Linked employee: <span className="font-medium text-foreground">{employee.name}</span> · {employee.position}</p> : <p className="mt-3 rounded-lg bg-warning/10 p-3 text-xs text-warning">{`No active ${role} employee record is linked to this account.`}</p>}

          {!todayRecord && todayShift?.isWorking && captureArea('check-in')}
          {!todayRecord && !todayShift && <p className="mt-3 rounded-lg bg-warning/10 p-3 text-xs text-warning">A dated working schedule is required before check-in. Ask Admin or HR to schedule today.</p>}

          {todayRecord && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold leading-5">Check-in</p><StatusChip tone="success">Completed</StatusChip></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[96px_1fr]">
                  {todayRecord.selfieDataUrl && <button type="button" onClick={() => void openAttendanceEvidence(todayRecord.selfieDataUrl).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to open check-in evidence.'))} className="h-11 rounded-full border border-border px-4 text-xs font-medium text-primary">View check-in selfie</button>}
                  <div className="text-xs text-muted-foreground"><p className="font-medium text-foreground">{formatTime(todayRecord.checkInAt ?? todayRecord.createdAt)}</p><p>Recorded by {todayRecord.actor}</p></div>
                </div>
              </div>

              {todayRecord.checkOutAt ? (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold leading-5">Check-out</p><StatusChip tone="success">Completed</StatusChip></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[96px_1fr]">
                    {todayRecord.checkOutSelfieDataUrl && <button type="button" onClick={() => void openAttendanceEvidence(todayRecord.checkOutSelfieDataUrl).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to open check-out evidence.'))} className="h-11 rounded-full border border-border px-4 text-xs font-medium text-primary">View check-out selfie</button>}
                    <p className="text-xs font-medium">{formatTime(todayRecord.checkOutAt)}</p>
                  </div>
                </div>
              ) : checkOutAvailable ? (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                  <p className="text-sm font-semibold leading-5">Check-out available</p>
                <p className="mt-1 text-xs text-muted-foreground">{`Your shift ends at ${todayShift?.endTime}. Capture a new selfie to check out.`}</p>
                  {captureArea('check-out')}
                </div>
              ) : (
                <InfoDisclosure title="Check-out availability">
                <p>{`Check-out becomes available ${attendanceSettings.checkoutGraceMinutes} minutes before the end of today's dated shift${todayShift?.endTime ? ` at ${todayShift.endTime}` : ''}.`}</p>
                </InfoDisclosure>
              )}
            </div>
          )}

          {locationStatus && <p className="mt-3 rounded-lg bg-info/10 px-3 py-2 text-xs text-info">{locationStatus}</p>}
          {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          {success && <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{success}</p>}
          <InfoDisclosure title="About attendance" className="mt-3">
            <p>A dated working schedule, verified GPS location, and a new selfie are required. Failed GPS cannot be bypassed; Admin or HR must handle exceptions. Every selfie is center-cropped to 1:1, compressed to a JPEG no larger than 100 KB, and saved with the attendance record.</p>
          </InfoDisclosure>
        </div>
      )}
    </section>
  )
}
