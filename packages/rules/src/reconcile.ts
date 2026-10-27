export interface VarianceResult {
  variance: number | null
  alert: boolean
  reason: 'missing_production' | 'zero_prepared' | 'over_threshold' | null
}

/**
 * Alert when prepared meals and unique counting scans differ by more than 1%.
 * Equality at exactly 1% does not alert. Missing production always alerts.
 * Unscanned meals stay in the gap; they are never added to the served count.
 */
export function reconciliationVariance(prepared: number | null, uniqueServed: number): VarianceResult {
  if (prepared === null) {
    return { variance: null, alert: true, reason: 'missing_production' }
  }
  if (prepared === 0) {
    return {
      variance: uniqueServed === 0 ? 0 : null,
      alert: uniqueServed > 0,
      reason: uniqueServed > 0 ? 'zero_prepared' : null,
    }
  }
  const variance = (prepared - uniqueServed) / prepared
  const alert = Math.abs(variance) > 0.01
  return { variance, alert, reason: alert ? 'over_threshold' : null }
}
