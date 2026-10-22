import * as React from "react"
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, Undo2 } from "lucide-react"
import { SideBadge } from "@/components/dashboard/side-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useDayAnswers, useTradeAnswers } from "@/hooks/use-answers"
import { useJournalContext } from "@/hooks/use-journal"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import type { Position } from "@/lib/api/types"
import { formatDay, formatTime, money, plural, pnlClass, price, relativeDay, today } from "@/lib/format"
import { isReviewed, toReview } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { DayAfter } from "./day-review"
import { PlanDot, RValue } from "./review-bits"
import { SaveStatus } from "./save-status"
import { type Direction, Swipeable } from "./swipeable"
import { MistakeQuestion, TradeReviewEditor } from "./trade-review-editor"

const LEAVE_MS = 220

/** The review card stack for one day: one card per position not reviewed yet, oldest first, then the day questions. */
export function ReviewFlow({ day, onClose }: { day: string | null; onClose: () => void }) {
  return (
    <Dialog open={day !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[calc(100svh-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          // Focus the dialog itself, so arrow keys swipe at once and no chip looks picked.
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
      >
        {day && <Flow key={day} day={day} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function Flow({ day, onClose }: { day: string; onClose: () => void }) {
  const j = useJournalContext()!
  // The stack is fixed when it opens, so answering a card never reshuffles it.
  const [stack] = React.useState(() => toReview(j.journal?.positions ?? [], j.trades, day))
  const [i, setI] = React.useState(0)
  const done = i >= stack.length
  const p = stack[i]

  return (
    <>
      <div className="space-y-3 border-b px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 pr-6">
          {i > 0 && !done && (
            <Button variant="ghost" size="icon-sm" className="-ml-2" onClick={() => setI(i - 1)} aria-label="Previous trade">
              <ChevronLeft />
            </Button>
          )}
          <div className="min-w-0">
            <DialogTitle className="font-display text-lg font-bold">{done ? "Day reviewed" : "Review trades"}</DialogTitle>
            <DialogDescription className="text-sm">
              {relativeDay(day, j.tz)}
              {!done && <> · <span className="font-mono tabular-nums">{i + 1}</span> of <span className="font-mono tabular-nums">{stack.length}</span></>}
            </DialogDescription>
          </div>
        </div>
        {stack.length > 0 && (
          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out" style={{ width: `${(Math.min(i, stack.length) / stack.length) * 100}%` }} />
          </div>
        )}
      </div>
      {done ? (
        <DayDone day={day} reviewed={stack} onClose={onClose} />
      ) : (
        <ReviewCard key={p.ticket} position={p} left={stack.length - i - 1} onNext={() => setI(i + 1)} />
      )}
    </>
  )
}

/** Keys that answer a card, unless focus is in a field or a group that uses arrows itself. */
function useArrowKeys(on: Partial<Record<Direction, () => void>>) {
  const ref = React.useRef(on)
  React.useEffect(() => { ref.current = on })
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const dir = e.key === "ArrowRight" ? "right" : e.key === "ArrowLeft" ? "left" : null
      if (!dir) return
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, select, [role=radiogroup], [role=group]")) return
      e.preventDefault()
      ref.current[dir]?.()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
}

function ReviewCard({ position, left, onNext }: { position: Position; left: number; onNext: () => void }) {
  const j = useJournalContext()!
  // The latest copy, so R updates once a starting stop is saved.
  const p = j.positions.get(position.ticket) ?? position
  const answers = useTradeAnswers(p.ticket)
  const { v, set } = answers
  const reduced = useReducedMotion()
  // Off plan opens the mistake chips; coming back to a card answered off plan shows them again.
  const [mistakes, setMistakes] = React.useState(v.followedPlan === false)
  const [more, setMore] = React.useState(false)
  const [leaving, setLeaving] = React.useState<Direction | null>(null)
  const id = React.useId()

  const leave = (dir: Direction) => {
    if (leaving) return
    answers.flush()
    if (reduced) return onNext()
    setLeaving(dir)
    setTimeout(onNext, LEAVE_MS)
  }
  const onPlan = () => {
    if (leaving) return
    set({ followedPlan: true })
    leave("right")
  }
  const offPlan = () => {
    if (leaving) return
    set({ followedPlan: false })
    setMistakes(true)
  }
  const undo = () => {
    set({ followedPlan: null })
    setMistakes(false)
  }
  // Right moves on: "On plan", or "Next" once the card is answered off plan.
  const right = () => (mistakes ? leave("right") : onPlan())
  const leftAction = () => { if (!mistakes) offPlan() }
  useArrowKeys({ right, left: leftAction })

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <p className="sr-only" aria-live="polite">{`${p.symbol} ${p.side}, ${money(p.net, true)}. ${mistakes ? "Off plan. Pick what went wrong, then Next." : "On plan or off plan?"}`}</p>
        <div className="relative">
          {/* The cards still to come, peeking out under this one. */}
          {left > 1 && <div aria-hidden className="absolute inset-x-6 -bottom-4 h-12 rounded-xl border bg-card/60" />}
          {left > 0 && <div aria-hidden className="absolute inset-x-3 -bottom-2 h-12 rounded-xl border bg-card shadow-card" />}
          <Swipeable
            onSwipe={(d) => (d === "right" ? right() : leftAction())}
            onTap={() => setMore((m) => !m)}
            leaving={leaving}
            hints={{ left: "Off plan", right: mistakes ? "Next" : "On plan" }}
            className={cn("rounded-xl border bg-card shadow-card", !reduced && "animate-in fade-in-0 zoom-in-95 duration-200")}
          >
            <div className="cursor-pointer p-4" aria-describedby={`${id}-hint`}>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-bold">{p.symbol}</span>
                <SideBadge side={p.side} />
                <span className="text-xs text-muted-foreground">{p.lots} lots</span>
                <span className={cn("ml-auto font-mono text-lg font-semibold tabular-nums", pnlClass(p.net))}>{money(p.net, true)}</span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">{p.day === today(j.tz) ? "" : `${formatDay(p.day)}, `}{formatTime(p.open, j.tz)}</span>
                {v.followedPlan !== null && <span className="inline-flex items-center gap-1.5"><PlanDot value={v.followedPlan} />{v.followedPlan ? "On plan" : "Off plan"}</span>}
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                <Mini label="Entry" value={price(p.openPrice)} />
                <Mini label="Exit" value={price(p.closePrice)} />
                <Mini label="Result" value={p.r === null ? "—" : <RValue r={p.r} />} />
              </dl>
            </div>

            {mistakes && (
              <div className="border-t p-4">
                <MistakeQuestion answers={answers} size="sm" />
              </div>
            )}

            <div className="border-t">
              <button
                type="button"
                onClick={() => setMore((m) => !m)}
                aria-expanded={more}
                aria-controls={`${id}-more`}
                className="flex w-full cursor-pointer items-center gap-1.5 px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {more ? "Less" : "More"}
                <span className="truncate text-xs">{more ? "" : p.askStop ? "Setup, grade, feeling, starting stop, note" : "Setup, grade, feeling, note"}</span>
                <ChevronDown className={cn("ml-auto size-4 shrink-0 transition-transform", more && "rotate-180")} aria-hidden />
              </button>
              {more && (
                <div id={`${id}-more`} className="border-t p-4">
                  <TradeReviewEditor position={p} answers={answers} ask={{}} size="sm" />
                </div>
              )}
            </div>
          </Swipeable>
        </div>
        <p id={`${id}-hint`} className="mt-5 text-center text-xs text-muted-foreground">
          {mistakes ? "Pick what went wrong, then Next." : "Swipe right if you followed your plan, left if not."}
          <span className="hidden sm:inline"> Arrow keys work too.</span>
        </p>
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-4">
        {mistakes ? (
          <Button variant="outline" className="flex-1" onClick={undo}>
            <Undo2 /> Undo
          </Button>
        ) : (
          <Button variant="outline" className="flex-1 text-loss" onClick={offPlan}>
            <ArrowLeft /> Off plan
          </Button>
        )}
        <SaveStatus state={answers.state} className="w-16 justify-center" />
        <Button className={cn("flex-1", !mistakes && "bg-profit text-white hover:bg-profit/90")} onClick={right}>
          {mistakes ? "Next" : "On plan"} <ArrowRight />
        </Button>
      </div>
    </>
  )
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-sm tabular-nums">{value}</dd>
    </div>
  )
}

/** After the last card: what was reviewed, then the after-trading questions for the day. */
function DayDone({ day, reviewed, onClose }: { day: string; reviewed: Position[]; onClose: () => void }) {
  const j = useJournalContext()!
  const answers = useDayAnswers(day)
  const reduced = useReducedMotion()
  const [leaving, setLeaving] = React.useState<Direction | null>(null)
  const isToday = day === today(j.tz)
  const on = reviewed.filter((p) => j.trades.get(p.ticket)?.followedPlan === true).length
  const off = reviewed.filter((p) => j.trades.get(p.ticket)?.followedPlan === false).length
  const all = j.journal?.positions.filter((p) => p.day === day) ?? []
  const net = all.reduce((s, p) => s + p.net, 0)
  // The question card stays until it has flown off.
  const answered = answers.v.followedPlan !== null && !leaving

  const answer = (yes: boolean) => {
    answers.set({ followedPlan: yes })
    if (reduced) return
    setLeaving(yes ? "right" : "left")
    setTimeout(() => setLeaving(null), LEAVE_MS)
  }
  useArrowKeys(answered || leaving ? {} : { right: () => answer(true), left: () => answer(false) })

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-profit/15">
            <Check className="size-5 text-profit" aria-hidden />
          </span>
          <div className="text-sm">
            <p className="font-medium">
              {reviewed.length ? `${plural(reviewed.length, "trade")} reviewed` : all.length && all.every((p) => isReviewed(j.trades.get(p.ticket))) ? "Every trade is reviewed" : "No trades on this day"}
            </p>
            {reviewed.length > 0 && (
              <p className="text-muted-foreground">
                {on} on plan · {off} off plan · <span className={cn("font-mono tabular-nums", pnlClass(net))}>{money(net, true)}</span> on the day
              </p>
            )}
          </div>
        </div>

        <div>
          {answered ? (
            <DayAfter answers={answers} isToday={isToday} />
          ) : (
            <>
              <Swipeable
                onSwipe={(d) => answer(d === "right")}
                leaving={leaving}
                hints={{ left: "No", right: "Yes" }}
                className="rounded-xl border bg-card p-5 text-center shadow-card"
              >
                <p className="font-display text-lg font-bold">Did you stick to your plan{isToday ? " today" : ""}?</p>
                <p className="mt-1 text-sm text-muted-foreground">Swipe right for yes, left for no.</p>
              </Swipeable>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1 text-loss" onClick={() => answer(false)}><ArrowLeft /> No</Button>
                <Button className="flex-1 bg-profit text-white hover:bg-profit/90" onClick={() => answer(true)}>Yes <ArrowRight /></Button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-4">
        <SaveStatus state={answers.state} />
        <Button className="ml-auto" onClick={() => { answers.flush(); onClose() }}>Done</Button>
      </div>
    </>
  )
}
