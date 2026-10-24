import * as React from "react"
import { Globe, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { RANGES } from "@/hooks/use-filters"
import { useNarrow } from "@/hooks/use-media"
import type { Filters, Range } from "@/lib/api/types"
import { LOCAL_TZ, tzLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

/** A segmented pill toggle: put `pillGroup` on the ToggleGroup and `pillItem` on each item. 44px tall on phones. */
export const pillGroup = "rounded-full bg-muted p-0.5"
export const pillItem =
  "h-10 rounded-full px-3 font-mono text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm sm:h-7 dark:data-[state=on]:bg-popover"

const TIMEZONES = [...new Set([LOCAL_TZ, "UTC", "America/New_York", "Europe/London", "Asia/Tokyo"])]
const DEFAULTS: Filters = { range: "all", symbol: "all", side: "all", tz: LOCAL_TZ }

type Props = {
  filters: Filters
  symbols: string[]
  onChange: <K extends keyof Filters>(k: K, v: Filters[K]) => void
  /** Extra controls at the end of the bar. */
  children?: React.ReactNode
}

/** Range, symbol, side and timezone. Inline from md; on phones one Filters button that opens a sheet. */
export function FilterBar(props: Props) {
  const narrow = useNarrow()
  return narrow ? <FilterButton {...props} /> : <InlineFilters {...props} />
}

function InlineFilters({ filters, symbols, onChange, children }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RangeToggle filters={filters} onChange={onChange} />
      <SymbolSelect filters={filters} symbols={symbols} onChange={onChange} className="w-36" />
      <SideSelect filters={filters} onChange={onChange} className="w-36" />
      <TzSelect filters={filters} onChange={onChange} className="ml-auto" />
      {children}
    </div>
  )
}

function FilterButton({ filters, symbols, onChange, children }: Props) {
  const [open, setOpen] = React.useState(false)
  const active = (Object.keys(DEFAULTS) as (keyof Filters)[]).filter((k) => filters[k] !== DEFAULTS[k]).length
  const range = RANGES.find(([k]) => k === filters.range)?.[1]
  const summary = [
    filters.range === "all" ? "All time" : `Last ${range}`,
    filters.symbol !== "all" && filters.symbol,
    filters.side !== "all" && (filters.side === "buy" ? "Buy only" : "Sell only"),
  ].filter(Boolean).join(", ")

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={active ? `Filters, ${active} on` : "Filters"}>
        <SlidersHorizontal /> Filters
        {active > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-foreground font-mono text-[11px] text-background">{active}</span>
        )}
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{summary}</span>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <div className="space-y-1 pr-10">
            <DialogTitle className="font-display text-xl font-bold">Filters</DialogTitle>
            <DialogDescription>They apply to every tab except Funding.</DialogDescription>
          </div>
          <div className="space-y-2">
            <Label id="filter-range">Date range</Label>
            <RangeToggle filters={filters} onChange={onChange} className="grid w-full grid-cols-4" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-symbol">Symbol</Label>
            <SymbolSelect id="filter-symbol" filters={filters} symbols={symbols} onChange={onChange} className="w-full" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-side">Side</Label>
            <SideSelect id="filter-side" filters={filters} onChange={onChange} className="w-full" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-tz">Timezone</Label>
            <TzSelect id="filter-tz" filters={filters} onChange={onChange} className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="outline"
              disabled={!active}
              onClick={() => (Object.keys(DEFAULTS) as (keyof Filters)[]).forEach((k) => onChange(k, DEFAULTS[k]))}
            >
              Reset
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Part = Pick<Props, "filters" | "onChange"> & { className?: string; id?: string }

function RangeToggle({ filters, onChange, className }: Part) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={1}
      className={cn(pillGroup, className)}
      value={filters.range}
      onValueChange={(v) => v && onChange("range", v as Range)}
      aria-label="Date range"
    >
      {RANGES.map(([k, label]) => (
        <ToggleGroupItem key={k} value={k} className={pillItem}>{label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function SymbolSelect({ filters, symbols, onChange, className, id }: Part & { symbols: string[] }) {
  return (
    <Select value={filters.symbol} onValueChange={(v) => onChange("symbol", v)}>
      <SelectTrigger id={id} size="sm" className={cn("bg-card", className)} aria-label="Symbol"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All symbols</SelectItem>
        {symbols.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function SideSelect({ filters, onChange, className, id }: Part) {
  return (
    <Select value={filters.side} onValueChange={(v) => onChange("side", v as Filters["side"])}>
      <SelectTrigger id={id} size="sm" className={cn("bg-card", className)} aria-label="Side"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Buy and sell</SelectItem>
        <SelectItem value="buy">Buy only</SelectItem>
        <SelectItem value="sell">Sell only</SelectItem>
      </SelectContent>
    </Select>
  )
}

function TzSelect({ filters, onChange, className, id }: Part) {
  return (
    <Select value={filters.tz} onValueChange={(v) => onChange("tz", v)}>
      <SelectTrigger id={id} size="sm" className={cn("bg-card *:data-[slot=select-value]:flex-1", className)} aria-label="Timezone">
        <Globe className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {TIMEZONES.map((z) => <SelectItem key={z} value={z}>{tzLabel(z)}{z === LOCAL_TZ && <span className="text-muted-foreground"> (local)</span>}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
