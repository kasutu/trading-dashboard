import { MistakeSettings, SetupSettings } from "@/components/journal/tag-settings"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/hooks/use-settings"

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
        <SetupSettings />
        <MistakeSettings />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
