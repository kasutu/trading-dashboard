import { useJournalContext } from "@/hooks/use-journal"
import { today } from "@/lib/format"
import { JournalEditor } from "./journal-editor"

/** "Your day" at the top of the day sheet: the day's mood and note. */
export function DayJournal({ day }: { day: string }) {
  const j = useJournalContext()
  if (!j) return null
  const isToday = day === today(j.tz)

  return (
    <section className="rounded-xl border bg-card p-4 shadow-card" aria-label="Your day">
      <h3 className="mb-2 font-display text-base font-bold">Your day</h3>
      {j.journal ? (
        <JournalEditor
          key={day}
          entry={j.days.get(day)}
          prompt={isToday ? "How did today go?" : "How did this day go?"}
          onSave={(input) => j.save({ day }, input)}
        />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      )}
    </section>
  )
}
