import { describe, expect, it } from 'vitest'
import { checkGeofence, distanceMeters } from './geo'

describe('distanceMeters', () => {
  it('returns ~0 for the same point', () => {
    expect(distanceMeters(13.58, 44.02, 13.58, 44.02)).toBeLessThan(1)
  })

  it('measures a short Taiz offset', () => {
    const d = distanceMeters(13.58, 44.02, 13.581, 44.02)
    expect(d).toBeGreaterThan(90)
    expect(d).toBeLessThan(130)
  })
})

describe('checkGeofence', () => {
  const point = { latitude: 13.58, longitude: 44.02, gpsRadiusM: 150, gpsCheckActive: true }

  it('passes when check is off even without a fix', () => {
    expect(checkGeofence({ ...point, gpsCheckActive: false }, null).ok).toBe(true)
  })

  it('requires a fix when check is on', () => {
    const v = checkGeofence(point, null)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('location_required')
  })

  it('blocks outside the radius', () => {
    const v = checkGeofence(point, { latitude: 13.59, longitude: 44.02 })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('out_of_geofence')
  })

  it('allows inside the radius', () => {
    expect(checkGeofence(point, { latitude: 13.5802, longitude: 44.02 }).ok).toBe(true)
  })
})
