import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Account } from "@/lib/api/types"
import { NewAccountDialog } from "./new-account-dialog"

type Props = { accounts: Account[]; account: Account | null; onSelect: (id: string) => void }

/** Pick the trading account, or create a new one. */
export function AccountSwitcher({ accounts, account, onSelect }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {account && (
        <Select value={account.id} onValueChange={onSelect}>
          <SelectTrigger size="sm" className="w-32 min-w-0 bg-card sm:w-48" aria-label="Trading account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
                {a.broker && <span className="text-muted-foreground">· {a.broker}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <NewAccountDialog onCreated={(a) => onSelect(a.id)}>
        <Button variant="ghost" size="icon" aria-label="New account" title="New account">
          <Plus />
        </Button>
      </NewAccountDialog>
    </div>
  )
}
