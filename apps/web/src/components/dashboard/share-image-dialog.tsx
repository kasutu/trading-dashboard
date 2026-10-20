import * as React from "react"
import { Check, Copy, Download, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { canvasToPng } from "@/lib/card-canvas"

type Props = {
  /** The button that opens the dialog. */
  trigger: React.ReactNode
  title: string
  description: string
  /** Draws the 1200 × 630 image on the canvas. */
  draw: (canvas: HTMLCanvasElement) => void
  /** Text to post with the image. */
  caption: string
  fileName: string
}

/** A dialog with a share image preview: share sheet, copy caption, copy image, download. */
export function ShareImageDialog({ trigger, title, description, draw, caption, fileName }: Props) {
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null)
  const [status, setStatus] = React.useState<"idle" | "image" | "caption" | "error">("idle")
  // The system share sheet (phones, Safari, Edge). Elsewhere, copy and download cover it.
  const canShare =
    typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([], fileName, { type: "image/png" })] })

  React.useEffect(() => {
    if (canvas) draw(canvas)
  }, [canvas, draw])

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
    <Dialog onOpenChange={() => setStatus("idle")}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <div className="space-y-1 pr-6">
          <DialogTitle className="font-display text-lg font-bold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <canvas ref={setCanvas} className="aspect-[1200/630] w-full rounded-xl border shadow-card" aria-label={`${title} preview`} />
        <div className="rounded-xl bg-muted/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">Caption</p>
          <p className="mt-1 text-sm">{caption}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {status === "error" && (
            <p role="alert" className="mr-auto text-sm text-destructive">This browser cannot copy images. Download the file.</p>
          )}
          <Button variant="outline" onClick={copyCaption}>
            {status === "caption" ? <><Check /> Copied</> : <><Copy /> Copy caption</>}
          </Button>
          <Button variant="outline" onClick={copyImage}>
            {status === "image" ? <><Check /> Copied</> : <><Copy /> Copy image</>}
          </Button>
          <Button variant={canShare ? "outline" : "default"} onClick={download}><Download /> Download PNG</Button>
          {canShare && <Button onClick={share}><Share2 /> Share</Button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
