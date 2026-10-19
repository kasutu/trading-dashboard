import { Plus } from "lucide-react"
import { AccountBar } from "@/components/account/account-bar"
import { NewAccountDialog } from "@/components/account/new-account-dialog"
import { Dashboard } from "@/components/dashboard/dashboard"
import { EmptyState } from "@/components/layout/empty-state"
import { Button } from "@/components/ui/button"
import type { Account } from "@/lib/api/types"

/** Signed-in home: the dashboard of the selected account, or the next step when there is nothing to show. */
export function Home({ account, onSelect }: { account: Account | null; onSelect: (id: string) => void }) {
  if (!account)
    return (
      <EmptyState title="Create a trading account" text="A trading account holds the trades of one broker account. Create one, then import your trade history.">
        <NewAccountDialog onCreated={(a) => onSelect(a.id)}>
          <Button><Plus /> New account</Button>
        </NewAccountDialog>
      </EmptyState>
    )
  return (
    <div className="space-y-5">
      <AccountBar account={account} />
      {account.trades === 0 ? (
        <EmptyState title="No trades yet" text="Import the trade history CSV file from your broker to see your dashboard. Use Import trades above." />
      ) : (
        <Dashboard key={account.id} accountId={account.id} />
      )}
    </div>
  )
}
