import { ArrowDownUp, Upload } from "lucide-react"
import { Link } from "wouter"
import { CashFlowDialog } from "@/components/cash/cash-flow-dialog"
import { Button } from "@/components/ui/button"
import type { Account } from "@/lib/api/types"
import { LOCAL_TZ, plural } from "@/lib/format"

/** Title row of an account: its name, broker and trade count, and the import and cash flow actions. */
export function AccountBar({ account }: { account: Account }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate font-display text-2xl font-bold tracking-tight">{account.name}</h1>
        <p className="text-sm text-muted-foreground">{[account.broker, plural(account.trades, "trade")].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <CashFlowDialog accountId={account.id} tz={LOCAL_TZ}>
          <Button variant="outline"><ArrowDownUp /> Deposits & withdrawals</Button>
        </CashFlowDialog>
        <Button asChild variant={account.trades ? "outline" : "default"}>
          <Link href="/import"><Upload /> Import trades</Link>
        </Button>
      </div>
    </div>
  )
}
