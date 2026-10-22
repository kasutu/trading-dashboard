import * as React from "react"
import type { Mood } from "@/lib/api/types"
import { MOODS } from "@/lib/journal"
import { cn } from "@/lib/utils"

type Props = {
  value: Mood | null
  /** Tapping the selected face clears it (null). */
  onChange: (mood: Mood | null) => void
  /** sm: faces only. md: faces with labels. lg: bigger faces with labels, for the daily check-in. */
  size?: "sm" | "md" | "lg"
  label?: string
  className?: string
}

const SIZES = {
  sm: { button: "size-9 text-xl", label: false },
  md: { button: "flex-1 gap-0.5 py-2 text-2xl", label: true },
  lg: { button: "flex-1 gap-1 py-3 text-3xl sm:text-4xl", label: true },
}

/** Five faces from Awful to Great, as a radio group. Arrow keys move between faces, Enter or Space picks. */
export function MoodPicker({ value, onChange, size = "md", label = "Mood", className }: Props) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const s = SIZES[size]
  const focusable = value ?? MOODS[0].value

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    const to = e.key === "Home" ? 0 : e.key === "End" ? MOODS.length - 1 : step ? (i + step + MOODS.length) % MOODS.length : null
    if (to === null) return
    e.preventDefault()
    refs.current[to]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1", size !== "sm" && "w-full", className)}>
      {MOODS.map((m, i) => {
        const on = value === m.value
        return (
          <button
            key={m.value}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={m.label}
            title={size === "sm" ? m.label : undefined}
            tabIndex={m.value === focusable ? 0 : -1}
            onClick={() => onChange(on ? null : m.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-transparent leading-none transition-[background-color,border-color,opacity,filter,transform] duration-150 ease-out",
              "hover:bg-muted active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              s.button,
              on && "border-foreground/15 bg-muted",
              value && !on && "opacity-45 grayscale hover:opacity-100 hover:grayscale-0"
            )}
          >
            <span aria-hidden>{m.emoji}</span>
            {s.label && (
              <span aria-hidden className={cn("text-[11px] leading-tight text-muted-foreground", on && "font-medium text-foreground")}>{m.label}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
