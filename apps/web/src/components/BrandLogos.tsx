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
  layout = 'inline',
  showWfp = true,
  showHdp = true,
  wfpSrc,
  hdpSrc,
}: {
  className?: string
  /** inline = side-by-side; spread = one logo left, one logo right (full width) */
  layout?: 'inline' | 'spread'
  showWfp?: boolean
  showHdp?: boolean
  wfpSrc?: string | null
  hdpSrc?: string | null
}) {
  if (!showWfp && !showHdp) return null
  const wrap =
    layout === 'spread'
      ? 'flex w-full items-center justify-between gap-3'
      : 'inline-flex items-center gap-2'
  return (
    <span className={wrap}>
      {showWfp ? (
        <LogoImg src={wfpSrc || '/logos/wfp.png'} alt="WFP" fallback="WFP logo" className={className} />
      ) : (
        layout === 'spread' ? <span aria-hidden className="h-1 w-1" /> : null
      )}
      {showHdp ? (
        <LogoImg
          src={hdpSrc || '/logos/hdp.png'}
          alt="Humanitarian Development Program"
          fallback="HDP logo"
          className={className}
        />
      ) : (
        layout === 'spread' ? <span aria-hidden className="h-1 w-1" /> : null
      )}
    </span>
  )
}
