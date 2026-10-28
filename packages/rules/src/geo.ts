/** Earth-surface distance in metres (WGS84 sphere). */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const r = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)))
}

export interface GeofencePoint {
  latitude: number | null
  longitude: number | null
  gpsRadiusM: number
  gpsCheckActive: boolean
}

export type GeofenceVerdict =
  | { ok: true; distanceM: number | null }
  | { ok: false; reason: 'location_required' | 'out_of_geofence'; distanceM: number | null }

/**
 * When gpsCheckActive is false, always ok (location is still stored separately).
 * When active, a fix is required and must fall within gpsRadiusM of the point.
 */
export function checkGeofence(
  point: GeofencePoint,
  fix: { latitude: number; longitude: number } | null,
): GeofenceVerdict {
  if (!point.gpsCheckActive) {
    if (fix && point.latitude != null && point.longitude != null) {
      return { ok: true, distanceM: distanceMeters(fix.latitude, fix.longitude, point.latitude, point.longitude) }
    }
    return { ok: true, distanceM: null }
  }
  if (point.latitude == null || point.longitude == null) {
    return { ok: false, reason: 'location_required', distanceM: null }
  }
  if (!fix) return { ok: false, reason: 'location_required', distanceM: null }
  const distanceM = distanceMeters(fix.latitude, fix.longitude, point.latitude, point.longitude)
  if (distanceM > point.gpsRadiusM) {
    return { ok: false, reason: 'out_of_geofence', distanceM }
  }
  return { ok: true, distanceM }
}
