import type { DayRisk, Grade, MistakeGroup, Mood, Position, Side, TradeReview } from "@/lib/api/types"

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 1, emoji: "😣", label: "Awful" },
  { value: 2, emoji: "😕", label: "Bad" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
]

export const moodOf = (m: Mood | null | undefined) => (m ? MOODS[m - 1] : undefined)

export const GRADES: Grade[] = ["A", "B", "C"]

export const MISTAKE_GROUPS: { value: MistakeGroup; label: string }[] = [
  { value: "entry", label: "Entry" },
  { value: "exit", label: "Exit" },
  { value: "size", label: "Size and risk" },
  { value: "mindset", label: "Mindset" },
]

export const RISKS: { value: DayRisk; label: string }[] = [
  { value: "tired", label: "Tired" },
  { value: "news", label: "News day" },
  { value: "distracted", label: "Distracted" },
  { value: "chasing", label: "Chasing losses" },
]

/** Longest note the API takes. */
export const NOTE_MAX = 500
/** Longest setup or mistake tag name. */
export const NAME_MAX = 40

/** The first non-empty line of a note, for one-line previews. */
export const firstLine = (note: string | null | undefined) => note?.split("\n").find((l) => l.trim())?.trim() ?? ""

/** The plan question is the one the review flow asks, so a trade counts as reviewed once it is answered. */
export const isReviewed = (r: TradeReview | undefined) => r?.followedPlan != null

/** R from a starting stop, as the server computes it. For the live preview while typing a stop. */
export function rFrom(p: { side: Side; openPrice: number; closePrice: number }, stop: number | null) {
  if (stop === null || !Number.isFinite(stop) || stop === p.openPrice) return null
  const dir = p.side === "buy" ? 1 : -1
  return Math.round((((p.closePrice - p.openPrice) * dir) / Math.abs(p.openPrice - stop)) * 100) / 100
}

/** "+1.5R", "−0.8R" */
export const formatR = (r: number) => `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(Math.abs(r) >= 10 ? 0 : 1)}R`

/** Unreviewed positions of a day, oldest first. */
export const toReview = (positions: Position[], reviews: Map<string, TradeReview>, day: string) =>
  positions.filter((p) => p.day === day && !isReviewed(reviews.get(p.ticket))).sort((a, b) => a.open.localeCompare(b.open))
