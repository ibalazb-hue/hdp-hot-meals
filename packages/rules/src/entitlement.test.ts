import { describe, expect, it } from 'vitest'
import { adenDate } from './dates'
import { cardPayload, formatHhCode, isHhCode, parseCardPayload } from './codes'
import { decideScan, resolveArrival, type HouseholdSnapshot } from './entitlement'
import { reconciliationVariance } from './reconcile'
import { hashSecret, verifySecret } from './secret'

const home: HouseholdSnapshot = {
  hhCode: 'TZ-MDF01-000101',
  dpCode: 'MDF01',
  status: 'active',
  activeCardCode: 'CMDF01000101',
}

describe('household codes and Aden day', () => {
  it('formats TZ-{DP}-{6 digits} and reads a card payload', () => {
    expect(formatHhCode('MDF01', 101)).toBe('TZ-MDF01-000101')
    expect(isHhCode('tz-qah01-000201')).toBe(true)
    expect(isHhCode('TZ-MDF01-101')).toBe(false)
    const payload = cardPayload('CMDF01000101', 'TZ-MDF01-000101')
    expect(parseCardPayload(payload)).toEqual({ cardCode: 'CMDF01000101', hhCode: 'TZ-MDF01-000101' })
  })

  it('rolls the calendar day at midnight Asia/Aden (UTC+3)', () => {
    expect(adenDate('2026-10-27T20:30:00.000Z')).toBe('2026-10-27')
    expect(adenDate('2026-10-27T21:30:00.000Z')).toBe('2026-10-28')
  })
})

describe('entitlement', () => {
  it('serves an active card at the assigned distribution point', () => {
    const decision = decideScan({
      clientScanId: 'a',
      mode: 'card',
      cardCode: home.activeCardCode,
      dpCode: 'MDF01',
      household: home,
      existingSuccess: null,
    })
    expect(decision.result).toBe('Served')
    expect(decision.countsAsDistributed).toBe(true)
  })

  it('blocks a second distribution on the same day, even with a supervisor', () => {
    const decision = decideScan({
      clientScanId: 'b',
      mode: 'card',
      cardCode: home.activeCardCode,
      dpCode: 'MDF01',
      household: home,
      existingSuccess: { clientScanId: 'a', scannedAt: '2026-10-27T10:00:00.000Z', result: 'Served' },
      supervisorAuthorized: true,
    })
    expect(decision.blockReason).toBe('already_served')
    expect(decision.countsAsDistributed).toBe(false)
  })

  it('blocks a voided card and does not serve it', () => {
    const decision = decideScan({
      clientScanId: 'c',
      mode: 'card',
      cardCode: 'COLD',
      dpCode: 'MDF01',
      household: home,
      knownVoided: true,
      existingSuccess: null,
      supervisorAuthorized: true,
    })
    expect(decision.blockReason).toBe('voided')
  })

  it('blocks the wrong distribution point unless a supervisor authorises an override', () => {
    const blocked = decideScan({
      clientScanId: 'd',
      mode: 'card',
      cardCode: home.activeCardCode,
      dpCode: 'QAH01',
      household: home,
      existingSuccess: null,
    })
    expect(blocked.blockReason).toBe('wrong_dp')

    const override = decideScan({
      clientScanId: 'e',
      mode: 'card',
      cardCode: home.activeCardCode,
      dpCode: 'QAH01',
      household: home,
      existingSuccess: null,
      supervisorAuthorized: true,
    })
    expect(override.result).toBe('Override')
    expect(override.countsAsDistributed).toBe(true)
  })

  it('records a supervisor manual code as ManualException and still blocks a voided household', () => {
    const manual = decideScan({
      clientScanId: 'f',
      mode: 'manual',
      dpCode: 'QAH01',
      household: home,
      existingSuccess: null,
      supervisorAuthorized: true,
    })
    expect(manual.result).toBe('ManualException')

    const voided = decideScan({
      clientScanId: 'g',
      mode: 'manual',
      dpCode: 'MDF01',
      household: { ...home, activeCardCode: null },
      existingSuccess: null,
      supervisorAuthorized: true,
    })
    expect(voided.blockReason).toBe('voided')
  })

  it('lets the earlier offline Served win when the later one reached the server first', () => {
    const later: ExistingSuccess = {
      clientScanId: 'later',
      scannedAt: '2026-10-27T11:00:00.000Z',
      result: 'Served',
    }
    const incoming = decideScan({
      clientScanId: 'earlier',
      mode: 'card',
      cardCode: home.activeCardCode,
      dpCode: 'MDF01',
      household: home,
      existingSuccess: null,
    })
    const resolved = resolveArrival(incoming, later, {
      clientScanId: 'earlier',
      scannedAt: '2026-10-27T10:00:00.000Z',
    })
    expect(resolved.countsAsDistributed).toBe(true)
    expect(resolved.demoteExistingId).toBe('later')

    const loser = resolveArrival(incoming, later, {
      clientScanId: 'after',
      scannedAt: '2026-10-27T12:00:00.000Z',
    })
    expect(loser.blockReason).toBe('already_served')
    expect(loser.countsAsDistributed).toBe(false)
  })
})

describe('reconciliation', () => {
  it('alerts only when the gap is greater than 1%', () => {
    expect(reconciliationVariance(100, 99).alert).toBe(false)
    expect(reconciliationVariance(100, 98).alert).toBe(true)
    expect(reconciliationVariance(100, 102).reason).toBe('over_threshold')
    expect(reconciliationVariance(null, 10).reason).toBe('missing_production')
    expect(reconciliationVariance(0, 1).reason).toBe('zero_prepared')
  })
})

describe('secret hash', () => {
  it('verifies a matching secret and rejects a different one', () => {
    const stored = hashSecret('2468')
    expect(verifySecret('2468', stored)).toBe(true)
    expect(verifySecret('2469', stored)).toBe(false)
  })
})
