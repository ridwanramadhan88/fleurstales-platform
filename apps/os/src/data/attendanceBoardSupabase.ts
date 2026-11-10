import { getSupabaseAuthClient } from '../api/supabaseAuth'
import type { AttendanceBoardEntry } from '../domain/attendanceBoardDomain'

/** Daily attendance photo board (manager, HR reviewers, owner). */
export const fetchAttendanceBoard = async (date: string): Promise<AttendanceBoardEntry[]> => {
  const client = getSupabaseAuthClient()
  if (!client) return []
  const { data, error } = await client.rpc('get_attendance_photo_board', { p_date: date })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? (data as AttendanceBoardEntry[]) : []
}

/** Short-lived links for the selfies on the board. Missing photos are simply left out. */
export const signAttendancePhotos = async (paths: string[]): Promise<Record<string, string>> => {
  const client = getSupabaseAuthClient()
  const unique = [...new Set(paths.filter(Boolean))]
  if (!client || unique.length === 0) return {}
  const { data, error } = await client.storage.from('attendance-selfies').createSignedUrls(unique, 10 * 60)
  if (error || !data) return {}
  const signed: Record<string, string> = {}
  for (const item of data) {
    if (item.path && item.signedUrl) signed[item.path] = item.signedUrl
  }
  return signed
}
