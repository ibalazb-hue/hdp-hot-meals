import { useEffect, useState } from 'react'
import { adenDate } from '@hdp/rules'
import { apiJson } from '../api'
import { useAuth } from '../auth'
import { db, type LocalScan } from '../db'
import { corrections, pendingCount } from '../submit'
import { useI18n, type CopyKey } from '../i18n'
import { Panel, SelectInput } from '../components/ui'

export function DashboardPage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const dps = session?.user.dpCodes ?? []
  const [dp, setDp] = useState(dps[0] ?? '')
  const [served, setServed] = useState(0)
  const [blocked, setBlocked] = useState(0)
  const [reasons, setReasons] = useState<Record<string, number>>({})
  const [pending, setPending] = useState(0)
  const [fixes, setFixes] = useState<LocalScan[]>([])

  useEffect(() => {
    const date = adenDate()
    void (async () => {
      const local = (await db.scans.where('scanDate').equals(date).toArray()).filter((scan) => !dp || scan.dpCode === dp)
      setPending(await pendingCount())
      setFixes((await corrections()).filter((scan) => !dp || scan.dpCode === dp))
      try {
        const remote = await apiJson<{ uniqueServed: number; blocked: number; byReason: Record<string, number> }>(
          `/api/dashboard?date=${date}${dp ? `&dp=${dp}` : ''}`,
        )
        setServed(remote.uniqueServed)
        setBlocked(remote.blocked)
        setReasons(remote.byReason)
      } catch {
        setServed(local.filter((scan) => scan.countsAsDistributed).length)
        setBlocked(local.filter((scan) => !scan.countsAsDistributed).length)
        const localReasons: Record<string, number> = {}
        for (const scan of local) {
          if (!scan.countsAsDistributed && scan.blockReason) localReasons[scan.blockReason] = (localReasons[scan.blockReason] ?? 0) + 1
        }
        setReasons(localReasons)
      }
    })()
  }, [dp])

  return (
    <div className="grid gap-4">
      {dps.length > 1 ? (
        <SelectInput value={dp} onChange={(event) => setDp(event.target.value)}>
          {dps.map((code) => (
            <option key={code}>{code}</option>
          ))}
        </SelectInput>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Panel>
          <p className="text-4xl font-bold text-served" data-testid="dash-served">
            {served}
          </p>
          <p>{t('servedToday')}</p>
        </Panel>
        <Panel>
          <p className="text-4xl font-bold text-blocked">{blocked}</p>
          <p>{t('blockedToday')}</p>
        </Panel>
      </div>
      <Panel>
        <p className="font-bold">
          {t('pending')}: {pending}
        </p>
        <ul className="mt-2 text-sm">
          {Object.entries(reasons).map(([reason, count]) => (
            <li key={reason}>
              {t(reason as CopyKey)}: {count}
            </li>
          ))}
        </ul>
      </Panel>
      {fixes.length > 0 ? (
        <Panel>
          <h2 className="font-bold text-warn">{t('corrections')}</h2>
          <p className="text-sm">{t('correctionHint')}</p>
          <ul className="mt-2 font-mono text-sm" dir="ltr">
            {fixes.map((scan) => (
              <li key={scan.id}>
                {scan.hhCode} · {scan.messageKey}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
