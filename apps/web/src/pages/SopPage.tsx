import { TRAINING_PASSWORD } from '@hdp/rules'
import { PageHeader, Panel } from '../components/ui'
import { useI18n, type CopyKey } from '../i18n'

const STEPS: CopyKey[] = ['sop1', 'sop2', 'sop3', 'sop4', 'sop5', 'sop6', 'sop7', 'sop8', 'sop9', 'sop10', 'sop11', 'sop12']

export function SopPage() {
  const { t } = useI18n()
  return (
    <div className="grid gap-3">
      <PageHeader title={t('sopTitle')} subtitle={t('tileSop')} />
      <ol className="grid gap-3">
        {STEPS.map((key, index) => (
          <li key={key}>
            <Panel className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mist text-sm font-bold text-teal">
                {index + 1}
              </span>
              <p className="pt-1.5 text-sm leading-relaxed sm:text-base">{t(key)}</p>
            </Panel>
          </li>
        ))}
      </ol>
      <Panel>
        <h2 className="font-bold">{t('sampleCards')}</h2>
        <ul className="mt-2 space-y-1 font-mono text-sm" dir="ltr">
          <li className="rounded-lg bg-mist px-3 py-2">HDP1|CMDF01000101|TZ-MDF01-000101</li>
          <li className="rounded-lg bg-mist px-3 py-2">HDP1|CMDF01000102|TZ-MDF01-000102</li>
          <li className="rounded-lg bg-mist px-3 py-2">CMDF01000103 voided</li>
          <li className="rounded-lg bg-mist px-3 py-2">HDP1|CQAH01000201|TZ-QAH01-000201</li>
        </ul>
        <p className="mt-3 text-sm text-muted" dir="ltr">
          {t('passwordShared')}: {TRAINING_PASSWORD}
        </p>
      </Panel>
    </div>
  )
}
