export function BrandLogos({ className = 'h-10' }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <img src="/logos/wfp.png" alt="WFP" className={`${className} w-auto object-contain`} />
      <img src="/logos/hdp.png" alt="Humanitarian Development Program" className={`${className} w-auto object-contain`} />
    </span>
  )
}
