import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Account } from "@/lib/api/types"
import { plural } from "@/lib/format"
import { cn } from "@/lib/utils"
import { NewAccountDialog } from "./new-account-dialog"

type Props = { accounts: Account[]; account: Account | null; onSelect: (id: string) => void }

/** The current trading account. The menu switches accounts or creates a new one. */
export function AccountMenu({ accounts, account, onSelect }: Props) {
  const [creating, setCreating] = React.useState(false)
  if (!account) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-40 gap-2 bg-card sm:max-w-64" aria-label={`Trading account: ${account.name}`}>
            <span className="truncate">{account.name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Trading accounts</DropdownMenuLabel>
          {accounts.map((a) => (
            <DropdownMenuItem key={a.id} onSelect={() => onSelect(a.id)}>
              <Check className={cn("size-4", a.id !== account.id && "invisible")} />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="text-xs text-muted-foreground">{plural(a.trades, "trade")}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus className="size-4" /> New trading account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewAccountDialog open={creating} onOpenChange={setCreating} onCreated={(a) => onSelect(a.id)} />
    </>
  )
}
