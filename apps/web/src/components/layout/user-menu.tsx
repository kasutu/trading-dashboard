import { LogOut, Sparkles, Tag, User } from "lucide-react"
import { navigate } from "wouter/use-browser-location"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMe } from "@/hooks/use-api"
import { authClient } from "@/lib/auth-client"
import { planName } from "@/lib/plans"
import { PlanBadge } from "./plan-badge"

/** The signed-in user: name, plan, pricing and sign out. */
export function UserMenu() {
  const { data: me } = useMe()

  const signOut = async () => {
    await authClient.signOut()
    navigate("/")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2" aria-label={me ? `Account menu: ${me.username}, ${planName(me.plan)} plan` : "Account menu"}>
          <User />
          <span className="hidden max-w-32 truncate sm:inline">{me?.username}</span>
          {me && <PlanBadge plan={me.plan} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex min-w-48 items-center justify-between gap-3">
          <span className="truncate font-medium">{me?.username ?? "…"}</span>
          {me && <PlanBadge plan={me.plan} />}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me?.plan === "free" ? (
          <DropdownMenuItem onSelect={() => navigate("/pricing")}><Sparkles /> Upgrade</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => navigate("/pricing")}><Tag /> Plans and prices</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
