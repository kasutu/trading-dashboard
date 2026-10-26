import * as React from "react"
import { Archive, Check, Pencil, Plus } from "lucide-react"
import { NAME_MAX } from "@/lib/journal"
import { cn } from "@/lib/utils"

/** `title` is also the accessible name, for chips whose label is short (like "A"). */
export type ChipOption = { value: string; label: React.ReactNode; title?: string }

/** Rename and archive the tags in place. The chips get an edit mode: each one becomes a field with an archive button. */
export type ManageTags = {
  rename: (id: string, name: string) => Promise<unknown>
  archive: (id: string) => Promise<unknown>
}

const chipClass = (on: boolean, size: "sm" | "md" = "md") =>
  cn(
    "inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border text-left whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out",
    "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95",
    size === "sm" ? "h-11 px-3 text-xs sm:h-7 sm:px-2.5" : "h-11 px-3.5 text-sm sm:h-8 sm:px-3",
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
  /** Shows a "+" chip that turns into a field. Called with the typed name. */
  onAdd?: (name: string) => Promise<unknown>
  /** Shows an edit chip to rename and archive the options. */
  manage?: ManageTags
  size?: "sm" | "md"
  /** Chips share the row equally, as wide buttons (for a short list such as Yes and No). */
  wide?: boolean
  className?: string
}

/** Pick one, as a radio group. */
export function ChoiceChips({ label, options, value, onChange, onAdd, manage, size, wide, className }: SingleProps) {
  const [editing, setEditing] = React.useState(false)
  const focusable = options.some((o) => o.value === value) ? value : options[0]?.value
  if (editing && manage) return <EditChips label={label} options={options} manage={manage} size={size} onDone={() => setEditing(false)} className={className} />
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", wide && "grid grid-cols-2 gap-2", className)}>
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
            className={cn(chipClass(on, size), wide && "h-10 justify-center text-sm")}
          >
            <span className="truncate">{o.label}</span>
          </button>
        )
      })}
      {onAdd && <AddChip label={label} onAdd={onAdd} size={size} />}
      {manage && options.length > 0 && <EditToggle label={label} size={size} onClick={() => setEditing(true)} />}
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
  /** Shows a "+" chip that turns into a field. Called with the typed name. */
  onAdd?: (name: string) => Promise<unknown>
  /** Shows an edit chip to rename and archive the options. */
  manage?: ManageTags
  size?: "sm" | "md"
  className?: string
}

/** Pick any number, as checkboxes. */
export function MultiChips({ label, options, value, onChange, none, onAdd, manage, size, className }: MultiProps) {
  const [editing, setEditing] = React.useState(false)
  if (editing && manage) return <EditChips label={label} options={options} manage={manage} size={size} onDone={() => setEditing(false)} className={className} />
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
      {onAdd && <AddChip label={label} onAdd={onAdd} size={size} />}
      {manage && options.length > 0 && <EditToggle label={label} size={size} onClick={() => setEditing(true)} />}
    </div>
  )
}

const roundChip = (size: "sm" | "md" = "md") =>
  cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95",
    size === "sm" ? "size-11 sm:size-7" : "size-11 sm:size-8"
  )

function EditToggle({ label, size, onClick }: { label: string; size?: "sm" | "md"; onClick: () => void }) {
  return (
    <button type="button" aria-label={`Rename or archive ${label}`} title="Rename or archive" onClick={onClick} className={roundChip(size)}>
      <Pencil className="size-3.5" />
    </button>
  )
}

/** Edit mode: each tag is a field (Enter or leaving it saves the new name) with an archive button. Escape or Done
 *  ends it. Archived tags drop out of the list; Settings can restore them. */
