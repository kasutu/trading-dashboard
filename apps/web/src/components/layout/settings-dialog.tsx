import * as React from "react"
import { MistakeSettings, SetupSettings } from "@/components/journal/tag-settings"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useSettings, type ReminderFrequency } from "@/hooks/use-settings"

/** App settings. Opened from the user menu. */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { settings, update } = useSettings()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold">Settings</DialogTitle>
          <DialogDescription>Your journal setups and mistake tags are saved to your account.</DialogDescription>
        </DialogHeader>
        <DialogBody>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="check-in">Check in before trading</Label>
            <p id="check-in-help" className="text-sm text-muted-foreground">Asks how you feel and what you are watching when you open Jurno. Saved on this device.</p>
          </div>
          <Switch id="check-in" aria-describedby="check-in-help" checked={settings.checkIn} onCheckedChange={(v) => update({ checkIn: v })} className="mt-0.5" />
        </div>
        <ReminderSettings />
        <SetupSettings />
        <MistakeSettings />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/** The Today card: how often it shows, and the daily notification. */
function ReminderSettings() {
  const { settings, update } = useSettings()
  const supported = typeof Notification !== "undefined"
  const [denied, setDenied] = React.useState(supported && Notification.permission === "denied")

  // Turning notifications on asks the browser for permission first.
  const setNotify = async (on: boolean) => {
    if (!on || !supported) return update({ reminderNotify: false })
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
    setDenied(permission === "denied")
    update({ reminderNotify: permission === "granted" })
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="reminder">Daily reminder</Label>
          <p id="reminder-help" className="text-sm text-muted-foreground">
            The Today card under Net P&L: the kind of day, trades left and your limits. "Once a day" shows it the first time you open Jurno each day.
          </p>
        </div>
        <Select value={settings.reminder} onValueChange={(v) => update({ reminder: v as ReminderFrequency })}>
          <SelectTrigger id="reminder" size="sm" aria-describedby="reminder-help" className="w-32 flex-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="always">Every visit</SelectItem>
            <SelectItem value="daily">Once a day</SelectItem>
            <SelectItem value="off">Off</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start justify-between gap-4 border-t pt-4">
        <div className="space-y-1">
          <Label htmlFor="reminder-notify">Notify me</Label>
          <p id="reminder-notify-help" className="text-sm text-muted-foreground">
            {!supported
              ? "This browser does not support notifications."
              : denied
                ? "Notifications are blocked for Jurno. Allow them in your browser's site settings, then turn this on."
                : "One notification a day with your plan, while Jurno is open in a tab. Saved on this device."}
          </p>
        </div>
        <Switch
          id="reminder-notify"
          aria-describedby="reminder-notify-help"
          checked={settings.reminderNotify}
          disabled={!supported}
          onCheckedChange={setNotify}
          className="mt-0.5"
        />
      </div>
      {settings.reminderNotify && (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="reminder-time" className="font-normal text-muted-foreground">Send at</Label>
          <Input
            id="reminder-time"
            type="time"
            value={settings.reminderTime}
            onChange={(e) => e.target.value && update({ reminderTime: e.target.value })}
            className="h-8 w-32"
          />
        </div>
      )}
    </div>
  )
}
