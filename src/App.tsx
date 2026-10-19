import * as React from "react"
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Moon,
  Sun,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EquityChart, Heatmap, PnlBars } from "@/components/dash/charts"
import { buildInsights } from "@/components/dash/insights"
import * as A from "@/lib/trades"
import { duration, hourLabel, money, pct, pnlClass } from "@/lib/format"
import { cn } from "@/lib/utils"

const STORE_KEY = "trading-dashboard:csv"
const store = {
  get: () => { try { return localStorage.getItem(STORE_KEY) } catch { return null } },
  set: (v: string | null) => { try { if (v === null) localStorage.removeItem(STORE_KEY); else localStorage.setItem(STORE_KEY, v) } catch { /* ignore */ } },
}

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const TIMEZONES = Array.from(new Set([LOCAL_TZ, "UTC", "America/New_York", "Europe/London", "Asia/Tokyo"]))
const RANGES = { all: "All", "7": "7D", "30": "30D", "90": "90D" } as const

export default function App() {
  const [raw, setRaw] = React.useState<{ name: string; trades: A.Trade[] } | null>(() => {
    const saved = store.get()
    if (!saved) return null
    try {
      const { name, text } = JSON.parse(saved)
      return { name, trades: A.parseTradesCsv(text) }
    } catch { return null }
  })
  const [error, setError] = React.useState<string | null>(null)
  const [dark, setDark] = useDarkMode()

  const loadFile = async (file: File) => {
    try {
      const text = await file.text()
      const trades = A.parseTradesCsv(text)
      setRaw({ name: file.name, trades })
      setError(null)
      store.set(JSON.stringify({ name: file.name, text }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file")
    }
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <TrendingUp className="size-4" />
          </div>
          <span className="font-semibold">Trade Journal</span>
          {raw && (
            <Badge variant="secondary" className="hidden max-w-60 truncate font-normal sm:inline-flex">
              {raw.name}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            {raw && (
              <Button variant="ghost" size="sm" onClick={() => { setRaw(null); store.set(null) }}>
                <X /> <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
            <UploadButton onFile={loadFile} variant={raw ? "outline" : "default"} />
            <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} aria-label="Toggle theme">
              {dark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {error}
          </div>
        )}
        {raw ? <Dashboard trades={raw.trades} /> : <EmptyState onFile={loadFile} />}
      </main>
    </div>
  )
}

function useDarkMode() {
  const [dark, setDark] = React.useState(() => {
    try {
      const s = localStorage.getItem("theme")
      if (s) return s === "dark"
    } catch { /* ignore */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try { localStorage.setItem("theme", dark ? "dark" : "light") } catch { /* ignore */ }
  }, [dark])
  return [dark, setDark] as const
}

function UploadButton({ onFile, variant }: { onFile: (f: File) => void; variant: "default" | "outline" }) {
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = "" }}
      />
      <Button size="sm" variant={variant} onClick={() => ref.current?.click()}>
        <Upload /> Upload CSV
      </Button>
    </>
  )
}

function EmptyState({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = React.useState(false)
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <Card
      className={cn("mx-auto mt-10 max-w-xl border-dashed transition-colors", over && "border-primary bg-accent")}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
    >
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Upload your trade history</h2>
          <p className="text-sm text-muted-foreground">
            Drop a CSV export here (Exness / MT5 format: opening_time_utc, closing_time_utc, profit, …).
            <br />
            Everything stays in your browser.
          </p>
        </div>
        <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        <Button onClick={() => ref.current?.click()}>Choose file</Button>
      </CardContent>
    </Card>
  )
}

/* ================= Dashboard ================= */

function Dashboard({ trades }: { trades: A.Trade[] }) {
  const [tz, setTz] = React.useState(LOCAL_TZ)
  const [range, setRange] = React.useState<keyof typeof RANGES>("all")
  const [symbol, setSymbol] = React.useState("all")
  const [side, setSide] = React.useState("all")

  const symbols = React.useMemo(() => A.bySymbol(trades as A.TTrade[]).map((g) => g.key), [trades])
  const localized = React.useMemo(() => A.localize(trades, tz), [trades, tz])

  const ts = React.useMemo(() => {
    const last = Math.max(...trades.map((t) => +t.close))
    const from = range === "all" ? -Infinity : last - Number(range) * 86400000
    return localized.filter(
      (t) => +t.open >= from && (symbol === "all" || t.symbol === symbol) && (side === "all" || t.side === side)
    )
  }, [localized, range, symbol, side, trades])

  const s = React.useMemo(() => A.summary(ts), [ts])

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(v) => v && setRange(v as keyof typeof RANGES)}>
          {Object.entries(RANGES).map(([k, l]) => (
            <ToggleGroupItem key={k} value={k} className="px-3">{l}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger size="sm" className="w-36 bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All symbols</SelectItem>
            {symbols.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={side} onValueChange={setSide}>
          <SelectTrigger size="sm" className="w-32 bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Buy & sell</SelectItem>
            <SelectItem value="buy">Buy only</SelectItem>
            <SelectItem value="sell">Sell only</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">Timezone</span>
          <Select value={tz} onValueChange={setTz}>
            <SelectTrigger size="sm" className="w-48 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((z) => <SelectItem key={z} value={z}>{z === LOCAL_TZ ? `${z} (local)` : z}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {ts.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No trades match these filters.</CardContent></Card>
      ) : (
        <>
          <Kpis s={s} />
          <Tabs defaultValue="overview" className="gap-4">
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="timing">Timing</TabsTrigger>
              <TabsTrigger value="volume">Trade count</TabsTrigger>
              <TabsTrigger value="risk">Risk</TabsTrigger>
              <TabsTrigger value="trades">Trades</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><Overview ts={ts} tz={tz} /></TabsContent>
            <TabsContent value="timing"><Timing ts={ts} tz={tz} /></TabsContent>
            <TabsContent value="volume"><Volume ts={ts} /></TabsContent>
            <TabsContent value="risk"><Risk ts={ts} /></TabsContent>
            <TabsContent value="trades"><TradesTable ts={ts} tz={tz} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

/* ---------- KPIs ---------- */

function Kpi({ label, value, sub, tone, small }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; small?: boolean }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4"><CardDescription className="text-xs">{label}</CardDescription></CardHeader>
      <CardContent className="px-4">
        <div className={cn("font-semibold tracking-tight whitespace-nowrap tabular-nums", small ? "text-xl leading-8" : "text-2xl", tone)}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function Kpis({ s }: { s: A.Summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Net P&L" value={money(s.net, true)} tone={pnlClass(s.net)} sub={`${s.trades} trades · ${s.days} days`} />
      <Kpi label="Win rate" value={pct(s.winRate, 1)} sub={`${s.wins}W / ${s.losses}L`} />
      <Kpi
        label="Profit factor"
        value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}
        tone={s.profitFactor >= 1 ? "text-profit" : "text-loss"}
        sub={`${money(s.grossWin)} / ${money(Math.abs(s.grossLoss))}`}
      />
      <Kpi
        label="Avg win / avg loss"
        small
        value={<span><span className="text-profit">{money(s.avgWin)}</span><span className="text-muted-foreground"> / </span><span className="text-loss">{money(Math.abs(s.avgLoss))}</span></span>}
        sub={`Payoff ${s.payoff.toFixed(2)} · expectancy ${money(s.avg, true)}`}
      />
      <Kpi label="Max drawdown" value={money(s.maxDD)} tone={s.maxDD < 0 ? "text-loss" : undefined} sub={`Longest losing streak: ${s.maxLossStreak}`} />
      <Kpi label="Trades / day" value={s.tradesPerDay.toFixed(1)} sub={`Median hold ${duration(s.medianDurationMin)}`} />
    </div>
  )
}

/* ---------- Sections ---------- */

function Section({ title, desc, children, className, fill }: { title: string; desc?: string; children: React.ReactNode; className?: string; fill?: boolean }) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className={cn(fill && "flex flex-1 flex-col")}>{children}</CardContent>
    </Card>
  )
}

function Overview({ ts, tz }: { ts: A.TTrade[]; tz: string }) {
  const eq = React.useMemo(() => A.equityCurve(ts), [ts])
  const days = React.useMemo(() => A.daily(ts), [ts])
  const insights = React.useMemo(() => buildInsights(ts), [ts])
  const sym = React.useMemo(() => A.bySymbol(ts), [ts])
  const sides = React.useMemo(() => A.bySide(ts), [ts])
  const green = days.filter((d) => d.net > 0).length
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="Equity curve" desc="Cumulative net P&L, trade by trade" className="lg:col-span-2" fill>
        <EquityChart data={eq} tz={tz} />
      </Section>
      <Section title="Insights" desc="Where you win and lose most">
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough trades for insights.</p>
        ) : (
          <ul className="space-y-3">
            {insights.map((i) => (
              <li key={i.title} className="flex gap-3">
                <div className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                  i.tone === "good" ? "bg-profit/15 text-profit" : i.tone === "bad" ? "bg-loss/15 text-loss" : "bg-muted text-muted-foreground"
                )}>
                  {i.tone === "good" ? <TrendingUp className="size-3.5" /> : i.tone === "bad" ? <TrendingDown className="size-3.5" /> : <Lightbulb className="size-3.5" />}
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-medium leading-tight">{i.title}</div>
                  <div className="text-xs text-muted-foreground">{i.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Daily P&L" desc={`${green} green days, ${days.length - green} red days`} className="lg:col-span-2" fill>
        <PnlBars
          fill
          data={days}
          xFormat={(d) => new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          title={(d) => new Date(d.key + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        />
      </Section>
      <div className="grid gap-4">
        <Section title="By symbol"><BreakdownTable rows={sym} /></Section>
        <Section title="Buy vs sell"><BreakdownTable rows={sides.filter((x) => x.trades)} /></Section>
      </div>
    </div>
  )
}

function Timing({ ts }: { ts: A.TTrade[]; tz: string }) {
  const hours = React.useMemo(() => A.byHour(ts), [ts])
  const wd = React.useMemo(() => A.byWeekday(ts), [ts])
  const hm = React.useMemo(() => A.heatmap(ts), [ts])
  const dur = React.useMemo(() => A.byDuration(ts), [ts])
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="P&L by hour of day" desc="Based on when the trade was opened" className="lg:col-span-2">
        <PnlBars data={hours} xFormat={hourLabel} height={260} />
      </Section>
      <Section title="Weekday × hour" desc="Find the time slots that bleed money" className="lg:col-span-2">
        <Heatmap cells={hm} weekdays={A.WEEKDAYS} />
      </Section>
      <Section title="P&L by weekday"><PnlBars data={wd} /></Section>
      <Section title="P&L by holding time" desc="How long the trade was open"><PnlBars data={dur} /></Section>
    </div>
  )
}

function Volume({ ts }: { ts: A.TTrade[] }) {
  const nth = React.useMemo(() => A.nthTradeOfDay(ts), [ts])
  const cap = React.useMemo(() => A.tradeCapSim(ts), [ts])
  const buckets = React.useMemo(() => A.tradesPerDayBuckets(ts), [ts])
  const bestCap = cap.reduce((b, c) => (c.net > b.net ? c : b), cap[0])
  const actual = ts.reduce((s, t) => s + t.net, 0)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title="Daily trade cap simulator"
        desc={`Net P&L if you had stopped after N trades each day. Best: ${bestCap.cap}/day → ${money(bestCap.net, true)} (actual ${money(actual, true)})`}
        className="lg:col-span-2"
      >
        <PnlBars
          data={cap}
          highlight={(d) => d.cap === bestCap.cap}
          title={(d) => `Max ${d.cap} trade${d.cap > 1 ? "s" : ""} per day`}
          rows={(d) => [
            ["Net P&L", money(d.net, true), pnlClass(d.net)],
            ["vs actual", money(d.net - actual, true), pnlClass(d.net - actual)],
            ["Trades taken", d.trades],
          ]}
          height={260}
        />
      </Section>
      <Section title="Result of the N-th trade of the day" desc="Does performance drop as you trade more?">
        <PnlBars data={nth} title={(d) => `Trade #${d.key} of the day`} />
      </Section>
      <Section title="Avg daily P&L by trades taken that day" desc="Busy days vs quiet days">
        <PnlBars
          data={buckets}
          valueKey="avgPerDay"
          title={(d) => `${d.key} trades in a day`}
          rows={(d) => [
            ["Avg per day", money(d.avgPerDay, true), pnlClass(d.avgPerDay)],
            ["Total", money(d.net, true), pnlClass(d.net)],
            ["Days", d.days],
            ["Green days", `${d.greenDays} / ${d.days}`],
          ]}
        />
      </Section>
    </div>
  )
}

function Risk({ ts }: { ts: A.TTrade[] }) {
  const lots = React.useMemo(() => A.byLots(ts), [ts])
  const reasons = React.useMemo(() => A.byReason(ts), [ts])
  const ll = React.useMemo(() => A.lossLimitSim(ts), [ts])
  const rv = React.useMemo(() => A.revenge(ts), [ts])
  const actual = ts.reduce((s, t) => s + t.net, 0)
  const best = ll.length ? ll.reduce((b, c) => (c.net > b.net ? c : b), ll[0]) : null
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="P&L by position size" desc="Lots per trade" fill>
        <PnlBars fill data={lots} xFormat={(v) => `${v}`} title={(d) => `${d.key} lots`} />
      </Section>
      <Section title="How trades closed" desc="Stop loss, take profit, manual, or margin stop-out">
        <PnlBars data={reasons} layout="vertical" height={200} />
        <BreakdownTable rows={reasons} className="mt-2" />
      </Section>
      {best && (
        <Section
          title="Daily loss limit simulator"
          desc={`Net P&L if you stopped for the day once down $X. Best: -$${best.limit} → ${money(best.net, true)} (actual ${money(actual, true)})`}
          className="lg:col-span-2"
        >
          <PnlBars
            data={ll}
            highlight={(d) => d.limit === best.limit}
            title={(d) => `Stop at -$${d.limit} per day`}
            rows={(d) => [
              ["Net P&L", money(d.net, true), pnlClass(d.net)],
              ["vs actual", money(d.net - actual, true), pnlClass(d.net - actual)],
              ["Days stopped early", d.stoppedDays],
              ["Trades taken", d.trades],
            ]}
            height={240}
          />
        </Section>
      )}
      <Section title="Revenge trading check" desc={`Trades opened within ${rv.windowMin} min after a losing trade closed`} className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {[["Right after a loss", rv.after], ["All other trades", rv.other]].map(([l, g]) => {
            const gg = g as A.Group
            return (
              <div key={l as string} className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">{l as string}</div>
                <div className={cn("mt-1 text-2xl font-semibold tabular-nums", pnlClass(gg.net))}>{money(gg.net, true)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {gg.trades} trades · {pct(gg.winRate)} win · {money(gg.avg, true)} per trade
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

function BreakdownTable({ rows, className }: { rows: A.Group[]; className?: string }) {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8 px-0" />
          <TableHead className="h-8 text-right">Trades</TableHead>
          <TableHead className="h-8 text-right">Win</TableHead>
          <TableHead className="h-8 pr-0 text-right">Net</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="px-0 py-1.5 font-medium">{r.key}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{r.trades}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums">{pct(r.winRate)}</TableCell>
            <TableCell className={cn("py-1.5 pr-0 text-right font-mono tabular-nums", pnlClass(r.net))}>{money(r.net, true)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/* ---------- trades table ---------- */

const PAGE = 25
function TradesTable({ ts, tz }: { ts: A.TTrade[]; tz: string }) {
  const [page, setPage] = React.useState(0)
  const sorted = React.useMemo(() => [...ts].sort((a, b) => +b.open - +a.open), [ts])
  const pages = Math.ceil(sorted.length / PAGE)
  const p = Math.min(page, pages - 1)
  const rows = sorted.slice(p * PAGE, p * PAGE + PAGE)
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Opened</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Lots</TableHead>
            <TableHead className="text-right">Open</TableHead>
            <TableHead className="text-right">Close</TableHead>
            <TableHead className="text-right">Held</TableHead>
            <TableHead>Closed by</TableHead>
            <TableHead className="pr-4 text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.ticket}>
              <TableCell className="pl-4 text-muted-foreground">{A.formatDateTime(t.open, tz)}</TableCell>
              <TableCell className="font-medium">{t.symbol}</TableCell>
              <TableCell>
                <Badge variant="outline" className={t.side === "buy" ? "text-profit" : "text-loss"}>{t.side}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{t.lots}</TableCell>
              <TableCell className="text-right tabular-nums">{+t.openPrice.toFixed(3)}</TableCell>
              <TableCell className="text-right tabular-nums">{+t.closePrice.toFixed(3)}</TableCell>
              <TableCell className="text-right tabular-nums">{duration(t.durationMin)}</TableCell>
              <TableCell className="text-muted-foreground">{A.REASONS[t.reason] ?? t.reason}</TableCell>
              <TableCell className={cn("pr-4 text-right font-mono tabular-nums", pnlClass(t.net))}>{money(t.net, true)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
        <span>{sorted.length} trades</span>
        <div className="flex items-center gap-2">
          <span>Page {p + 1} of {pages}</span>
          <Button variant="outline" size="icon" className="size-8" disabled={p === 0} onClick={() => setPage(p - 1)}><ChevronLeft /></Button>
          <Button variant="outline" size="icon" className="size-8" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}><ChevronRight /></Button>
        </div>
      </div>
    </Card>
  )
}

