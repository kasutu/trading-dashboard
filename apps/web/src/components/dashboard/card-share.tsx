import * as React from "react"
import { Share2 } from "lucide-react"
import { toPng } from "html-to-image"
import { Button } from "@/components/ui/button"
import { useMe } from "@/hooks/use-api"
import { useSettled } from "@/hooks/use-media"
import { pageTheme, watchTheme } from "@/lib/card-canvas"
import { cardScale, drawPanelCard, type Capture } from "@/lib/panel-card"
import { cn } from "@/lib/utils"
import { ShareImageDialog } from "./share-image-dialog"

/** Marks parts of a card that stay out of its share image, such as this button. */
const SHARE_IGNORE = { "data-share-ignore": "" }

type Props = {
  /** The card to capture. */
  target: React.RefObject<HTMLElement | null>
  /** The card's title: used in the caption, the footer and the file name. */
  title: string
  className?: string
}

/** Icon button that shares a dashboard card as an image, exactly as it looks on screen. */
export function CardShareButton({ target, title, className }: Props) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        {...SHARE_IGNORE}
        variant="ghost"
        size="icon-sm"
        className={cn("text-muted-foreground", className)}
        onClick={() => setOpen(true)}
        aria-label={`Share ${title}`}
        title="Share as an image"
      >
        <Share2 />
      </Button>
      {open && <CardShareDialog target={target} title={title} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Widest a card is captured at. A wider card is narrowed to this for the capture, so its charts lay out the way
 *  they do on a phone and the card fills the square image instead of being a thin strip in it. */
const CAPTURE_W = 600

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

/** Renders a card to a PNG, leaving out anything marked with SHARE_IGNORE. */
async function capture(node: HTMLElement): Promise<Capture> {
  const narrow = node.getBoundingClientRect().width > CAPTURE_W
  const old = { width: node.style.width, maxWidth: node.style.maxWidth }
  try {
    if (narrow) {
      node.style.width = `${CAPTURE_W}px`
      node.style.maxWidth = `${CAPTURE_W}px`
      // Let the charts see the new width (ResizeObserver) and draw again before taking the picture.
      await nextFrame()
      await new Promise((r) => setTimeout(r, 120))
      await nextFrame()
    }
    const { width: w, height: h } = node.getBoundingClientRect()
    const url = await toPng(node, {
      // Enough pixels for the size the card is drawn at in the 2x image, so small cards stay sharp.
      pixelRatio: Math.max(2, Math.ceil(cardScale(w, h) * 2)),
      filter: (n) => !(n instanceof HTMLElement && n.hasAttribute("data-share-ignore")),
    })
    const image = new Image()
    image.src = url
    await image.decode()
    return { image, w, h }
  } finally {
    if (narrow) Object.assign(node.style, old)
  }
}

function CardShareDialog({ target, title, onClose }: Omit<Props, "className"> & { onClose: () => void }) {
  const { data: me } = useMe()
  const [shot, setShot] = React.useState<Capture | null>(null)
  const [failed, setFailed] = React.useState(false)
  // Capture again when the theme changes, so the card matches the frame.
  const theme = React.useSyncExternalStore(watchTheme, pageTheme)
  // Turning the card into an image is heavy: start once the dialog has finished opening.
  const settled = useSettled()

  React.useEffect(() => {
    const node = target.current
    if (!node || !settled) return
    let live = true
    capture(node).then(
      (c) => live && setShot(c),
      () => live && setFailed(true)
    )
    return () => { live = false }
  }, [target, theme, settled])

  const data = React.useMemo(
    () => ({ context: today(), invite: me?.plan !== "latte" && me?.plan !== "owner", site: window.location.host, capture: shot }),
    [me?.plan, shot]
  )
  const draw = React.useCallback((canvas: HTMLCanvasElement) => drawPanelCard(canvas, data), [data])
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  return (
    <ShareImageDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Share “${title}”`}
      description="Share this card as an image, copy the caption or download it. It shows the card as it is on screen, with the current filters."
      controls={failed ? <p role="alert" className="text-sm text-destructive">This card could not be turned into an image.</p> : undefined}
      draw={draw}
      caption={`${title}, from my trading journal. I track my trades with Jurno: ${window.location.origin}`}
      fileName={`jurno-${slug || "card"}.png`}
    />
  )
}

/** "Oct 23, 2026", for the footer. */
const today = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
