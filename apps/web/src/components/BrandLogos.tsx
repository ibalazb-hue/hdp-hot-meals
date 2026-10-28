import { useState } from 'react'

function LogoImg({
  src,
  alt,
  fallback,
  className,
}: {
  src: string
  alt: string
  fallback: string
  className: string
}) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        className={`${className} inline-flex min-w-[4.5rem] items-center justify-center rounded border border-dashed border-ink/40 bg-mist px-2 text-[10px] font-bold leading-tight text-ink`}
        title={`${alt} logo missing — add ${src.startsWith('data:') ? 'upload' : src}`}
      >
        {fallback}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`${className} w-auto object-contain print:opacity-100`}
      onError={() => setFailed(true)}
    />
  )
}

/** HDP + WFP logos for screen and print. Optional overrides from Admin card template. */
export function BrandLogos({
  className = 'h-10',
  showWfp = true,
  showHdp = true,
  wfpSrc,
  hdpSrc,
}: {
  className?: string
  showWfp?: boolean
  showHdp?: boolean
  wfpSrc?: string | null
  hdpSrc?: string | null
}) {
  if (!showWfp && !showHdp) return null
  return (
    <span className="inline-flex items-center gap-2">
      {showWfp ? (
        <LogoImg src={wfpSrc || '/logos/wfp.png'} alt="WFP" fallback="WFP logo" className={className} />
      ) : null}
      {showHdp ? (
        <LogoImg
          src={hdpSrc || '/logos/hdp.png'}
          alt="Humanitarian Development Program"
          fallback="HDP logo"
          className={className}
        />
      ) : null}
    </span>
  )
}
