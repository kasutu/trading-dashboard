import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { invalidate } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import type { Account } from "@/lib/api/types"

type Props = {
  onCreated: (a: Account) => void
  /** The button that opens the dialog. Leave out and pass `open` to open it from elsewhere, such as a menu. */
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** A dialog that creates a trading account. */
export function NewAccountDialog({ onCreated, children, open: controlled, onOpenChange }: Props) {
  const [own, setOwn] = React.useState(false)
  const open = controlled ?? own
  const setOpen = (o: boolean) => (onOpenChange ?? setOwn)(o)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const broker = String(form.get("broker")).trim()
    setBusy(true)
    setError(null)
    try {
      const account = await api<Account>("/accounts", {
        method: "POST",
        body: { name: String(form.get("name")).trim(), broker: broker || undefined },
      })
      invalidate("/accounts")
      onCreated(account)
      setOpen(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(null) }}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1 pr-10 sm:pr-6">
            <DialogTitle className="font-display text-lg font-bold">New trading account</DialogTitle>
            <DialogDescription>A trading account holds the trades of one broker account.</DialogDescription>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-name">Name</Label>
            <Input id="account-name" name="name" required maxLength={60} placeholder="For example: Exness live" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-broker">Broker <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="account-broker" name="broker" maxLength={60} placeholder="For example: Exness" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
