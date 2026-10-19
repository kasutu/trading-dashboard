import type { Me } from "@/lib/api/types"

export type Plan = { id: Me["plan"]; name: string; monthly: number; summary: string; features: string[] }

/** The plans. Keep in sync with crates/api/src/plan.rs and docs/architecture.md. */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    summary: "Track your results.",
    features: [
      "1 trading account",
      "Net P&L, equity curve and key ratios",
      "Trading calendar",
      "Results by symbol, side, position size and close reason",
      "Full trade list",
      "Share card with a “Made with Jurno” footer",
    ],
  },
  {
    id: "espresso",
    name: "Espresso",
    monthly: 9,
    summary: "See what helps and what hurts your results.",
    features: [
      "Everything in Free",
      "Notes: what helps and what hurts your results",
      "Plan: trade limits tested on your past trades",
      "Timing: results by hour, weekday and holding time",
      "Frequency: daily trade cap and busy days",
      "Risk: daily loss limit and trades after a loss",
      "Saved column mappings",
    ],
  },
  {
    id: "latte",
    name: "Latte",
    monthly: 15,
    summary: "For traders with more than one trading account.",
    features: ["Everything in Espresso", "Up to 5 trading accounts", "Share card without the footer"],
  },
]

/** Yearly billing: 12 months for the price of 10. */
export const yearlyPrice = (p: Plan) => p.monthly * 10

/** The cheapest paid plan, named in upgrade prompts. */
export const FIRST_PAID = PLANS[1]
