import { AlertTriangle } from "lucide-react"
import { Dashboard } from "@/components/dashboard/dashboard"
import { AppHeader } from "@/components/layout/app-header"
import { Welcome } from "@/components/upload/welcome"
import { useTheme } from "@/hooks/use-theme"
import { useTradeFile } from "@/hooks/use-trade-file"

export default function App() {
  const { file, error, load, clear } = useTradeFile()
  const theme = useTheme()

  return (
    <div className="min-h-svh">
      <AppHeader file={file} onFile={load} onClear={clear} dark={theme.dark} onToggleTheme={theme.toggle} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </div>
        )}
        {file ? <Dashboard trades={file.trades} /> : <Welcome onFile={load} />}
      </main>
    </div>
  )
}
