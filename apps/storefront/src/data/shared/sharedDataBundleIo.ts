import { applySharedDataBundleToLocalStores } from './sharedDataBundle'
import { fingerprintSharedDataBundle, validateSharedDataBundle } from './sharedDataBundleDomain'
import { SHARED_DATA_BUNDLE_KIND, SHARED_DATA_BUNDLE_VERSION, type SharedDataBundleV1 } from './sharedDataBundleTypes'

export interface SharedDataBundleEnvelopeV1 {
  format: typeof SHARED_DATA_BUNDLE_KIND
  version: typeof SHARED_DATA_BUNDLE_VERSION
  fingerprint: string
  data: SharedDataBundleV1
}

export const serializeSharedDataBundle = (bundle: SharedDataBundleV1, pretty = true): string => {
  const envelope: SharedDataBundleEnvelopeV1 = {
    format: SHARED_DATA_BUNDLE_KIND,
    version: SHARED_DATA_BUNDLE_VERSION,
    fingerprint: fingerprintSharedDataBundle(bundle),
    data: bundle,
  }
  return JSON.stringify(envelope, null, pretty ? 2 : 0)
}

export const parseSharedDataBundle = (jsonText: string): SharedDataBundleV1 => {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Shared-data file is not valid JSON.')
  }

  const record = parsed as Partial<SharedDataBundleEnvelopeV1>
  const bundle = record?.data as SharedDataBundleV1 | undefined
  if (!bundle || record.format !== SHARED_DATA_BUNDLE_KIND || record.version !== SHARED_DATA_BUNDLE_VERSION) {
    throw new Error('Unsupported Fleurstales shared-data file.')
  }
  const validation = validateSharedDataBundle(bundle)
  if (!validation.valid) throw new Error(`Invalid shared-data file: ${validation.errors.join(' ')}`)
  const fingerprint = fingerprintSharedDataBundle(bundle)
  if (record.fingerprint !== fingerprint) throw new Error('Shared-data fingerprint mismatch; the file may be incomplete or modified.')
  return bundle
}

export const importSharedDataBundleJson = (jsonText: string) => {
  const bundle = parseSharedDataBundle(jsonText)
  return applySharedDataBundleToLocalStores(bundle)
}

export const readSharedDataBundleFile = async (file: File): Promise<SharedDataBundleV1> =>
  parseSharedDataBundle(await file.text())

export const downloadSharedDataBundle = (bundle: SharedDataBundleV1, filename = 'fleurstales-shared-data.json'): void => {
  if (typeof document === 'undefined') throw new Error('Bundle download is only available in a browser.')
  const blob = new Blob([serializeSharedDataBundle(bundle)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
