import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { db } from '../db'
import { useI18n } from '../i18n'

/** The supervisor code and name are shown only to the distribution focal. */
export function SupervisorNames() {
  const { session } = useAuth()
  const { t } = useI18n()
  const [names, setNames] = useState<string[]>([])
  const focal = session?.user.role === 'dp_focal'

  useEffect(() => {
    if (!focal) return
    void db.pins.toArray().then((rows) => {
      setNames(rows.map((row) => [row.username, row.displayName].filter(Boolean).join(' · ')))
    })
  }, [focal])

  if (!focal || names.length === 0) return null
  return (
    <p className="text-sm" dir="ltr">
      <span className="font-semibold">{t('supervisorOnDuty')}: </span>
      {names.join(' · ')}
    </p>
  )
}
