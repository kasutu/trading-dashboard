import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/hooks/use-settings"

/** App settings. Opened from the user menu. */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { settings, update } = useSettings()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="space-y-1 pr-6">
          <DialogTitle className="font-display text-xl font-bold">Settings</DialogTitle>
          <DialogDescription>Saved on this device.</DialogDescription>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="ask-mood">Ask for my mood each day</Label>
            <p id="ask-mood-help" className="text-sm text-muted-foreground">Shows a quick check-in when you open Jurno.</p>
          </div>
          <Switch id="ask-mood" aria-describedby="ask-mood-help" checked={settings.askMood} onCheckedChange={(v) => update({ askMood: v })} className="mt-0.5" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
