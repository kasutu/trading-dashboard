import type * as React from "react"
import { Moon, Sun } from "lucide-react"
import { Link } from "wouter"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

type Props = {
  dark: boolean
  onToggleTheme: () => void
  /** Hide the wordmark on small screens to make room. */
  compact?: boolean
  /** Controls on the right, before the theme button. */
  children?: React.ReactNode
}

export function AppHeader({ dark, onToggleTheme, compact, children }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Jurno home">
          <Logo compact={compact} />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
          {children}
          <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label={dark ? "Use light theme" : "Use dark theme"}>
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </div>
    </header>
  )
}
