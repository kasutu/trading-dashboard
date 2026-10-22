import * as React from "react"
import { cn } from "@/lib/utils"

/** `title` is also the accessible name, for chips whose label is short (like "A"). */
export type ChipOption = { value: string; label: React.ReactNode; title?: string }

const chipClass = (on: boolean, size: "sm" | "md" = "md") =>
  cn(
    "inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border text-left whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out",
    "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95",
    size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
    on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
  )

/** Arrow keys move focus between the chips of a group. */
function onArrows(e: React.KeyboardEvent<HTMLButtonElement>) {
  const items = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(":scope > button") ?? [])]
  const i = items.indexOf(e.currentTarget)
  const n = items.length
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : step ? (i + step + n) % n : null
  if (to === null) return
  e.preventDefault()
  e.stopPropagation()
  items[to]?.focus()
}

type SingleProps = {
  label: string
  options: ChipOption[]
  value: string | null
  /** Tapping the picked chip clears it (null). */
  onChange: (value: string | null) => void
  size?: "sm" | "md"
  className?: string
}

/** Pick one, as a radio group. */
export function ChoiceChips({ label, options, value, onChange, size, className }: SingleProps) {
  const focusable = options.some((o) => o.value === value) ? value : options[0]?.value
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            aria-label={o.title}
            tabIndex={o.value === focusable ? 0 : -1}
            onClick={() => onChange(on ? null : o.value)}
            onKeyDown={onArrows}
            className={chipClass(on, size)}
          >
            <span className="truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

type MultiProps = {
  label: string
  options: ChipOption[]
  value: string[]
  onChange: (value: string[]) => void
  /** A "None" chip that clears the others. Picking another chip clears it. */
  none?: { checked: boolean; onChange: (checked: boolean) => void; label?: string }
  size?: "sm" | "md"
  className?: string
}

/** Pick any number, as checkboxes. */
export function MultiChips({ label, options, value, onChange, none, size, className }: MultiProps) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            title={o.title}
            aria-label={o.title}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            onKeyDown={onArrows}
            className={chipClass(on, size)}
          >
            <span className="truncate">{o.label}</span>
          </button>
        )
      })}
      {none && (
        <button
          type="button"
          role="checkbox"
          aria-checked={none.checked}
          onClick={() => none.onChange(!none.checked)}
          onKeyDown={onArrows}
          className={chipClass(none.checked, size)}
        >
          {none.label ?? "None"}
        </button>
      )}
    </div>
  )
}

/** A question title above its answers. */
export function Question({ id, children, hint }: { id?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <p id={id} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium">
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </p>
  )
}
