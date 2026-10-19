import * as React from "react"
import { CalendarClock, FileUp, ShieldCheck, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { FileButton } from "./file-button"

const FEATURES = [
  { icon: CalendarClock, title: "Timing", text: "Net P&L by hour, weekday and holding time." },
  { icon: Target, title: "Habits", text: "Daily trade caps, loss limits and trades after a loss." },
  { icon: ShieldCheck, title: "Private", text: "Your file stays in this browser. Nothing is uploaded." },
]

/** First screen: what Jurno does and a drop zone for the CSV file. */
export function Welcome({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = React.useState(false)
  return (
    <div className="mx-auto max-w-3xl pt-10 pb-16 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
        See which habits <span className="marker">cost you money</span>.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Add your broker trade history. Jurno charts your results and shows what to change.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
        className={cn(
          "mt-10 flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-card px-6 py-14 text-center transition-colors",
          over && "border-brand bg-highlight/20"
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <FileUp className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Drop your CSV file here</p>
          <p className="mt-1 text-sm text-muted-foreground">Exness and MetaTrader 5 exports work.</p>
        </div>
        <FileButton onFile={onFile}>Choose file</FileButton>
      </div>

      <ul className="mt-10 grid gap-6 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="space-y-1.5">
            <Icon className="size-4 text-muted-foreground" />
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
