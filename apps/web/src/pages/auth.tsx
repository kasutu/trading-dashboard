import * as React from "react"
import { Link } from "wouter"
import { navigate } from "wouter/use-browser-location"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient, placeholderEmail } from "@/lib/auth-client"

const USERNAME = /^[a-zA-Z0-9_.]{3,30}$/

/** Sign in or sign up with a username and a password. */
export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const signUp = mode === "sign-up"
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get("username")).trim()
    const password = String(form.get("password"))
    if (signUp && !USERNAME.test(username))
      return setError("Use 3 to 30 characters for the username: letters, digits, underscores (_) and dots (.).")
    if (signUp && password.length < 8) return setError("Use 8 or more characters for the password.")

    setBusy(true)
    setError(null)
    const { error } = signUp
      ? await authClient.signUp.email({ username, password, name: username, email: placeholderEmail(username) })
      : await authClient.signIn.username({ username, password })
    setBusy(false)
    if (error) return setError(error.message ?? "Something went wrong. Try again.")
    navigate("/")
  }

  return (
    <div className="mx-auto max-w-sm pt-6 pb-12 sm:pt-16 sm:pb-16">
      <h1 className="font-display text-3xl font-bold tracking-tight">{signUp ? "Create your account" : "Sign in"}</h1>
      <p className="mt-2 text-muted-foreground">
        {signUp ? "Free. You only need a username and a password." : "Welcome back. Enter your username and password."}
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" autoComplete="username" required autoFocus />
          {signUp && <p className="text-xs text-muted-foreground">3 to 30 letters, digits, underscores or dots.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete={signUp ? "new-password" : "current-password"} required />
          {signUp && <p className="text-xs text-muted-foreground">8 or more characters.</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "One moment…" : signUp ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        {signUp ? "Have an account? " : "New to Jurno? "}
        <Link href={signUp ? "/sign-in" : "/sign-up"} className="font-medium text-foreground underline underline-offset-4">
          {signUp ? "Sign in" : "Create a free account"}
        </Link>
      </p>
    </div>
  )
}