function EditChips({ label, options, manage, size = "md", onDone, className }: { label: string; options: ChipOption[]; manage: ManageTags; size?: "sm" | "md"; onDone: () => void; className?: string }) {
  const [error, setError] = React.useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  // Escape ends edit mode, not the dialog or sheet around it (see AddChip).
  const group = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !group.current?.contains(e.target as Node)) return
      e.stopPropagation()
      onDone()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onDone])
  const h = size === "sm" ? "h-11 sm:h-7 text-xs" : "h-11 sm:h-8 text-sm"
  return (
    <div ref={group} role="group" aria-label={`Edit ${label}`} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {options.map((o) => (
        <span key={o.value} className={cn("inline-flex items-center overflow-hidden rounded-full border border-foreground/30 bg-card pl-3", h)}>
          <TagField
            name={typeof o.label === "string" ? o.label : (o.title ?? "")}
            onSave={(name) => run(() => manage.rename(o.value, name))}
          />
          <button
            type="button"
            aria-label={`Archive ${typeof o.label === "string" ? o.label : (o.title ?? "")}`}
            title="Archive"
            onClick={() => run(() => manage.archive(o.value))}
            className="flex h-full cursor-pointer items-center px-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
          >
            <Archive className="size-3.5" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onDone} className={cn(chipClass(true, size), "gap-1")}>
        <Check className="size-3.5" /> Done
      </button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

function TagField({ name, onSave }: { name: string; onSave: (name: string) => Promise<unknown> }) {
  const [text, setText] = React.useState(name)
  // A rename from elsewhere (or a refused one) shows the stored name again.
  const [last, setLast] = React.useState(name)
  if (name !== last) {
    setLast(name)
    setText(name)
  }
  const save = () => {
    const t = text.trim()
    if (!t) setText(name)
    else if (t !== name) onSave(t)
  }
  return (
    <input
      value={text}
      maxLength={NAME_MAX}
      aria-label={`New name for ${name}`}
      size={Math.max(4, Math.min(text.length, 24))}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          save()
        }
      }}
      onBlur={save}
      className="min-w-0 bg-transparent outline-none"
    />
  )
}

/** A "+" chip that grows into a text field. Enter or leaving the field adds the name, Escape closes it. */
function AddChip({ label, onAdd, size = "md" }: { label: string; onAdd: (name: string) => Promise<unknown>; size?: "sm" | "md" }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const busy = React.useRef(false)
  const close = () => {
    setOpen(false)
    setName("")
    setError(null)
  }
  const submit = async () => {
    if (!name.trim()) return close()
    if (busy.current) return
    busy.current = true
    try {
      await onAdd(name.trim())
      close()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      busy.current = false
    }
  }
  // Escape closes the field, not the dialog or sheet around it. Radix listens on the document in the
  // capture phase, so catch the key earlier, on the window.
  const field = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target !== field.current) return
      e.stopPropagation()
      close()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open])
  const h = size === "sm" ? "h-11 sm:h-7" : "h-11 sm:h-8"
  return (
    <>
      <span
        className={cn(
          "inline-flex items-center overflow-hidden rounded-full border bg-card",
          h,
          open ? "w-44" : size === "sm" ? "w-11 sm:w-7" : "w-11 sm:w-8",
          error ? "border-destructive" : open && "border-foreground/40"
        )}
      >
        {open ? (
          <input
            ref={field}
            autoFocus
            value={name}
            maxLength={NAME_MAX}
            placeholder="New tag"
            aria-label={`New tag for ${label}`}
            aria-invalid={!!error}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                submit()
              }
            }}
            onBlur={submit}
            className={cn("w-full min-w-0 bg-transparent px-3 outline-none placeholder:text-muted-foreground", size === "sm" ? "text-xs" : "text-sm")}
          />
        ) : (
          <button
            type="button"
            aria-label={`Add a tag to ${label}`}
            title="Add a tag"
            onClick={() => setOpen(true)}
            className="flex size-full cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </span>
      {error && <span role="alert" className="self-center text-xs text-destructive">{error}</span>}
    </>
  )
}

/** A question title above its answers. */
export function Question({ id, children }: { id?: string; children: React.ReactNode }) {
  return <p id={id} className="mb-1.5 text-sm font-medium">{children}</p>
}
