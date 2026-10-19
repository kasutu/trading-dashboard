import { MARK } from "./mark"

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
        <path d={MARK.spine} className="fill-brand" />
        <path d={MARK.outline} className="stroke-foreground" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight">Jurno</span>
    </span>
  )
}
