import { Link, Redirect, Route, Switch } from "wouter"
import { AccountMenu } from "@/components/account/account-menu"
import { AppHeader } from "@/components/layout/app-header"
import { UserMenu } from "@/components/layout/user-menu"
import { Button } from "@/components/ui/button"
import { useAccounts, useMe } from "@/hooks/use-api"
import { useSelectedAccount } from "@/hooks/use-account"
import { useTheme } from "@/hooks/use-theme"
import { authClient } from "@/lib/auth-client"
import { AuthPage } from "@/pages/auth"
import { Home } from "@/pages/home"
import { ImportPage } from "@/pages/import"
import { Landing } from "@/pages/landing"
import { Pricing } from "@/pages/pricing"

type Theme = ReturnType<typeof useTheme>

export default function App() {
  const theme = useTheme()
  const { data: session, isPending } = authClient.useSession()
  if (isPending) return null
  return <div className="min-h-svh">{session ? <SignedIn theme={theme} /> : <SignedOut theme={theme} />}</div>
}

function SignedOut({ theme }: { theme: Theme }) {
  return (
    <>
      <AppHeader dark={theme.dark} onToggleTheme={theme.toggle}>
        <Button variant="ghost" size="sm" asChild><Link href="/pricing">Pricing</Link></Button>
        <Button variant="ghost" size="sm" asChild><Link href="/sign-in">Sign in</Link></Button>
      </AppHeader>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Switch>
          <Route path="/"><Landing /></Route>
          <Route path="/sign-in"><AuthPage mode="sign-in" /></Route>
          <Route path="/sign-up"><AuthPage mode="sign-up" /></Route>
          <Route path="/pricing"><Pricing /></Route>
          <Route><Redirect to="/sign-in" /></Route>
        </Switch>
      </main>
    </>
  )
}

function SignedIn({ theme }: { theme: Theme }) {
  const accounts = useAccounts()
  const me = useMe()
  const { account, select } = useSelectedAccount(accounts.data)

  return (
    <>
      <AppHeader dark={theme.dark} onToggleTheme={theme.toggle} compact>
        {accounts.data && <AccountMenu accounts={accounts.data} account={account} onSelect={select} />}
        <UserMenu />
      </AppHeader>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {accounts.error && (
          <p role="alert" className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{accounts.error}</p>
        )}
        <Switch>
          {/* Sign in stays reachable when signed in, so a rejected session (401) can sign in again. */}
          <Route path="/sign-in"><AuthPage mode="sign-in" /></Route>
          <Route path="/sign-up"><Redirect to="/" /></Route>
          <Route path="/pricing"><Pricing plan={me.data?.plan} /></Route>
          <Route path="/import">{accounts.data && <ImportPage account={account} onSelect={select} />}</Route>
          <Route path="/">{accounts.data && <Home account={account} onSelect={select} />}</Route>
          <Route><Redirect to="/" /></Route>
        </Switch>
      </main>
    </>
  )
}
