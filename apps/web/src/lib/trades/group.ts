import type { Group, LocalTrade } from "./types"

export const round2 = (n: number) => Math.round(n * 100) / 100

export function group(key: string, ts: { net: number }[]): Group {
  let wins = 0, net = 0, gw = 0, gl = 0
  for (const t of ts) {
    net += t.net
    if (t.net > 0) { wins++; gw += t.net } else gl += t.net
  }
  return {
    key,
    trades: ts.length,
    wins,
    net: round2(net),
    winRate: ts.length ? wins / ts.length : 0,
    avg: ts.length ? round2(net / ts.length) : 0,
    grossWin: round2(gw),
    grossLoss: round2(gl),
  }
}

/** Group trades by key. Keys in `order` come first, in that order, even when empty. */
export function groupBy<T extends { net: number }>(ts: T[], keyFn: (t: T) => string, order?: string[]): Group[] {
  const m = new Map<string, T[]>()
  for (const k of order ?? []) m.set(k, [])
  for (const t of ts) {
    const k = keyFn(t)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(t)
  }
  return [...m.entries()].map(([k, v]) => group(k, v))
}

/** Trades grouped by calendar day, each day sorted by open time. */
export function perDay(ts: LocalTrade[]) {
  const m = new Map<string, LocalTrade[]>()
  for (const t of ts) {
    if (!m.has(t.day)) m.set(t.day, [])
    m.get(t.day)!.push(t)
  }
  for (const v of m.values()) v.sort((a, b) => +a.open - +b.open)
  return [...m.values()]
}

export const sumNet = (ts: { net: number }[]) => ts.reduce((s, t) => s + t.net, 0)

export const best = <T extends { net: number }>(xs: T[]) =>
  xs.reduce<T | undefined>((b, c) => (!b || c.net > b.net ? c : b), undefined)
