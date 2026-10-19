import * as React from "react"
import { hourLabel, hourShort, money, pct, plural, pnlClass } from "@/lib/format"
import type { Group } from "@/lib/api/types"
import { cn } from "@/lib/utils"

/** Weekday × hour grid. Hue shows profit or loss, strength shows size. */
export function Heatmap({ cells, weekdays }: { cells: Group[][]; weekdays: string[] }) {
  const [hover, setHover] = React.useState<{ d: number; h: number } | null>(null)
  const max = Math.max(1, ...cells.flat().map((c) => Math.abs(c.net)))
  const rows = cells.map((r, d) => ({ r, d })).filter(({ r, d }) => d < 5 || r.some((c) => c.trades))
  const cell = hover && cells[hover.d][hover.h]

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] gap-[3px]" style={{ gridTemplateColumns: "36px repeat(24, minmax(0,1fr))" }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center font-mono text-[10px] text-muted-foreground">
              {h % 3 === 0 ? hourShort(h) : ""}
            </div>
          ))}
          {rows.map(({ r, d }) => (
            <React.Fragment key={d}>
              <div className="flex items-center text-xs text-muted-foreground">{weekdays[d]}</div>
              {r.map((c, h) => {
                const strength = c.trades ? 0.15 + 0.85 * Math.min(1, Math.abs(c.net) / max) : 0
                const hue = c.net >= 0 ? "var(--profit)" : "var(--loss)"
                return (
                  <div
                    key={h}
                    onMouseEnter={() => setHover({ d, h })}
                    onMouseLeave={() => setHover(null)}
                    className={cn("h-6 rounded-[4px] bg-muted", hover?.d === d && hover?.h === h && "ring-2 ring-foreground/50")}
                    style={c.trades ? { background: `color-mix(in oklab, ${hue} ${Math.round(strength * 100)}%, var(--muted))` } : undefined}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        {cell && hover ? (
          <span>
            <span className="font-medium text-foreground">{weekdays[hover.d]} {hourLabel(hover.h)}</span>
            {" · "}{plural(cell.trades, "trade")}
            {cell.trades > 0 && (
              <>
                {" · "}<span className={cn("font-mono", pnlClass(cell.net))}>{money(cell.net, true)}</span>
                {" · "}{pct(cell.winRate)} win rate
              </>
            )}
          </span>
        ) : (
          <span>Point to a cell to see its numbers.</span>
        )}
        <span className="flex items-center gap-1.5">
          Loss
          <span className="h-2 w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--loss), var(--muted), var(--profit))" }} />
          Profit
        </span>
      </div>
    </div>
  )
}
