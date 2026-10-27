import { TRAINING_PASSWORD } from '@hdp/rules'
import { Panel } from '../components/ui'
import { useI18n, type CopyKey } from '../i18n'

const STEPS: CopyKey[] = ['sop1', 'sop2', 'sop3', 'sop4', 'sop5', 'sop6', 'sop7', 'sop8', 'sop9', 'sop10', 'sop11', 'sop12']

export function SopPage() {
  const { t } = useI18n()
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-bold">{t('sopTitle')}</h1>
      <ol className="grid gap-3">
        {STEPS.map((key, index) => (
          <li key={key}>
            <Panel>
              <span className="font-bold text-lagoon">{index + 1}.</span> {t(key)}
            </Panel>
          </li>
        ))}
      </ol>
      <Panel>
        <h2 className="font-bold">{t('sampleCards')}</h2>
        <ul className="mt-2 font-mono text-sm" dir="ltr">
          <li>HDP1|CMDF01000101|TZ-MDF01-000101</li>
          <li>HDP1|CMDF01000102|TZ-MDF01-000102</li>
          <li>CMDF01000103 voided</li>
          <li>HDP1|CQAH01000201|TZ-QAH01-000201</li>
        </ul>
        <p className="mt-2 text-sm" dir="ltr">
          {t('passwordShared')}: {TRAINING_PASSWORD}
        </p>
      </Panel>
    </div>
  )
}
