import * as React from "react"
import { Check, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useDayAnswers, type DayAnswers } from "@/hooks/use-answers"
import { createSetup } from "@/hooks/use-api"
import { useJournalContext } from "@/hooks/use-journal"
import type { DayRisk, Mood } from "@/lib/api/types"
import { plural, today } from "@/lib/format"
import { NOTE_MAX, RISKS, toReview } from "@/lib/journal"
import { ChoiceChips, MultiChips, Question } from "./chips"
import { MoodPicker } from "./mood-picker"
import { SaveStatus } from "./save-status"
import { NoteCount } from "./trade-review-editor"

type BeforeProps = { answers: DayAnswers; size?: "sm" | "md" }

/** How you feel before trading: five faces. */
export function FeelAnswer({ answers }: BeforeProps) {
  const { v, set } = answers
  return <MoodPicker value={v.preMood} onChange={(preMood: Mood | null) => set({ preMood })} size="lg" label="How do you feel?" />
}

/** What could get in the way today, or None. */
export function RisksAnswer({ answers, size = "sm" }: BeforeProps) {
  const { v, set } = answers
  return (
    <MultiChips
      label="Anything in the way?"
      size={size}
      options={RISKS.map((r) => ({ value: r.value, label: r.label }))}
      value={v.risks}
      onChange={(risks) => set({ risks: risks as DayRisk[], noRisks: false })}
      none={{ checked: v.noRisks, onChange: (on) => set({ noRisks: on, risks: on ? [] : v.risks }) }}
    />
  )
}

/** The setups to watch for. Archived ones only show when already picked. */
export function WatchAnswer({ answers, size = "sm" }: BeforeProps) {
  const j = useJournalContext()!
  const { v, set } = answers
  if (!j.tags) return <p className="text-sm text-muted-foreground">Loading…</p>
  const setups = j.tags.setups.filter((s) => !s.archived || v.watchSetupIds.includes(s.id))
  return (
    <MultiChips
      label="Watching"
      size={size}
      options={setups.map((s) => ({ value: s.id, label: s.name }))}
      value={v.watchSetupIds}
      onChange={(watchSetupIds) => set({ watchSetupIds })}
      onAdd={async (name) => set({ watchSetupIds: [...v.watchSetupIds, (await createSetup(name)).id] })}
    />
  )
}

/** Before trading, all on one page (the day sheet): face, what could get in the way, setups to watch. */
export function DayBefore({ answers, isToday = true }: { answers: DayAnswers; isToday?: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <Question>{isToday ? "How do you feel?" : "How did you feel?"}</Question>
        <FeelAnswer answers={answers} />
      </div>
      <div>
        <Question>Anything in the way?</Question>
        <RisksAnswer answers={answers} />
      </div>
      <div>
        <Question>Watching</Question>
        <WatchAnswer answers={answers} />
      </div>
    </div>
  )
}

/** After trading, about the whole day (not one trade): did you stick to the plan, and one thing to change (text, last). */
export function DayAfter({ answers, size = "sm", isToday = true }: { answers: DayAnswers; size?: "sm" | "md"; isToday?: boolean }) {
  const { v, set } = answers
  const id = React.useId()
  return (
    <div className="space-y-4">
      <div>
        <Question>Overall, did you stick to your plan{isToday ? " today" : " that day"}?</Question>
        <p className="-mt-1 mb-2 text-xs text-muted-foreground">For the whole day, not one trade.</p>
        <ChoiceChips
          label="Overall, did you stick to your plan?"
          size={size}
          wide
          options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
          value={v.followedPlan === null ? null : v.followedPlan ? "yes" : "no"}
          onChange={(x) => set({ followedPlan: x === null ? null : x === "yes" })}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-note`} className="mb-1.5 block text-sm font-medium">One thing to change</label>
        <Textarea
          id={`${id}-note`}
          placeholder="Optional"
          value={v.note ?? ""}
          maxLength={NOTE_MAX}
          rows={2}
          onChange={(e) => set({ note: e.target.value }, "later")}
          onBlur={answers.flush}
          className="max-h-48 resize-none"
        />
        <NoteCount length={v.note?.length ?? 0} />
      </div>
    </div>
  )
}

/** "Your day" at the top of the day sheet: the trades to review, then the before- and after-trading questions. */
export function YourDay({ day }: { day: string }) {
  const j = useJournalContext()
  if (!j) return null
  return (
    <section className="rounded-xl border bg-card p-4 shadow-card" aria-label="Your day">
      {j.journal ? <YourDayBody key={day} day={day} /> : <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
    </section>
  )
}

function YourDayBody({ day }: { day: string }) {
  const j = useJournalContext()!
  const answers = useDayAnswers(day)
  const isToday = day === today(j.tz)
  const all = j.journal!.positions.filter((p) => p.day === day)
  const left = toReview(j.journal!.positions, j.trades, day).length
  return (
    <div className="space-y-4">
      <div className="flex min-h-7 items-center gap-2">
        <h3 className="font-display text-base font-bold">Your day</h3>
        <SaveStatus state={answers.state} className="ml-auto" />
      </div>
      {all.length > 0 &&
        (left ? (
          <Button className="w-full" onClick={() => j.review(day)}>
            <Layers /> Review trades <span className="font-mono tabular-nums opacity-70">{left}</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <Check className="size-4 text-profit" aria-hidden />
            <span>{all.length === 1 ? "Your trade is reviewed." : `All ${plural(all.length, "trade")} reviewed.`}</span>
            <Button variant="ghost" size="sm" className="-my-1 ml-auto h-7 px-2" onClick={() => j.review(day)}>Day questions</Button>
          </div>
        ))}
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Before trading</p>
        <DayBefore answers={answers} isToday={isToday} />
      </div>
      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">After trading</p>
        <DayAfter answers={answers} isToday={isToday} />
      </div>
    </div>
  )
}
