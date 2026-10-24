import type { CashSummary } from "@/lib/api/types"

/** What is left in the account: net deposited, plus broker adjustments, plus the net P&L of every closed trade.
 *  Open positions are not included. */
export const accountBalance = (s: CashSummary, tradingNet: number) => s.net + s.adjustments.total + tradingNet

export type DailyRisk = {
  /** The most to lose today, in dollars. */
  limit: number
  /** Where the limit comes from: the plan's loss limit, or the % of balance cap (when that is smaller or the only one). */
  from: "plan" | "balance"
  /** The limit as a share of the balance (0.02 = 2%). Null when the balance is unknown. */
  share: number | null
  /** Per trade: the limit split over the plan's daily trade cap. Null without a cap. */
  perTrade: number | null
}

// Whole dollars on accounts of $100 or more, cents below. Always down, so the advice never risks more than the cap.
const floorMoney = (n: number, balance: number) => (balance >= 100 ? Math.floor(n) : Math.floor(n * 100) / 100)

/** The recommended daily risk: the smaller of the plan's daily loss limit (what worked on your past trades) and
 *  `maxPct`% of the balance. Either one alone when the other is unknown. Null when both are. */
export function dailyRisk(planLimit: number | null, balance: number | null, maxPct: number, cap: number | null): DailyRisk | null {
  const known = balance !== null && balance > 0 ? balance : null
  const pctCap = known !== null ? floorMoney((known * maxPct) / 100, known) : null
  if (planLimit === null && pctCap === null) return null
  const fromBalance = pctCap !== null && (planLimit === null || pctCap < planLimit)
  const limit = fromBalance ? pctCap! : planLimit!
  return {
    limit,
    from: fromBalance ? "balance" : "plan",
    share: known !== null ? limit / known : null,
    perTrade: cap ? Math.floor((limit / cap) * 100) / 100 : null,
  }
}
