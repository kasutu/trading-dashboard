import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"
import { DialogBody, DialogClose, DialogDescription, DialogHeader, DialogOverlay } from "./dialog"

/** A dialog that fills the screen on phones (rising from the bottom) and slides in from the right edge from sm.
 *  Use SheetHeader and SheetBody inside, so the title stays put while the body scrolls. */
const Sheet = DialogPrimitive.Root
const SheetTitle = DialogPrimitive.Title
const SheetDescription = DialogDescription
const SheetHeader = DialogHeader
const SheetBody = DialogBody

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "motion-sheet fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-background shadow-lg outline-none",
          "sm:left-auto sm:max-w-md sm:border-l",
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

export { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle }
