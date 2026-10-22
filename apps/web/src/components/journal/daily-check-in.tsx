import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useDayAnswers } from "@/hooks/use-answers"
import { useJournalContext } from "@/hooks/use-journal"
import { useSettings } from "@/hooks/use-settings"
import type { DayReview } from "@/lib/api/types"
import { today } from "@/lib/format"
import { storage } from "@/lib/storage"
import { DayBefore } from "./day-review"
import { SaveStatus } from "./save-status"

const skipKey = (accountId: string) => `jurno:check-in-skipped:${accountId}`

/** Nothing before trading is answered yet. */
const unanswered = (d: DayReview | undefined) => !d || (!d.preMood && !d.risks.length && !d.noRisks && !d.watchSetupIds.length)

/** The before-trading check-in. Opens with the dashboard when today has no before-trading answers, unless it was
 *  skipped today or turned off in Settings. Every question is optional and saves as soon as it is answered. */
export function DailyCheckIn() {
  const j = useJournalContext()
  const { settings } = useSettings()
  // Decided once, when the journal first loads, so saving or refetching never reopens it.
  const [open, setOpen] = React.useState<boolean | null>(null)

  const day = j ? today(j.tz) : ""
  if (open === null && j?.journal && j.tags) {
    setOpen(settings.checkIn && unanswered(j.days.get(day)) && storage.get(skipKey(j.accountId)) !== day)
  }
  // Turning the setting off closes it.
  if (open && !settings.checkIn) setOpen(false)
  if (!j) return null

  const skip = () => {
    storage.set(skipKey(j.accountId), day)
    setOpen(false)
  }

  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(false)}>
      {/* Focus the dialog, not the first face, so nothing looks picked before the user chooses. */}
      <DialogContent
        className="max-w-md outline-none"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
      >
        {open && <CheckIn day={day} onSkip={skip} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CheckIn({ day, onSkip, onDone }: { day: string; onSkip: () => void; onDone: () => void }) {
  const answers = useDayAnswers(day)
  const { v } = answers
  const any = !!v.preMood || v.risks.length > 0 || v.noRisks || v.watchSetupIds.length > 0
  return (
    <>
      <div className="space-y-1 pr-6">
        <DialogTitle className="font-display text-xl font-bold">Before you trade</DialogTitle>
        <DialogDescription>A few taps for today's journal. Answer what you like.</DialogDescription>
      </div>
      <DayBefore answers={answers} size="lg" />
      <div className="flex items-center gap-2">
        <SaveStatus state={answers.state} />
        <Button variant="ghost" className="ml-auto" onClick={onSkip}>Skip today</Button>
        <Button onClick={onDone} disabled={!any}>Done</Button>
      </div>
    </>
  )
}
