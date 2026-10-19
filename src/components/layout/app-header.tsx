import { FileText, Moon, Sun, Upload, X } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { FileButton } from "@/components/upload/file-button"
import type { TradeFile } from "@/hooks/use-trade-file"
import { plural } from "@/lib/format"

type Props = {
  file: TradeFile | null
  onFile: (f: File) => void
  onClear: () => void
  dark: boolean
  onToggleTheme: () => void
}

export function AppHeader({ file, onFile, onClear, dark, onToggleTheme }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        {file && (
          <div className="hidden min-w-0 items-center gap-2 border-l pl-3 text-sm text-muted-foreground sm:flex">
            <FileText className="size-4 shrink-0" />
            <span className="truncate font-medium text-foreground">{file.name}</span>
            <span className="shrink-0">· {plural(file.trades.length, "trade")}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {file && (
            <>
              <FileButton onFile={onFile} variant="outline" size="sm">
                <Upload /> <span className="hidden sm:inline">Replace file</span>
              </FileButton>
              <Button variant="ghost" size="icon" onClick={onClear} aria-label="Remove file">
                <X />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label={dark ? "Use light theme" : "Use dark theme"}>
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </div>
    </header>
  )
}
