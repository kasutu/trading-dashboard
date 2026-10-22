import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { TradeAnswers } from "@/hooks/use-answers"
import { createMistake, createSetup } from "@/hooks/use-api"
import { useJournalContext } from "@/hooks/use-journal"
import type { Grade, Mood, Position } from "@/lib/api/types"
import { price } from "@/lib/format"
import { GRADES, MISTAKE_GROUPS, NOTE_MAX, formatR, rFrom } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { ChoiceChips, MultiChips, Question } from "./chips"
import { MoodPicker } from "./mood-picker"

type Props = {
  position: Position
  answers: TradeAnswers
  /** Which questions to show. The review flow asks the plan, the setup and the mistakes on the card itself. */
  ask?: { plan?: boolean; mistakes?: boolean; setup?: boolean }
  size?: "sm" | "md"
  className?: string
}

/** Every question about one trade, text last: plan, setup, grade, mistakes, face, starting stop (only when the CSV
 *  stop looks moved), note. */
export function TradeReviewEditor({ position, answers, ask = { plan: true, mistakes: true }, size = "md", className }: Props) {
  const { v, set } = answers
  const id = React.useId()
  return (
    <div className={cn("space-y-4", className)}>
      {ask.plan && (
        <div>
          <Question>Did you follow your plan?</Question>
          <ChoiceChips
            label="Did you follow your plan?"
            size={size}
            options={[{ value: "yes", label: "On plan" }, { value: "no", label: "Off plan" }]}
            value={v.followedPlan === null ? null : v.followedPlan ? "yes" : "no"}
            onChange={(x) => set({ followedPlan: x === null ? null : x === "yes" })}
          />
        </div>
      )}
      {ask.setup !== false && <SetupQuestion value={v.setupId} onChange={(setupId) => set({ setupId })} size={size} />}
      <div>
        <Question>How good was the setup?</Question>
        <ChoiceChips
          label="How good was the setup?"
          size={size}
          options={GRADES.map((g) => ({ value: g, label: <span className="px-1 font-semibold">{g}</span>, title: `${g} setup` }))}
          value={v.grade}
          onChange={(g) => set({ grade: g as Grade | null })}
        />
      </div>
      {ask.mistakes && <MistakeQuestion answers={answers} size={size} />}
      <div>
        <Question>How did you feel?</Question>
        <MoodPicker value={v.mood} onChange={(mood: Mood | null) => set({ mood })} label="How did you feel?" />
      </div>
      {position.askStop && <StopQuestion position={position} answers={answers} />}
      <div className="space-y-1">
        <label htmlFor={`${id}-note`} className="mb-1.5 block text-sm font-medium">Anything else?</label>
        <Textarea
          id={`${id}-note`}
          placeholder="Add a note (optional)"
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

export function NoteCount({ length }: { length: number }) {
  if (length < NOTE_MAX - 100) return null
  return (
    <p className={cn("text-right font-mono text-xs text-muted-foreground", length >= NOTE_MAX && "text-loss")} aria-live="polite">
      {length}/{NOTE_MAX}
    </p>
  )
}

/** Setups, as chips. Archived ones only show when this trade already has one. */
export function SetupQuestion({ value, onChange, size }: { value: string | null; onChange: (id: string | null) => void; size?: "sm" | "md" }) {
  const j = useJournalContext()!
  const setups = j.tags?.setups.filter((s) => !s.archived || s.id === value) ?? []
  return (
    <div>
      <Question>Which setup was it?</Question>
      {j.tags ? (
        <ChoiceChips
          label="Which setup was it?"
          size={size}
          options={setups.map((s) => ({ value: s.id, label: s.name }))}
          value={value}
          onChange={onChange}
          onAdd={async (name) => onChange((await createSetup(name)).id)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  )
}

/** Mistake chips in their groups, and "None". */
export function MistakeQuestion({ answers, size, title = "What went wrong?" }: { answers: TradeAnswers; size?: "sm" | "md"; title?: string }) {
  const j = useJournalContext()!
  const { v, set } = answers
  const tags = j.tags?.mistakes.filter((m) => !m.archived || v.mistakeIds.includes(m.id)) ?? []
  return (
    <div>
      <Question>{title}</Question>
      <div className="space-y-2">
        {MISTAKE_GROUPS.map((g) => {
          const of = tags.filter((m) => m.group === g.value)
          if (!of.length) return null
          return (
            <div key={g.value} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
              <p className="w-24 shrink-0 pt-1 text-xs text-muted-foreground" aria-hidden>{g.label}</p>
              <MultiChips
                label={`${g.label} mistakes`}
                size={size}
                options={of.map((m) => ({ value: m.id, label: m.name }))}
                value={v.mistakeIds}
                onChange={(ids) => set({ mistakeIds: ids, noMistakes: false })}
                onAdd={async (name) => set({ mistakeIds: [...v.mistakeIds, (await createMistake(name, g.value)).id], noMistakes: false })}
              />
            </div>
          )
        })}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
          <span className="hidden w-24 shrink-0 sm:block" aria-hidden />
          <MultiChips
            label="No mistakes"
            size={size}
            options={[]}
            value={[]}
            onChange={() => {}}
            none={{ checked: v.noMistakes, label: "None", onChange: (on) => set({ noMistakes: on, mistakeIds: on ? [] : v.mistakeIds }) }}
          />
        </div>
      </div>
    </div>
  )
}

/** The starting stop, asked only when the CSV stop looks moved. Shows the result in R as you type. */
export function StopQuestion({ position: p, answers }: { position: Position; answers: TradeAnswers }) {
  const { v, set } = answers
  const id = React.useId()
  const [text, setText] = React.useState(() => (v.initialStop ?? p.stopLoss)?.toString() ?? "")
  // The moved CSV stop shown at first is a starting point to edit, not a mistake to flag.
  const [touched, setTouched] = React.useState(v.initialStop !== null)
  const n = text.trim() ? Number(text.replace(",", ".")) : null
  const wrongSide = n !== null && Number.isFinite(n) && (p.side === "buy" ? n >= p.openPrice : n <= p.openPrice)
  const invalid = n !== null && (!Number.isFinite(n) || n <= 0)
  const error = !touched ? null : invalid ? "Type a price." : wrongSide ? `For a ${p.side}, the starting stop is ${p.side === "buy" ? "below" : "above"} the entry (${price(p.openPrice)}).` : null
  const r = invalid || wrongSide ? null : rFrom(p, n)
  const unsaved = !invalid && !wrongSide && n !== v.initialStop

  const change = (t: string) => {
    setText(t)
    setTouched(true)
    const x = t.trim() ? Number(t.replace(",", ".")) : null
    const ok = x === null || (Number.isFinite(x) && x > 0 && (p.side === "buy" ? x < p.openPrice : x > p.openPrice))
    // Typing saves after a pause; the CSV stop shown at first needs a tap on Confirm.
    if (ok) set({ initialStop: x }, "later")
  }

  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-sm font-medium">Where was your stop when you entered?</label>
      <p id={`${id}-why`} className="mb-1.5 text-xs text-muted-foreground">
        {p.stopLoss === null ? "Your file has no stop for this trade." : `Your file says ${price(p.stopLoss)}, at or past the entry, so it was probably moved.`}
      </p>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={p.side === "buy" ? "Below the entry" : "Above the entry"}
          value={text}
          onChange={(e) => change(e.target.value)}
          onBlur={answers.flush}
          aria-invalid={!!error}
          aria-describedby={`${id}-why ${id}-r`}
          className="h-9 w-32 font-mono tabular-nums"
        />
        <span id={`${id}-r`} aria-live="polite" className={cn("font-mono text-sm font-medium tabular-nums", r === null ? "text-muted-foreground" : r > 0 ? "text-profit" : r < 0 ? "text-loss" : "")}>
          {r === null ? "—" : formatR(r)}
        </span>
        {unsaved && n !== null && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => set({ initialStop: n })}>Confirm</Button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
