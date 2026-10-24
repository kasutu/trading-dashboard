import type * as React from "react"
import { money, pnlClass } from "@/lib/format"

/** The one number a card is about, like the result on the trade share card. */
export type Metric = {
  value: React.ReactNode
  /** What the number is, in a few words: "Best hour: 9 AM". */
  label?: React.ReactNode
  /** A number: green or red by its sign (for P&L). "profit" or "loss" for a good or bad figure. Leave out for neutral. */
  tone?: number | "profit" | "loss"
  /** At most four quiet label and value pairs under it. */
  stats?: [label: React.ReactNode, value: React.ReactNode][]
}

export const toneClass = (tone: Metric["tone"]) =>
  tone === undefined ? "" : typeof tone === "number" ? pnlClass(tone) : tone === "profit" ? "text-profit" : "text-loss"

/** The row with the lowest net. */
export const worst = <T extends { net: number }>(xs: T[]) =>
  xs.reduce<T | undefined>((w, c) => (!w || c.net < w.net ? c : w), undefined)

/** Headline for a breakdown: the best group's net P&L, named in the label, and the worst one as a quiet stat.
 *  `name` turns a key into words ("9 AM"). */
export function bestMetric<T extends { key: string; net: number }>(
  rows: T[],
  what: string,
  name: (key: string) => string = (k) => k,
  value: (r: T) => number = (r) => r.net
): Metric | undefined {
  const top = rows.reduce<T | undefined>((b, c) => (!b || value(c) > value(b) ? c : b), undefined)
  if (!top) return undefined
  const low = rows.reduce<T | undefined>((b, c) => (!b || value(c) < value(b) ? c : b), undefined)
  const word = (w: string) => (what ? `${w} ${what}` : w)
  return {
    value: money(value(top), true),
    tone: value(top),
    label: `${word("Best")}: ${name(top.key)}`,
    stats: low && low !== top ? [[`${word("Worst")}: ${name(low.key)}`, money(value(low), true)]] : undefined,
  }
}
