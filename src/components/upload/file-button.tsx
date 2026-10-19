import * as React from "react"
import { Button } from "@/components/ui/button"

type Props = Omit<React.ComponentProps<typeof Button>, "onClick"> & { onFile: (f: File) => void }

/** A button that opens the file picker for a CSV file. */
export function FileButton({ onFile, children, ...props }: Props) {
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ""
        }}
      />
      <Button {...props} onClick={() => ref.current?.click()}>{children}</Button>
    </>
  )
}
