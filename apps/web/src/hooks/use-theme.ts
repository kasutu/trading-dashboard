import * as React from "react"
import { storage } from "@/lib/storage"

const KEY = "jurno:theme"

export function useTheme() {
  const [dark, setDark] = React.useState(() => {
    const saved = storage.get(KEY)
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches
  })
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    storage.set(KEY, dark ? "dark" : "light")
  }, [dark])
  return { dark, toggle: () => setDark((d) => !d) }
}
