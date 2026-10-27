export const ADEN_TZ = 'Asia/Aden'

/** Calendar day in Asia/Aden (UTC+3, no daylight saving), as YYYY-MM-DD. */
export function adenDate(input: Date | string | number = new Date()): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) {
    throw new Error('invalid_time')
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ADEN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error('invalid_time')
  }
  return `${year}-${month}-${day}`
}
