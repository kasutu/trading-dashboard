/** MetaTrader 5 reports: read the file's text and tell a report from a CSV file. The server parses it. */

/** The text of a file: UTF-16 (MT5 saves its HTML report as UTF-16 LE with a BOM) or UTF-8. */
export function decodeText(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  let encoding = "utf-8"
  if (b[0] === 0xff && b[1] === 0xfe) encoding = "utf-16le"
  else if (b[0] === 0xfe && b[1] === 0xff) encoding = "utf-16be"
  else if (b.length > 1 && b[0] !== 0 && b[1] === 0) encoding = "utf-16le"
  // TextDecoder drops the BOM.
  return new TextDecoder(encoding).decode(b)
}

/** An MT5 "Trade History Report" (History tab → Report → HTML). */
export function isMt5Report(text: string): boolean {
  return text.slice(0, 20_000).includes("Trade History Report") || (/>Positions</.test(text) && />Deals</.test(text))
}

/** Exness servers keep UTC; most other MT5 brokers run on UTC+2 or +3. */
export const isExness = (a: { server: string | null; company: string | null }) =>
  /exness/i.test(`${a.server ?? ""} ${a.company ?? ""}`)

/** Common MT5 server clocks first. "Europe/Athens" is UTC+2 in winter and +3 in summer, like most brokers. */
export const SERVER_TIMEZONES = ["UTC", "Europe/Athens", "Europe/London", "Europe/Berlin", "Europe/Moscow", "Asia/Dubai", "America/New_York"]
