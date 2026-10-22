import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useJournalContext } from "@/hooks/use-journal"
import { useSettings } from "@/hooks/use-settings"
import type { Mood } from "@/lib/api/types"
import { today } from "@/lib/format"
import { NOTE_MAX } from "@/lib/journal"
import { storage } from "@/lib/storage"
import { MoodPicker } from "./mood-picker"

const skipKey = (accountId: string) => `jurno:mood-skipped:${accountId}`

/** The daily check-in. Opens with the dashboard when today has no mood, unless it was skipped today
 *  or turned off in Settings. Picking a face saves (with any note typed so far) and closes. */
export function DailyMoodDialog() {
  const j = useJournalContext()
  const { settings } = useSettings()
  // Decided once, when the journal first loads, so saving or refetching never reopens it.
  const [open, setOpen] = React.useState<boolean | null>(null)
  const [mood, setMood] = React.useState<Mood | null>(null)
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const day = j ? today(j.tz) : ""
  if (open === null && j?.journal) {
    setOpen(settings.askMood && !j.days.get(day)?.mood && storage.get(skipKey(j.accountId)) !== day)
  }
  // Turning the setting off closes it.
  if (open && !settings.askMood) setOpen(false)
  if (!j) return null

  const save = async (m: Mood | null, close: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await j.save({ day }, { mood: m, note: note.trim() || null })
      if (close) setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pick = (m: Mood | null) => {
    setMood(m)
    // One tap is the whole check-in. A note typed before it is saved with it.
    if (m) save(m, true)
  }

  const skip = () => {
    storage.set(skipKey(j.accountId), day)
    setOpen(false)
  }

  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(false)}>
      {/* Focus the dialog, not the first face, so no face looks picked before the user chooses. */}
      <DialogContent
        className="max-w-md outline-none"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
      >
        <div className="space-y-1 pr-6">
          <DialogTitle className="font-display text-xl font-bold">How are you feeling today?</DialogTitle>
          <DialogDescription>Pick a face to save it to today in your journal. Add a note first if you like.</DialogDescription>
        </div>
        <MoodPicker value={mood} onChange={pick} size="lg" label="How are you feeling today?" />
        <div className="space-y-1">
          <Textarea
            aria-label="Note"
            placeholder="Add a note (optional)"
            value={note}
            maxLength={NOTE_MAX}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            className="max-h-40 resize-none"
          />
          {note.length >= NOTE_MAX - 100 && (
            <p className="text-right font-mono text-xs text-muted-foreground">{note.length}/{NOTE_MAX}</p>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={skip} disabled={busy}>Skip today</Button>
          <Button onClick={() => save(mood, true)} disabled={busy || (!mood && !note.trim())}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
