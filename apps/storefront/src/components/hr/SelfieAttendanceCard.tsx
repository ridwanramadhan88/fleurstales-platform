import type { ChangeEvent, FC } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Clock3 } from 'lucide-react'
import { useHrStore, todayIsoDate } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { getBranchHoursForDate } from '../../domain/branchOpeningHoursDomain'
import { nowInJakarta } from '../../domain/orderTimingDomain'
import { compressSelfieToSquareJpeg, estimateDataUrlBytes } from '../../domain/selfieImageDomain'
import { findNearestAttendanceBranch, type GeoPoint } from '../../domain/attendanceLocationDomain'
import { InfoDisclosure } from '../ui/info-disclosure'
import { StatusChip } from '../ui/chip'
import { surfaceCardClass } from '../ui/card'

const stopStream = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop())
const formatTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
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
  const [reviewBranchId, setReviewBranchId] = useState<string | null>(null)
  const [locationFailures, setLocationFailures] = useState<Record<AttendanceAction, number>>({ 'check-in': 0, 'check-out': 0 })

  const employee = useMemo(
    () => employees.find((item) => item.id === employeeId && item.systemRole === role && item.status === 'active'),
    [employees, employeeId, role],
  )
  const today = todayIsoDate()
  const todayRecord = employee ? attendance.find((record) => record.employeeId === employee.id && record.date === today) : undefined
  const attendanceBranch = branches.find((item) => item.id === todayRecord?.checkInLocation?.detectedBranchId) ?? undefined
  const todayHours = getBranchHoursForDate(attendanceBranch, today)
  const todayShift = employee ? scheduleOverrides.find((item) => item.employeeId === employee.id && item.date === today)?.shift : undefined
  const jakartaNow = useMemo(() => nowInJakarta(), [clockTick])
  const currentTime = `${String(jakartaNow.getHours()).padStart(2, '0')}:${String(jakartaNow.getMinutes()).padStart(2, '0')}`
  const shiftMinutesRemaining = todayShift?.isWorking ? minutesUntilShiftEnd(currentTime, todayShift.endTime) : null
  const checkOutWindow = Boolean(todayRecord?.checkInAt && !todayRecord.checkOutAt && todayShift?.isWorking && shiftMinutesRemaining !== null && shiftMinutesRemaining <= 30)
  const checkOutAvailable = Boolean(todayRecord?.checkInAt && !todayRecord.checkOutAt && (
    checkOutWindow || (todayHours?.isOpen && currentTime >= todayHours.closesAt)
  ))
  const attendanceComplete = Boolean(todayRecord?.checkInAt && todayRecord.checkOutAt)
  const shouldForceExpanded = !todayRecord?.checkInAt || checkOutWindow

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30_000)
    return () => { window.clearInterval(timer); stopStream(streamRef.current) }
  }, [])

  useEffect(() => {
    if (shouldForceExpanded) setExpanded(true)
    else if (todayRecord?.checkInAt && !checkOutWindow) setExpanded(false)
  }, [checkOutWindow, shouldForceExpanded, todayRecord?.checkInAt, todayRecord?.checkOutAt])

  if (role !== 'admin' && role !== 'florist') return null

  const openCamera = async (nextAction: AttendanceAction) => {
    stopStream(streamRef.current)
    streamRef.current = null
    setCameraOpen(false)
    setPhoto(null)
    setAction(nextAction)
    setError(null)
    setSuccess(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is unavailable. Use the photo upload option below.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', aspectRatio: 1 }, audio: false })
      streamRef.current = stream
      setCameraOpen(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      })
    } catch {
      setError('Camera permission was denied. Allow camera access or upload a selfie photo.')
    }
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
      setError('Camera is not ready yet. Try again in a moment.')
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const raw = canvas.toDataURL('image/png')
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
    await compressSource(file)
  }

  const getCurrentLocation = (): Promise<GeoPoint> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Location services are unavailable on this device.')); return }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy }),
      () => reject(new Error('Location permission is required. Allow precise location and try again.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })

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
        setReviewBranchId(nearest?.branch.id ?? null)
        setLocationFailures((previous) => ({ ...previous, [captureAction]: previous[captureAction] + 1 }))
        const detail = nearest ? `Nearest branch: ${nearest.branch.name} · ${nearest.distanceMeters} m away.` : 'No branch location is available.'
        setError(`${detail} Move within ${attendanceSettings.locationRadiusMeters} m of any active branch before taking a selfie.`)
        setLocationStatus(null)
        return
      }
      setVerifiedLocation(location)
      setVerifiedAction(captureAction)
      setLocationFailures((previous) => ({ ...previous, [captureAction]: 0 }))
      const mismatch = Boolean(attendanceBranch && attendanceBranch.id !== nearest.branch.id)
      setLocationStatus(`Location verified · ${nearest.distanceMeters} m from ${nearest.branch.name} · limit ${attendanceSettings.locationRadiusMeters} m${mismatch ? ` · branch difference will be sent to HR review` : ''}`)
    } catch (caught) {
      setLocationFailures((previous) => ({ ...previous, [captureAction]: previous[captureAction] + 1 }))
      setError(caught instanceof Error ? caught.message : 'Location could not be verified.')
      setLocationStatus(null)
    } finally {
      setProcessing(false)
    }
  }


  const continueWithLocationReview = (captureAction: AttendanceAction) => {
    const reviewBranch = branches.find((branch) => branch.id === reviewBranchId && branch.isActive)
    if (!reviewBranch?.location) {
      setError('A nearby branch could not be identified. Try location verification again or ask HR for help.')
      return
    }
    setAction(captureAction)
    setVerifiedLocation({
      latitude: reviewBranch.location.latitude,
      longitude: reviewBranch.location.longitude,
      accuracyMeters: 999999,
    })
    setVerifiedAction(captureAction)
    setLocationStatus(`GPS could not be verified. Attendance will be recorded near ${reviewBranch.name} and sent to HR for review.`)
    setError(null)
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
      : recordSelfieCheckOut({ employeeId: employee.id, selfieDataUrl: photo, actor: { name: actorName, role }, location: verifiedLocation })
    if (!result.ok) {
      setError(result.reason)
      setProcessing(false)
      return
    }
    setPhoto(null)
    setVerifiedLocation(null)
    setVerifiedAction(null)
    setLocationStatus(null)
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
              {locationFailures[captureAction] >= 2 && (
                <button type="button" onClick={() => continueWithLocationReview(captureAction)} disabled={!employee || processing} className="h-11 rounded-full border border-warning/30 bg-warning/10 px-[18px] text-sm font-medium text-warning">
                  Continue for HR review
                </button>
              )}
            </div>
            {locationFailures[captureAction] >= 2 && <p className="mt-2 text-xs text-warning">After two failed GPS attempts, you can continue. HR will review the attendance record.</p>}
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

            <p className="text-sm font-semibold leading-5">2. Take selfie</p>
            {cameraOpen && action === captureAction && (
              <div className="mx-auto aspect-square max-w-sm overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
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
              <label className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
                {processing ? 'Compressing…' : 'Upload photo'}
                <input aria-label={`Upload ${captureAction} selfie photo`} type="file" accept="image/*" capture="user" onChange={(event) => { setAction(captureAction); void handleUpload(event) }} disabled={processing} className="sr-only" />
              </label>
              {photo && action === captureAction && <button type="button" onClick={submit} disabled={processing} className="rounded-full bg-foreground text-sm font-medium text-background rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Submit {captureAction}</button>}
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
        ? `Check-out due soon · ${todayShift?.endTime ?? todayHours?.closesAt ?? '—'}`
        : `Checked in · ${formatTime(todayRecord.checkInAt ?? todayRecord.createdAt)} · ${todayShift?.branchId ?? attendanceBranch?.name ?? 'Branch'}`
      : todayShift?.isWorking
        ? `Ready to check in · ${todayShift.branchId} · ${todayShift.startTime}`
        : todayShift && !todayShift.isWorking
          ? 'OFF today'
          : 'Attendance not started'

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
          <p className="text-xs text-muted-foreground">Check in and check out with a square selfie for {today}.</p>
          {todayShift && (
            <div className="mt-3 rounded-xl bg-surface-panel px-3 py-2 text-xs">
              <span className="font-semibold">Scheduled:</span>{' '}
              {todayShift.isWorking ? `${todayShift.branchId} · ${todayShift.startTime}–${todayShift.endTime}` : 'OFF'}
            </div>
          )}

          {employee ? <p className="mt-3 text-xs text-muted-foreground">Linked employee: <span className="font-medium text-foreground">{employee.name}</span> · {employee.position}</p> : <p className="mt-3 rounded-lg bg-warning/10 p-3 text-xs text-warning">No active {role} employee record is linked to this account.</p>}

          {!todayRecord && captureArea('check-in')}

          {todayRecord && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold leading-5">Check-in</p><StatusChip tone="success">Completed</StatusChip></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[96px_1fr]">
                  {todayRecord.selfieDataUrl && <img src={todayRecord.selfieDataUrl} alt="Check-in selfie" className="aspect-square h-24 w-24 rounded-lg object-cover ring-1 ring-border" />}
                  <div className="text-xs text-muted-foreground"><p className="font-medium text-foreground">{formatTime(todayRecord.checkInAt ?? todayRecord.createdAt)}</p><p>Recorded by {todayRecord.actor}</p></div>
                </div>
              </div>

              {todayRecord.checkOutAt ? (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold leading-5">Check-out</p><StatusChip tone="success">Completed</StatusChip></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[96px_1fr]">
                    {todayRecord.checkOutSelfieDataUrl && <img src={todayRecord.checkOutSelfieDataUrl} alt="Check-out selfie" className="aspect-square h-24 w-24 rounded-lg object-cover ring-1 ring-border" />}
                    <p className="text-xs font-medium">{formatTime(todayRecord.checkOutAt)}</p>
                  </div>
                </div>
              ) : checkOutAvailable ? (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                  <p className="text-sm font-semibold leading-5">Check-out available</p>
                  <p className="mt-1 text-xs text-muted-foreground">Your shift ends at {todayShift?.endTime ?? todayHours?.closesAt}. Capture a new selfie to check out.</p>
                  {captureArea('check-out')}
                </div>
              ) : (
                <InfoDisclosure title="Check-out availability">
                  <p>Check-out becomes available 30 minutes before your scheduled shift ends{todayShift?.endTime ? ` at ${todayShift.endTime}` : todayHours?.isOpen ? ` at ${todayHours.closesAt}` : ''}.</p>
                </InfoDisclosure>
              )}
            </div>
          )}

          {locationStatus && <p className="mt-3 rounded-lg bg-info/10 px-3 py-2 text-xs text-info">{locationStatus}</p>}
          {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          {success && <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">{success}</p>}
          <InfoDisclosure title="About attendance verification" className="mt-3">
            <p>GPS location is verified first and matched against the nearest active branch. A different branch is accepted and flagged for HR review. Every selfie is center-cropped to 1:1 and stored as a JPEG no larger than 100 KB in this demo browser state.</p>
          </InfoDisclosure>
        </div>
      )}
    </section>
  )
}
