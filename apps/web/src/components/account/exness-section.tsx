import * as React from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { exnessPath, invalidate, useExness } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import type { Account, ExnessConnection } from "@/lib/api/types"
import { LOCAL_TZ, formatDateTime, plural } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Connect the trading account to Exness, so its trades, deposits and withdrawals sync on their own. The keys are
 *  sent once, checked with Exness, and stored encrypted on the server. They are never sent back to the browser. */
export function ExnessSection({ account }: { account: Account }) {
  const { data: c, error } = useExness(account.id)
  const [connecting, setConnecting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const path = exnessPath(account.id)

  // The first sync runs on the server after connecting. Check back until it is done.
  const waiting = !!c?.connected && !c.lastSyncAt
  React.useEffect(() => {
    if (!waiting) return
    const id = window.setInterval(() => invalidate(path), 4000)
    return () => window.clearInterval(id)
  }, [waiting, path])
  const synced = c?.lastSyncAt
  React.useEffect(() => {
    if (synced) invalidate("/accounts")
  }, [synced])

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!c?.enabled) return null

  const run = async (method: "POST" | "DELETE", sub = "") => {
    setBusy(true)
    setActionError(null)
    try {
      await api(`${path}${sub}`, { method })
      invalidate(path)
      invalidate("/accounts")
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby="exness-title">
      <div className="space-y-1">
        <h3 id="exness-title" className="text-sm font-medium">Exness sync</h3>
        <p className="text-sm text-muted-foreground">Trades, deposits and withdrawals come in on their own every 10 minutes. No export needed.</p>
      </div>
      {c.locked ? (
        <p className="text-sm text-muted-foreground">On Espresso and Latte. Importing files stays free.</p>
      ) : connecting || !c.connected ? (
        connecting ? (
          <ConnectForm account={account} c={c} onDone={() => setConnecting(false)} />
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setConnecting(true)} disabled={!c.canConnect}>
            Connect Exness
          </Button>
        )
      ) : (
        <Status c={c} waiting={waiting} />
      )}
      {!c.canConnect && !c.locked && <p className="text-xs text-muted-foreground">This server cannot store keys yet (no CREDENTIALS_KEY).</p>}
      {c.connected && !connecting && !c.locked && (
        <div className="flex flex-wrap gap-2">
          {c.status !== "paused" && (
            <Button size="sm" variant="outline" disabled={busy || waiting} onClick={() => run("POST", "/sync")}>
              <RefreshCw className={cn(busy && "animate-spin")} /> Sync now
            </Button>
          )}
          <Button size="sm" variant={c.status === "paused" ? "default" : "ghost"} onClick={() => setConnecting(true)}>
            {c.status === "paused" ? "Connect again" : "Change keys"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => window.confirm("Disconnect Exness? The stored keys are deleted. Your trades stay.") && run("DELETE")}
          >
            Disconnect
          </Button>
        </div>
      )}
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
    </section>
  )
}

function Status({ c, waiting }: { c: ExnessConnection; waiting: boolean }) {
  const added = [c.lastSyncTrades ? plural(c.lastSyncTrades, "trade") : null, c.lastSyncFlows ? plural(c.lastSyncFlows, "deposit or withdrawal") : null]
    .filter(Boolean)
    .join(" and ")
  return (
    <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
      <p>Connected to account <span className="font-mono">{c.exnessAccountId}</span>.</p>
      {waiting ? (
        <p className="text-muted-foreground">Fetching your history. This can take a minute.</p>
      ) : c.lastSyncAt && (
        <p className="text-muted-foreground">
          Last sync {formatDateTime(c.lastSyncAt, LOCAL_TZ)}{c.status === "ok" ? `: ${added ? `${added} added` : "nothing new"}.` : "."}
        </p>
      )}
      {c.status === "failing" && c.lastError && <p className="text-loss">It failed: {c.lastError} Jurno tries again in 10 minutes.</p>}
      {c.status === "paused" && <p className="text-loss">Syncing stopped after 3 failures in a row{c.lastError ? `: ${c.lastError}` : "."} Connect again with working keys.</p>}
    </div>
  )
}

function ConnectForm({ account, c, onDone }: { account: Account; c: ExnessConnection; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [advanced, setAdvanced] = React.useState(false)
  const id = React.useId()
  return (
    <form
      className="space-y-3"
      autoComplete="off"
      onSubmit={async (e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        const get = (k: string) => String(form.get(k) ?? "").trim()
        setBusy(true)
        setError(null)
        try {
          await api(exnessPath(account.id), {
            method: "PUT",
            body: { accountId: get("accountId"), apiKey: get("apiKey"), privateKey: get("privateKey"), host: get("host") || null },
          })
          invalidate(exnessPath(account.id))
          invalidate("/accounts")
          onDone()
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        Create an API key in Exness Key Management. Give it access to history only, never Payments. If the key allows only some IP addresses, add
        this server's.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-acc`}>Exness account number</Label>
        <Input id={`${id}-acc`} name="accountId" inputMode="numeric" required defaultValue={c.exnessAccountId ?? account.mtLogin ?? ""} className="font-mono" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-key`}>API key</Label>
        <Input id={`${id}-key`} name="apiKey" required spellCheck={false} className="font-mono" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-secret`}>Private key</Label>
        <Textarea
          id={`${id}-secret`}
          name="privateKey"
          required
          rows={3}
          spellCheck={false}
          placeholder="128 hex characters, or -----BEGIN PRIVATE KEY-----"
          className="resize-none font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">Stored encrypted. Jurno never shows it again.</p>
      </div>
      {advanced ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-host`}>API host <span className="text-xs font-normal text-muted-foreground">Optional</span></Label>
          <Input id={`${id}-host`} name="host" placeholder="Found on its own" spellCheck={false} className="font-mono" />
        </div>
      ) : (
        <button type="button" onClick={() => setAdvanced(true)} className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Set the API host by hand
        </button>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">{busy ? "Checking with Exness…" : "Connect"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
