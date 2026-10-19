// One-off: writes the parity goldens for crates/engine/tests/parity.rs.
//
// It reads the OLD TypeScript engine in apps/web/src/lib/trades, which the web team is
// removing. The goldens are committed, so you only need this to regenerate them: check
// out a commit that still has apps/web/src/lib/trades, install apps/web deps
// (papaparse), then run from the repo root:
//
//   npx tsx crates/engine/tests/gen_goldens.ts
//
// Output is shaped like the Rust `Analytics` JSON (crates/engine/src/lib.rs).

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as T from "../../../apps/web/src/lib/trades/index"

type Case = { tz: string; range?: number; symbol?: string }
const CASES: Record<string, Case> = {
  "utc-all": { tz: "UTC" },
  "manila-all": { tz: "Asia/Manila" },
  "utc-30-xauusd": { tz: "UTC", range: 30, symbol: "XAUUSD" },
}
const FIXTURES = ["exness-losing", "exness-winning"]
const DAY_MS = 86400000

function analyze(trades: T.Trade[], f: Case) {
  // Same steps as the old apps/web/src/hooks/use-filters.ts
  const symbols = T.bySymbol(trades).map((g) => g.key)
  const last = Math.max(...trades.map((t) => +t.close))
  const from = f.range === undefined ? -Infinity : last - f.range * DAY_MS
  const ts = T.localize(trades, f.tz).filter((t) => +t.open >= from && (!f.symbol || t.symbol === f.symbol))
  if (!ts.length) throw new Error("case matches no trades")

  const { maxDD, profitFactor, ...s } = T.summary(ts)
  const nets = ts.map((t) => t.net)
  const daily = T.daily(ts)
  return {
    period: [daily[0].key, daily.at(-1)!.key],
    symbols,
    summary: {
      ...s,
      profitFactor: Number.isFinite(profitFactor) ? profitFactor : null,
      maxDd: maxDD,
      bestTrade: Math.max(...nets),
      worstTrade: Math.min(...nets),
    },
    curve: T.equityCurve(ts),
    daily,
    byHour: T.byHour(ts),
    byWeekday: T.byWeekday(ts),
    heatmap: T.heatmap(ts),
    byDuration: T.byDuration(ts),
    byLots: T.byLots(ts),
    byReason: T.byReason(ts),
    bySymbol: T.bySymbol(ts),
    bySide: T.bySide(ts),
    nthTrade: T.nthTradeOfDay(ts),
    dayBuckets: T.tradesPerDayBuckets(ts),
    capSim: T.tradeCapSim(ts),
    lossLimitSim: T.lossLimitSim(ts),
    afterLoss: T.afterLoss(ts),
    optimization: T.optimize(ts),
  }
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
for (const name of FIXTURES) {
  const trades = T.parseTradesCsv(readFileSync(join(dir, `${name}.csv`), "utf8"))
  for (const [c, f] of Object.entries(CASES)) {
    const out = join(dir, `${name}.${c}.golden.json`)
    writeFileSync(out, JSON.stringify(analyze(trades, f), null, 1) + "\n")
    console.log("wrote", out)
  }
}
