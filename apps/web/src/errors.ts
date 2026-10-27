import { ApiError } from './api'
import { en, type CopyKey } from './i18n'

export function explainError(t: (key: CopyKey) => string, error: unknown): string {
  const code = error instanceof ApiError ? error.code : ''
  if (code === 'no_cache') return t('noCache')
  if (code && Object.prototype.hasOwnProperty.call(en, code)) return t(code as CopyKey)
  return t('processFailed')
}
