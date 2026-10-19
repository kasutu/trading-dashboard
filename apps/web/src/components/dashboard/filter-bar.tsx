import type * as React from "react"
import { Globe } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { RANGES } from "@/hooks/use-filters"
import type { Filters, Range } from "@/lib/api/types"
import { LOCAL_TZ } from "@/lib/format"

const TIMEZONES = [...new Set([LOCAL_TZ, "UTC", "America/New_York", "Europe/London", "Asia/Tokyo"])]

type Props = {
  filters: Filters
  symbols: string[]
  onChange: <K extends keyof Filters>(k: K, v: Filters[K]) => void
  /** Extra controls at the end of the bar. */
  children?: React.ReactNode
}

export function FilterBar({ filters, symbols, onChange, children }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        className="rounded-full bg-muted p-0.5"
        value={filters.range}
        onValueChange={(v) => v && onChange("range", v as Range)}
        aria-label="Date range"
      >
        {RANGES.map(([k, label]) => (
          <ToggleGroupItem key={k} value={k} className="h-7 rounded-full px-3 font-mono text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-popover">{label}</ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Select value={filters.symbol} onValueChange={(v) => onChange("symbol", v)}>
        <SelectTrigger size="sm" className="w-36 bg-card" aria-label="Symbol"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All symbols</SelectItem>
          {symbols.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.side} onValueChange={(v) => onChange("side", v as Filters["side"])}>
        <SelectTrigger size="sm" className="w-36 bg-card" aria-label="Side"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Buy and sell</SelectItem>
          <SelectItem value="buy">Buy only</SelectItem>
          <SelectItem value="sell">Sell only</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.tz} onValueChange={(v) => onChange("tz", v)}>
        <SelectTrigger size="sm" className="bg-card sm:ml-auto" aria-label="Timezone">
          <Globe className="text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {TIMEZONES.map((z) => <SelectItem key={z} value={z}>{z === LOCAL_TZ ? `${z} (local)` : z}</SelectItem>)}
        </SelectContent>
      </Select>
      {children}
    </div>
  )
}
