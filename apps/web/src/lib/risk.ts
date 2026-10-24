import type { AccountRisk, CashSummary } from "@/lib/api/types"

/** Net deposited + broker adjustments + net P&L of all closed trades. Open positions are not included. */
export const accountBalance = (s: CashSummary, tradingNet: number) => s.net + s.adjustments.total + tradingNet

/** Used until the account has its own limits. */
export const DEFAULT_RISK: AccountRisk = { kind: "percent", daily: 2, perTrade: 1, maxTrades: null, weekends: false }

export type Limits = {
  /** Max loss today, in dollars. */
  daily: number | null
  /** Which limit set `daily`: the account's own, or the plan's (when it is smaller). */
  from: "account" | "plan" | null
  /** Max risk per trade, in dollars. */
  perTrade: number | null
  /** Max trades today. */
  trades: number | null
}

const smallest = (...xs: (number | null)[]) => {
  const known = xs.filter((x): x is number => x !== null)
  return known.length ? Math.min(...known) : null
}

/** Today's limits: the stricter of the account's loss limits and the plan's (found on past trades). Trades a day
 *  come from the history only: the best daily cap on Frequency. A % limit needs a balance above 0. Rounded down, so
 *  the advice never risks more than a limit. */
export function limits(risk: AccountRisk, balance: number | null, plan: { lossLimit: number | null; cap: number | null } | null): Limits {
  const bal = balance !== null && balance > 0 ? balance : null
  const floor = (n: number) => (n >= 100 ? Math.floor(n) : Math.floor(n * 100) / 100)
  const dollars = (v: number | null) => (v === null ? null : risk.kind === "amount" ? v : bal === null ? null : floor((bal * v) / 100))
  const own = dollars(risk.daily)
  const daily = smallest(own, plan?.lossLimit ?? null)
  const trades = plan?.cap ?? null
  return {
    daily,
    from: daily === null ? null : daily === own ? "account" : "plan",
    perTrade: smallest(dollars(risk.perTrade), daily !== null && trades ? floor(daily / trades) : null),
    trades,
  }
}
