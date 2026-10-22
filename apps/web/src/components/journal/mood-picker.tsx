import * as React from "react"
import type { Mood } from "@/lib/api/types"
import { MOODS, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"

type Props = {
  value: Mood | null
  /** Tapping the selected face clears it (null). */
  onChange: (mood: Mood | null) => void
  /** lg: bigger faces, for the check-in. */
  size?: "sm" | "lg"
  label?: string
  className?: string
}

/** Five faces from Awful to Great, as native radios (arrow keys work). Only the picked face shows its word. */
export function MoodPicker({ value, onChange, size = "sm", label = "Mood", className }: Props) {
  const lg = size === "lg"
  const name = React.useId()
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{label}</legend>
      <div className={cn("flex", lg ? "justify-between" : "gap-1")}>
        {MOODS.map((m) => {
          const on = value === m.value
          return (
            <label key={m.value} title={m.label} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={m.value}
                checked={on}
                // A click on the picked face clears it. Arrow keys only ever pick a new face.
                onChange={() => onChange(m.value)}
                onClick={() => on && onChange(null)}
                className="peer sr-only"
                aria-label={m.label}
              />
              <span
                aria-hidden
                className={cn(
                  "flex items-center justify-center rounded-full leading-none transition-[transform,opacity,filter,background-color] duration-200 ease-out",
                  "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 active:scale-90",
                  lg ? "size-14 text-4xl" : "size-9 text-xl",
                  on ? "scale-110 bg-muted" : value ? "opacity-40 grayscale hover:opacity-100 hover:grayscale-0" : "hover:bg-muted"
                )}
              >
                {m.emoji}
              </span>
            </label>
          )
        })}
      </div>
      {lg && (
        <p aria-hidden className="mt-2 h-5 text-center text-sm font-medium">{moodOf(value)?.label}</p>
      )}
    </fieldset>
  )
}
