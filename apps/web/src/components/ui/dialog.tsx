import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogTitle = DialogPrimitive.Title

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
}

const SIZE = {
  // Phones: a bottom sheet. From sm: a centered dialog.
  default: cn(
    "inset-x-0 bottom-0 grid max-h-[calc(100dvh-1.5rem)] w-full gap-4 overflow-y-auto overscroll-contain rounded-t-2xl border-t p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
    "sm:right-auto sm:bottom-auto sm:max-h-[calc(100svh-2rem)] sm:max-w-lg sm:rounded-xl sm:border sm:p-6"
  ),
  // Phones: the whole screen, with a fixed header (title and close) and footer, and a body that scrolls.
  // From sm: a centered dialog laid out the same way. Use DialogHeader, DialogBody and DialogFooter inside.
  full: cn(
    "inset-0 flex h-dvh w-full flex-col overflow-hidden",
    "sm:right-auto sm:bottom-auto sm:h-auto sm:max-h-[calc(100svh-2rem)] sm:max-w-lg sm:rounded-xl sm:border"
  ),
}

type ContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** "full" for big dialogs: full screen on phones. */
  size?: keyof typeof SIZE
}

function DialogContent({ className, children, size = "default", ...props }: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "motion-dialog fixed z-50 bg-card shadow-lg outline-none",
          SIZE[size],
          // After SIZE, so these win over its phone insets when classes are merged.
          "sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2",
          className
        )}
        {...props}
      >
        {children}
        <DialogClose />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogOverlay() {
  return <DialogPrimitive.Overlay className="motion-overlay fixed inset-0 z-50 bg-overlay" />
}

/** The close button: 44px on phones, in the top right corner below the notch. */
function DialogClose() {
  return (
    <DialogPrimitive.Close
      className="absolute top-[max(0.375rem,env(safe-area-inset-top))] right-[max(0.375rem,env(safe-area-inset-right))] z-10 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:top-3 sm:right-3 sm:size-8"
      aria-label="Close"
    >
      <XIcon className="size-5 sm:size-4" />
    </DialogPrimitive.Close>
  )
}

/** Title row of a "full" dialog or a sheet. Stays put while the body scrolls. */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex-none space-y-1 border-b px-4 pt-[max(0.875rem,env(safe-area-inset-top))] pr-14 pb-3 sm:border-b-0 sm:px-6 sm:pt-6 sm:pr-14 sm:pb-2",
        className
      )}
      {...props}
    />
  )
}

/** The part of a "full" dialog or a sheet that scrolls. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-4 sm:pb-6 [&:has(+[data-slot=dialog-footer])]:pb-4",
        className
      )}
      {...props}
    />
  )
}

/** Actions at the bottom of a "full" dialog. Stays put while the body scrolls. Put it after DialogBody. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-none flex-wrap items-center gap-2 border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4",
        className
      )}
      {...props}
    />
  )
}

export { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogTitle, DialogTrigger }
