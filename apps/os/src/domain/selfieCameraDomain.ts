/**
 * Opening the in-page selfie camera fails for different reasons on different
 * phones. Each reason needs a different instruction, and several of them are
 * solved by retrying with simpler constraints or by using the phone's own
 * camera app (file input with capture) instead.
 */

export type CameraFailureKind =
  | 'unsupported' // no getUserMedia (in-app browser, old WebView, insecure context)
  | 'permission' // blocked by the user or the browser
  | 'not_found' // no camera on the device
  | 'busy' // camera held by another app / hardware error
  | 'no_preview' // stream opened but no picture ever arrived
  | 'unknown'

/** Most specific first. Some Android cameras reject square/size hints outright. */
export const SELFIE_CAMERA_ATTEMPTS: MediaStreamConstraints[] = [
  { video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false },
  { video: { facingMode: 'user' }, audio: false },
  { video: true, audio: false },
]

const errorName = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'name' in error ? String((error as { name?: unknown }).name) : ''

export const classifyCameraError = (error: unknown): CameraFailureKind => {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permission'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'not_found'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    default:
      return 'unknown'
  }
}

/** Retrying cannot help once the person or the browser said no, or there is no camera. */
const isFinalCameraFailure = (kind: CameraFailureKind) => kind === 'permission' || kind === 'not_found'

export type SelfieCameraResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; kind: CameraFailureKind }

export const openSelfieCameraStream = async (
  mediaDevices: Pick<MediaDevices, 'getUserMedia'> | undefined,
  attempts: MediaStreamConstraints[] = SELFIE_CAMERA_ATTEMPTS,
): Promise<SelfieCameraResult> => {
  if (!mediaDevices?.getUserMedia) return { ok: false, kind: 'unsupported' }
  let lastKind: CameraFailureKind = 'unknown'
  for (const constraints of attempts) {
    try {
      return { ok: true, stream: await mediaDevices.getUserMedia(constraints) }
    } catch (error) {
      lastKind = classifyCameraError(error)
      if (isFinalCameraFailure(lastKind)) break
    }
  }
  return { ok: false, kind: lastKind }
}

export const cameraFailureCopy = (kind: CameraFailureKind): { en: string; id: string } => {
  switch (kind) {
    case 'unsupported':
      return {
        en: 'This browser cannot open the camera here. Tap "Use phone camera" below, or open Fleurstales in Chrome or Safari.',
        id: 'Browser ini tidak bisa membuka kamera di sini. Ketuk "Pakai kamera HP" di bawah, atau buka Fleurstales di Chrome atau Safari.',
      }
    case 'permission':
      return {
        en: 'Camera access is blocked for this site. Tap "Use phone camera" below. To fix it permanently: tap the lock icon next to the address, then Permissions, then allow Camera, and reload.',
        id: 'Akses kamera untuk situs ini diblokir. Ketuk "Pakai kamera HP" di bawah. Supaya tidak terulang: ketuk ikon gembok di samping alamat situs, pilih Izin, izinkan Kamera, lalu muat ulang.',
      }
    case 'not_found':
      return {
        en: 'No camera was found on this device. Tap "Use phone camera" below or use another phone.',
        id: 'Kamera tidak ditemukan di perangkat ini. Ketuk "Pakai kamera HP" di bawah atau pakai HP lain.',
      }
    case 'busy':
      return {
        en: 'The camera is being used by another app. Close other camera or video-call apps, then try again, or tap "Use phone camera" below.',
        id: 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera atau video call, lalu coba lagi, atau ketuk "Pakai kamera HP" di bawah.',
      }
    case 'no_preview':
      return {
        en: 'The camera opened but no picture appeared. Tap "Use phone camera" below.',
        id: 'Kamera terbuka tetapi gambarnya tidak muncul. Ketuk "Pakai kamera HP" di bawah.',
      }
    default:
      return {
        en: 'The camera could not be opened. Tap "Use phone camera" below.',
        id: 'Kamera tidak bisa dibuka. Ketuk "Pakai kamera HP" di bawah.',
      }
  }
}

export type LocationFailureKind = 'unsupported' | 'permission' | 'unavailable' | 'timeout'

/** GeolocationPositionError.code: 1 permission denied, 2 position unavailable, 3 timeout. */
export const classifyLocationError = (code: number | undefined): LocationFailureKind =>
  code === 1 ? 'permission' : code === 3 ? 'timeout' : 'unavailable'

export const locationFailureCopy = (kind: LocationFailureKind): { en: string; id: string } => {
  switch (kind) {
    case 'unsupported':
      return {
        en: 'Location is not available in this browser. Open Fleurstales in Chrome or Safari.',
        id: 'Lokasi tidak tersedia di browser ini. Buka Fleurstales di Chrome atau Safari.',
      }
    case 'permission':
      return {
        en: 'Location access is blocked for this site. Tap the lock icon next to the address, then Permissions, allow Location, and reload. Also make sure location is turned on for your browser in the phone settings.',
        id: 'Akses lokasi untuk situs ini diblokir. Ketuk ikon gembok di samping alamat situs, pilih Izin, izinkan Lokasi, lalu muat ulang. Pastikan juga izin lokasi untuk browser aktif di pengaturan HP.',
      }
    case 'timeout':
      return {
        en: 'The phone took too long to find your location. Move closer to a window or the door, then try again.',
        id: 'HP terlalu lama mencari lokasi. Pindah ke dekat jendela atau pintu, lalu coba lagi.',
      }
    default:
      return {
        en: 'Your location could not be read. Turn on GPS / Location on the phone, then try again.',
        id: 'Lokasi tidak terbaca. Nyalakan GPS / Lokasi di HP, lalu coba lagi.',
      }
  }
}
