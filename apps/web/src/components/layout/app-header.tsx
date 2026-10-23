import type * as React from "react"
import { Moon, Sun } from "lucide-react"
import { Link } from "wouter"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  dark: boolean
  onToggleTheme: () => void
  /** Signed in: only the mark on phones, and the theme switch moves into the user menu to make room. */
  compact?: boolean
  /** Controls on the right, before the theme button. */
  children?: React.ReactNode
}

export function AppHeader({ dark, onToggleTheme, compact, children }: Props) {
  return (
    // Phones: a near-solid bar. Blur only from sm up, where GPUs can afford it.
    <header className="sticky top-0 z-20 border-b bg-header-solid pt-[env(safe-area-inset-top)] sm:bg-header sm:backdrop-blur-xl sm:backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:gap-3 sm:px-6">
        <Link href="/" className="flex h-11 min-w-11 shrink-0 items-center rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Jurno home">
          <Logo compact={compact} />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
          {children}
          <Button
            variant="ghost"
            size="icon"
            className={cn(compact && "hidden sm:inline-flex")}
            onClick={onToggleTheme}
            aria-label={dark ? "Use light theme" : "Use dark theme"}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </div>
    </header>
  )
}
