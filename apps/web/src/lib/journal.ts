import type { Mood } from "@/lib/api/types"

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 1, emoji: "😣", label: "Awful" },
  { value: 2, emoji: "😕", label: "Bad" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
]

export const moodOf = (m: Mood | null | undefined) => (m ? MOODS[m - 1] : undefined)

/** Longest note the API takes. */
export const NOTE_MAX = 500

/** The first non-empty line of a note, for one-line previews. */
export const firstLine = (note: string | null | undefined) => note?.split("\n").find((l) => l.trim())?.trim() ?? ""
