import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { EMAIL_PATH, invalidate, useEmailSettings } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import type { EmailFrequency, EmailSettings as Email } from "@/lib/api/types"
import { LOCAL_TZ, tzLabel } from "@/lib/format"

const FREQUENCIES: { value: EmailFrequency; label: string }[] = [
  { value: "weekdays", label: "Mon to Fri" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Mondays" },
]

/** The daily plan by email: the address (verified by a link), on or off, how often and when. The time is in this
 *  browser's timezone, saved with every change. */
export function EmailSettings() {
  const { data, error: loadError } = useEmailSettings()
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

  const call = async (path: string, method: "PATCH" | "POST", body: unknown, done?: string) => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      await api<Email>(path, { method, body })
      invalidate(EMAIL_PATH)
      if (done) setNote(done)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  const save = (patch: Partial<Email>) => call(EMAIL_PATH, "PATCH", { ...patch, tz: LOCAL_TZ })

  if (!data) return loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null
  const showForm = !data.email || editing

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="email-on">Email me</Label>
          <p id="email-on-help" className="text-sm text-muted-foreground">
            The Today card in your inbox{data.verified ? "" : ", once your address is verified"}.
          </p>
        </div>
        <Switch
          id="email-on"
          aria-describedby="email-on-help"
          checked={data.enabled}
          disabled={busy}
          onCheckedChange={(enabled) => save({ enabled })}
          className="mt-0.5"
        />
      </div>

      {showForm ? (
        <form
          className="space-y-1.5 border-t pt-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const email = String(new FormData(e.currentTarget).get("email") ?? "")
            if (await call(EMAIL_PATH, "PATCH", { email, tz: LOCAL_TZ }, "We sent you a link. Open it to verify the address.")) setEditing(false)
          }}
        >
          <Label htmlFor="email-address" className="font-normal text-muted-foreground">Address</Label>
          <div className="flex gap-2">
            <Input id="email-address" name="email" type="email" autoComplete="email" required defaultValue={data.email ?? ""} placeholder="you@example.com" className="h-8" />
            <Button type="submit" size="sm" disabled={busy}>Send link</Button>
            {editing && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
          <div className="min-w-0">
            <p className="truncate">{data.email}</p>
            <p className="text-xs text-muted-foreground">{data.verified ? "Verified" : "Not verified yet. Open the link we sent."}</p>
          </div>
          <div className="flex flex-none gap-1">
            {!data.verified && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => call(`${EMAIL_PATH}/verify`, "POST", {}, "We sent a new link.")}>
                Resend
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Change</Button>
          </div>
        </div>
      )}

      {data.enabled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="email-frequency" className="font-normal text-muted-foreground">How often</Label>
            <Select value={data.frequency} onValueChange={(v) => save({ frequency: v as EmailFrequency })}>
              <SelectTrigger id="email-frequency" size="sm" className="w-32 flex-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="email-time" className="font-normal text-muted-foreground">
              Time <span className="text-xs">({tzLabel(LOCAL_TZ)})</span>
            </Label>
            <Input
              id="email-time"
              type="time"
              defaultValue={data.time}
              onBlur={(e) => e.target.value && e.target.value !== data.time && save({ time: e.target.value })}
              className="h-8 w-32"
            />
          </div>
          {data.verified && (
            <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => call(`${EMAIL_PATH}/test`, "POST", {}, `Sent to ${data.email}.`)}>
              Send me one now
            </Button>
          )}
        </div>
      )}
      {!data.canSend && <p className="text-xs text-muted-foreground">This server has no email provider set up, so emails are not delivered yet.</p>}
      {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
