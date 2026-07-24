export interface GeoPoint { latitude: number; longitude: number; accuracyMeters?: number }
export const distanceMeters = (a: GeoPoint, b: GeoPoint): number => {
  const r = 6371000
  const toRad = (v:number) => v * Math.PI / 180
  const dLat = toRad(b.latitude-a.latitude)
  const dLng = toRad(b.longitude-a.longitude)
  const lat1 = toRad(a.latitude), lat2 = toRad(b.latitude)
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2
  return 2*r*Math.asin(Math.sqrt(h))
}
const evaluateAttendanceLocation = (employee: GeoPoint, branch: GeoPoint, radiusMeters:number) => {
  const distance = distanceMeters(employee, branch)
  return { distanceMeters: Math.round(distance), withinRange: distance <= radiusMeters }
}


export interface AttendanceBranchPoint {
  id: string
  name: string
  location?: GeoPoint
  isActive?: boolean
}

export const findNearestAttendanceBranch = (
  employeeLocation: GeoPoint,
  branches: AttendanceBranchPoint[],
  radiusMeters: number,
) => {
  const candidates = branches
    .filter((branch) => branch.isActive !== false && branch.location)
    .map((branch) => ({
      branch,
      ...evaluateAttendanceLocation(employeeLocation, branch.location as GeoPoint, radiusMeters),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
  const nearest = candidates[0]
  return nearest ? { ...nearest, withinAnyBranchRange: nearest.withinRange } : undefined
}
