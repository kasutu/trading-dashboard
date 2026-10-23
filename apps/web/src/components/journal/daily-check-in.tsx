import * as React from "react"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useDayAnswers } from "@/hooks/use-answers"
import { useJournalContext } from "@/hooks/use-journal"
import { useSettings } from "@/hooks/use-settings"
import type { DayReview } from "@/lib/api/types"
import { today } from "@/lib/format"
import { storage } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { FeelAnswer, RisksAnswer, WatchAnswer } from "./day-review"
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
        className="outline-none sm:max-w-md"
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

const STEPS = [
  { title: "How do you feel?", Answer: FeelAnswer },
  { title: "Anything in the way?", Answer: RisksAnswer },
  { title: "What are you watching?", Answer: WatchAnswer },
]

/** One question per step. Every answer is optional and saves as soon as it is given. */
function CheckIn({ day, onSkip, onDone }: { day: string; onSkip: () => void; onDone: () => void }) {
  const answers = useDayAnswers(day)
  const { v } = answers
  const [step, setStep] = React.useState(0)
  // Which way the last move went, so the next question slides in from that side.
  const [back, setBack] = React.useState(false)
  const any = !!v.preMood || v.risks.length > 0 || v.noRisks || v.watchSetupIds.length > 0
  const last = step === STEPS.length - 1
  const { title, Answer } = STEPS[step]
  const go = (to: number) => {
    setBack(to < step)
    setStep(to)
  }

  return (
    <>
      <div className="flex gap-1 pr-12 sm:pr-8" aria-hidden>
        {STEPS.map((s, k) => (
          <div key={s.title} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", k <= step ? "bg-foreground" : "bg-muted")} />
        ))}
      </div>
      <div
        key={step}
        className={cn("min-h-44 space-y-5 animate-in fade-in-0 duration-300", back ? "slide-in-from-left-6" : "slide-in-from-right-6")}
      >
        <DialogTitle className="font-display text-2xl font-bold">{title}</DialogTitle>
        <DialogDescription className="sr-only">Before you trade, question {step + 1} of {STEPS.length}. Optional.</DialogDescription>
        <Answer answers={answers} size="md" />
      </div>
      <div className="flex items-center gap-2">
        {step === 0 ? (
          <Button variant="ghost" onClick={onSkip}>Skip today</Button>
        ) : (
          <Button variant="ghost" onClick={() => go(step - 1)}><ChevronLeft /> Back</Button>
        )}
        {answers.state.kind === "error" && <SaveStatus state={answers.state} />}
        {last ? (
          // Done with nothing answered counts as a skip, so the check-in does not open again today.
          <Button className="ml-auto min-w-24" onClick={any ? onDone : onSkip}>Done</Button>
        ) : (
          <Button className="ml-auto min-w-24" onClick={() => go(step + 1)}>Next</Button>
        )}
      </div>
    </>
  )
}
