import * as React from "react"
import { Check } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import type { JournalInput } from "@/lib/api/types"
import { NOTE_MAX } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { MoodPicker } from "./mood-picker"

type Props = {
  /** The saved entry. Read once when the editor mounts; give it a `key` to start over. */
  entry?: JournalInput | null
  onSave: (input: JournalInput) => Promise<void>
  /** The question above the faces. */
  prompt: string
  /** sm for tight spots (popover, trade card): faces without labels. */
  size?: "sm" | "md"
  autoFocus?: boolean
  /** Controls at the right of the prompt, such as a Done button. */
  action?: React.ReactNode
  className?: string
}

const DEBOUNCE_MS = 600

type Status = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }

/** Mood picker and note that save by themselves: a face at once, the note 600 ms after typing stops or on blur. */
export function JournalEditor({ entry, onSave, prompt, size = "md", autoFocus, action, className }: Props) {
  const [mood, setMood] = React.useState(entry?.mood ?? null)
  const [note, setNote] = React.useState(entry?.note ?? "")
  const [status, setStatus] = React.useState<Status>({ kind: "idle" })
  const id = React.useId()

  // Refs so the debounce timer and the unmount flush see the latest values.
  const start: JournalInput = { mood: entry?.mood ?? null, note: entry?.note ?? null }
  const latest = React.useRef(start)
  const saved = React.useRef(JSON.stringify(normal(start)))
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const save = React.useRef(onSave)
  React.useEffect(() => { save.current = onSave })

  const flush = React.useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    const input = normal(latest.current)
    const json = JSON.stringify(input)
    if (json === saved.current) return
    saved.current = json
    setStatus({ kind: "saving" })
    save.current(input).then(
      () => setStatus({ kind: "saved" }),
      (e: Error) => {
        saved.current = ""
        setStatus({ kind: "error", message: e.message })
      }
    )
  }, [])

  // Closing a popover or sheet mid-typing still saves the note.
  React.useEffect(() => () => { if (timer.current) flush() }, [flush])

  const pickMood = (m: JournalInput["mood"]) => {
    setMood(m)
    latest.current = { ...latest.current, mood: m }
    flush()
  }
  const typeNote = (v: string) => {
    setNote(v)
    latest.current = { ...latest.current, note: v }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, DEBOUNCE_MS)
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex min-h-7 items-center gap-2">
        <p id={`${id}-q`} className="text-sm font-medium">{prompt}</p>
        <SaveStatus status={status} />
        {action}
      </div>
      <MoodPicker value={mood} onChange={pickMood} size={size === "sm" ? "sm" : "md"} label={prompt} />
      <div className="space-y-1">
        <Textarea
          aria-label="Note"
          aria-describedby={`${id}-q`}
          placeholder="Add a note (optional)"
          value={note}
          maxLength={NOTE_MAX}
          rows={2}
          autoFocus={autoFocus}
          onChange={(e) => typeNote(e.target.value)}
          onBlur={() => timer.current && flush()}
          className="max-h-48 resize-none"
        />
        {note.length >= NOTE_MAX - 100 && (
          <p className={cn("text-right font-mono text-xs text-muted-foreground", note.length >= NOTE_MAX && "text-loss")} aria-live="polite">
            {note.length}/{NOTE_MAX}
          </p>
        )}
      </div>
    </div>
  )
}

/** Trimmed, with an empty note as null. */
const normal = (v: JournalInput): JournalInput => ({ mood: v.mood, note: v.note?.trim() || null })

function SaveStatus({ status }: { status: Status }) {
  return (
    <span role="status" className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
      {status.kind === "saving" && "Saving…"}
      {status.kind === "saved" && <><Check className="size-3.5 text-profit" aria-hidden /> Saved</>}
      {status.kind === "error" && <span className="text-destructive">{status.message}</span>}
    </span>
  )
}
