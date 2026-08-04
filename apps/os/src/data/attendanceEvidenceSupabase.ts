import { getSupabaseAuthClient } from '../api/supabaseAuth'

const isDisplayUrl = (value: string): boolean =>
  value.startsWith('data:') || /^https?:\/\//i.test(value)

export const resolveAttendanceEvidenceUrl = async (value?: string): Promise<string> => {
  if (!value) throw new Error('Attendance evidence is unavailable.')
  if (isDisplayUrl(value)) return value

  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Storage is not configured.')

  const { data, error } = await client.storage
    .from('attendance-selfies')
    .createSignedUrl(value, 5 * 60)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Unable to authorize attendance evidence.')
  }
  return data.signedUrl
}

export const openAttendanceEvidence = async (value?: string): Promise<void> => {
  const popup = typeof window !== 'undefined' ? window.open('', '_blank') : null
  try {
    const url = await resolveAttendanceEvidenceUrl(value)
    if (popup) {
      popup.opener = null
      popup.location.href = url
      return
    }
    throw new Error('Allow pop-ups to open attendance evidence.')
  } catch (error) {
    popup?.close()
    throw error
  }
}
