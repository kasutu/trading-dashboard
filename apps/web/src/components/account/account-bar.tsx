import { ArrowDownUp, Shield, Upload } from "lucide-react"
import { Link } from "wouter"
import { CashFlowDialog } from "@/components/cash/cash-flow-dialog"
import { RiskDialog } from "./risk-dialog"
import { Button } from "@/components/ui/button"
import type { Account } from "@/lib/api/types"
import { LOCAL_TZ, plural } from "@/lib/format"

/** Title row of an account: its name, broker and trade count, and the risk, funding and import actions. */
export function AccountBar({ account }: { account: Account }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate font-display text-2xl font-bold tracking-tight">{account.name}</h1>
        <p className="text-sm text-muted-foreground">{[account.broker, plural(account.trades, "trade")].filter(Boolean).join(", ")}</p>
      </div>
      {/* Phones: three equal buttons with short words. */}
      <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
        <RiskDialog key={account.id} account={account}>
          <Button variant="outline"><Shield /> Risk</Button>
        </RiskDialog>
        <CashFlowDialog accountId={account.id} tz={LOCAL_TZ}>
          <Button variant="outline">
            <ArrowDownUp /> <span className="sm:hidden">Funding</span><span className="hidden sm:inline">Deposits & withdrawals</span>
          </Button>
        </CashFlowDialog>
        <Button asChild variant={account.trades ? "outline" : "default"}>
          <Link href="/import"><Upload /> Import<span className="hidden sm:inline"> trades</span></Link>
        </Button>
      </div>
    </div>
  )
}
