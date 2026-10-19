import * as React from "react"
import { Check } from "lucide-react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Me } from "@/lib/api/types"
import { PLANS, yearlyPrice } from "@/lib/plans"
import { cn } from "@/lib/utils"

/** The plans. `plan` is the user's plan when signed in. */
export function Pricing({ plan }: { plan?: Me["plan"] }) {
  const [yearly, setYearly] = React.useState(false)

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-16 sm:pt-10">
      <h1 className="font-display text-4xl font-bold tracking-tight">Plans and prices</h1>
      <p className="mt-3 max-w-xl text-lg text-muted-foreground">Start free and track your results. Upgrade when you want Jurno to show what to change. Paid plans are not open yet, so every account is on Free for now.</p>

      {plan === "owner" && (
        <p className="mt-4 text-sm text-muted-foreground">You are on the Owner plan. It includes everything below, with no limit on trading accounts.</p>
      )}

      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        className="mt-8 rounded-full bg-muted p-0.5"
        value={yearly ? "yearly" : "monthly"}
        onValueChange={(v) => v && setYearly(v === "yearly")}
        aria-label="Billing period"
      >
        <ToggleGroupItem value="monthly" className="h-7 rounded-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-popover">Monthly</ToggleGroupItem>
        <ToggleGroupItem value="yearly" className="h-7 rounded-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-popover">Yearly · 2 months free</ToggleGroupItem>
      </ToggleGroup>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const amount = yearly ? yearlyPrice(p) : p.monthly
          const current = plan === p.id
          return (
            <section key={p.id} className={cn("flex flex-col rounded-xl border bg-card p-6 shadow-card", current && "border-brand/60")}>
              <h2 className="font-display text-xl font-bold">{p.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>
              <p className="mt-3">
                <span className="font-display text-4xl font-bold">${amount}</span>
                <span className="text-muted-foreground"> / {yearly ? "year" : "month"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {current ? (
                  <Button variant="outline" className="w-full" disabled>Your plan</Button>
                ) : p.monthly > 0 ? (
                  <Button variant="outline" className="w-full" disabled>Coming soon</Button>
                ) : plan ? (
                  <Button variant="outline" className="w-full" disabled>Included</Button>
                ) : (
                  <Button className="w-full" asChild><Link href="/sign-up">Create a free account</Link></Button>
                )}
              </div>
            </section>
          )
        })}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Prices are in US dollars. A yearly plan costs 10 months' price for 12 months.</p>
    </div>
  )
}
