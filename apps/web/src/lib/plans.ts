import type { Me } from "@/lib/api/types"

export type Plan = { id: Me["plan"]; name: string; monthly: number; features: string[] }

/** The plans. Keep in sync with the Plans table in docs/architecture.md. */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    features: ["1 trading account", "All dashboards", "Notes", "Share card with “Made with Jurno”"],
  },
  {
    id: "espresso",
    name: "Espresso",
    monthly: 3,
    features: ["Everything in Free", "The Plan tab (optimizer)", "Saved column mappings"],
  },
  {
    id: "latte",
    name: "Latte",
    monthly: 5,
    features: ["Everything in Espresso", "Up to 5 trading accounts", "Share card without the footer"],
  },
]

/** Yearly billing: 12 months for the price of 10. */
export const yearlyPrice = (p: Plan) => p.monthly * 10
