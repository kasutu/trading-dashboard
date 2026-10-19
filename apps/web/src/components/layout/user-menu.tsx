import { LogOut, Tag, User } from "lucide-react"
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
import { PLANS } from "@/lib/plans"

/** The signed-in user: name, plan, pricing and sign out. */
export function UserMenu() {
  const { data: me } = useMe()
  const plan = PLANS.find((p) => p.id === me?.plan)

  const signOut = async () => {
    await authClient.signOut()
    navigate("/")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <User />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <p className="truncate font-medium">{me?.username ?? "…"}</p>
          {plan && <p className="text-xs font-normal text-muted-foreground">{plan.name} plan</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/pricing")}><Tag /> Pricing</DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
