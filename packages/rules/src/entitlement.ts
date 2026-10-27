export const ROLES = ['dp_focal', 'meal', 'supervisor', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const SCAN_RESULTS = ['Served', 'Blocked', 'Override', 'ManualException'] as const
export type ScanResult = (typeof SCAN_RESULTS)[number]

export const BLOCK_REASONS = [
  'already_served',
  'voided',
  'wrong_dp',
  'unknown',
  'inactive',
  'no_card',
  'duplicate_conflict',
] as const
export type BlockReason = (typeof BLOCK_REASONS)[number]

export interface HouseholdSnapshot {
  hhCode: string
  dpCode: string
  status: 'active' | 'inactive'
  activeCardCode: string | null
}

export interface ExistingSuccess {
  clientScanId: string
  scannedAt: string
  result: 'Served' | 'Override' | 'ManualException'
}

export interface ScanInput {
  clientScanId: string
  mode: 'card' | 'manual'
  cardCode?: string | null
  dpCode: string
  household: HouseholdSnapshot | null
  /** The presented card is in issuance history and is not the active card. */
  knownVoided?: boolean
  existingSuccess: ExistingSuccess | null
  /** Supervisor PIN already checked by the caller. Required for manual and for a wrong-DP override. */
  supervisorAuthorized?: boolean
}

export interface ScanDecision {
  result: ScanResult
  blockReason: BlockReason | null
  countsAsDistributed: boolean
  hhCode: string | null
  messageKey: string
  demoteExistingId: string | null
  conflictNote: string | null
}

export function countsAsDistributed(result: ScanResult): boolean {
  return result === 'Served' || result === 'Override' || result === 'ManualException'
}

function blocked(blockReason: BlockReason, hhCode: string | null): ScanDecision {
  return {
    result: 'Blocked',
    blockReason,
    countsAsDistributed: false,
    hhCode,
    messageKey: blockReason,
    demoteExistingId: null,
    conflictNote: null,
  }
}

function accepted(
  result: 'Served' | 'Override' | 'ManualException',
  hhCode: string,
  messageKey: string,
): ScanDecision {
  return {
    result,
    blockReason: null,
    countsAsDistributed: true,
    hhCode,
    messageKey,
    demoteExistingId: null,
    conflictNote: null,
  }
}

/**
 * Entitlement decision for one scan. A supervisor cannot authorise a second
 * meal on the same Aden day, and cannot authorise a voided or inactive card.
 * Manual entry with a supervisor is recorded as ManualException, including at
 * another distribution point. A card scan at the wrong point is Blocked unless
 * a supervisor override with a reason was authorised, which is recorded as Override.
 */
export function decideScan(input: ScanInput): ScanDecision {
  const existing =
    input.existingSuccess && input.existingSuccess.clientScanId !== input.clientScanId
      ? input.existingSuccess
      : null

  if (!input.household) {
    return blocked(input.knownVoided ? 'voided' : 'unknown', null)
  }

  const hhCode = input.household.hhCode
  if (input.household.status !== 'active') return blocked('inactive', hhCode)

  if (input.mode === 'card') {
    const cardMatches = Boolean(input.cardCode) && input.cardCode === input.household.activeCardCode
    if (input.knownVoided || !cardMatches) return blocked('voided', hhCode)
  } else if (!input.household.activeCardCode) {
    return blocked('voided', hhCode)
  }

  if (existing) return blocked('already_served', hhCode)

  const wrongDp = input.household.dpCode !== input.dpCode
  if (input.mode === 'manual') {
    return accepted('ManualException', hhCode, 'manual_exception')
  }
  if (wrongDp) {
    if (input.supervisorAuthorized) return accepted('Override', hhCode, 'override')
    return blocked('wrong_dp', hhCode)
  }
  return accepted('Served', hhCode, 'served')
}

/**
 * When two offline devices both accepted a distribution, the earlier scannedAt
 * wins. An equal timestamp keeps the row already stored.
 * Returns a copy of the decision, possibly demoting the incoming scan or
 * naming the stored scan that must be demoted inside the same transaction.
 */
export function resolveArrival(
  decision: ScanDecision,
  existing: ExistingSuccess | null,
  incoming: { clientScanId: string; scannedAt: string },
): ScanDecision {
  if (!decision.countsAsDistributed || !existing || existing.clientScanId === incoming.clientScanId) {
    return decision
  }
  const incomingMs = Date.parse(incoming.scannedAt)
  const existingMs = Date.parse(existing.scannedAt)
  if (!Number.isNaN(incomingMs) && incomingMs < existingMs) {
    return {
      ...decision,
      demoteExistingId: existing.clientScanId,
      conflictNote: `Earlier scan replaced ${existing.clientScanId}`,
    }
  }
  return {
    result: 'Blocked',
    blockReason: 'already_served',
    countsAsDistributed: false,
    hhCode: decision.hhCode,
    messageKey: 'already_served',
    demoteExistingId: null,
    conflictNote: `Kept earlier scan ${existing.clientScanId}`,
  }
}
