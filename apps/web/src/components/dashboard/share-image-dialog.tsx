import * as React from "react"
import { Check, Copy, Download, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useSettled } from "@/hooks/use-media"
import { canvasToPng, pageTheme, watchTheme } from "@/lib/card-canvas"
import { cn } from "@/lib/utils"

type Props = {
  /** The button that opens the dialog. Leave out and pass `open` to open it from outside. */
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Options shown under the preview, for example a switch. */
  controls?: React.ReactNode
  title: string
  description: string
  /** Draws the 1200 × 630 image on the canvas. */
  draw: (canvas: HTMLCanvasElement) => void
  /** Text to post with the image. */
  caption: string
  fileName: string
}

/** A dialog with a share image preview: share sheet, copy caption, copy image, download. */
export function ShareImageDialog({ trigger, open, onOpenChange, controls, title, description, draw, caption, fileName }: Props) {
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null)
  const [status, setStatus] = React.useState<"idle" | "image" | "caption" | "error">("idle")
  // The system share sheet (phones, Safari, Edge). Elsewhere, copy and download cover it.
  const canShare =
    typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([], fileName, { type: "image/png" })] })

  // The image follows the app theme; redraw when it changes while the dialog is open.
  const theme = React.useSyncExternalStore(watchTheme, pageTheme)


  const flash = (s: typeof status) => {
    setStatus(s)
    setTimeout(() => setStatus("idle"), 2500)
  }

  const copyImage = async () => {
    try {
      // Pass a promise so Safari keeps the click as the user gesture.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToPng(canvas!) })])
      flash("image")
    } catch {
      flash("error")
    }
  }

  const copyCaption = async () => {
    await navigator.clipboard.writeText(caption)
    flash("caption")
  }

  const download = async () => {
    const url = URL.createObjectURL(await canvasToPng(canvas!))
    const link = Object.assign(document.createElement("a"), { href: url, download: fileName })
    link.click()
    URL.revokeObjectURL(url)
  }

  const share = async () => {
    const file = new File([await canvasToPng(canvas!)], fileName, { type: "image/png" })
    await navigator.share({ files: [file], text: caption }).catch(() => {}) // closing the sheet is not an error
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setStatus("idle")
        onOpenChange?.(o)
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent size="full" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Preview title={title} draw={draw} theme={theme} onCanvas={setCanvas} />
          {controls}
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">Caption</p>
            <p className="mt-1 text-sm">{caption}</p>
          </div>
        </DialogBody>
        <DialogFooter className="grid grid-cols-2 sm:flex sm:justify-end">
          {status === "error" && (
            <p role="alert" className="col-span-2 text-sm text-destructive sm:mr-auto">This browser cannot copy images. Download the file.</p>
          )}
          <Button variant="outline" onClick={copyCaption}>
            {status === "caption" ? <><Check /> Copied</> : <><Copy /> Copy caption</>}
          </Button>
          <Button variant="outline" onClick={copyImage}>
            {status === "image" ? <><Check /> Copied</> : <><Copy /> Copy image</>}
          </Button>
          <Button variant={canShare ? "outline" : "default"} className={cn(!canShare && "col-span-2")} onClick={download}><Download /> Download PNG</Button>
          {canShare && <Button onClick={share}><Share2 /> Share</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The image preview. Mounts when the dialog opens and draws only once the open animation is over, so drawing the
 *  1200 × 630 canvas does not stall it. Until then the box keeps the image's shape. */
function Preview({ title, draw, theme, onCanvas }: { title: string; draw: Props["draw"]; theme: string; onCanvas: (c: HTMLCanvasElement | null) => void }) {
  const settled = useSettled()
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null)
  const ref = React.useCallback((c: HTMLCanvasElement | null) => {
    setCanvas(c)
    onCanvas(c)
  }, [onCanvas])
  React.useEffect(() => {
    if (canvas && settled) draw(canvas)
  }, [canvas, settled, draw, theme])
  return (
    <canvas
      ref={ref}
      className="mx-auto block aspect-[40/21] h-auto w-full rounded-xl border bg-muted/40 shadow-card"
      aria-label={`${title} preview`}
    />
  )
}
