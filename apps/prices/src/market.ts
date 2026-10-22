// Broker symbols and candle lengths, in TradingView's terms.

export const TIMEFRAMES = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D" } as const
export type Timeframe = keyof typeof TIMEFRAMES
export const SECONDS: Record<Timeframe, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 }
export const isTimeframe = (tf: string): tf is Timeframe => tf in TIMEFRAMES

/** The asked length, then each longer one. Older windows often only exist in longer candles without an account. */
export const fallbacks = (tf: Timeframe) => (Object.keys(TIMEFRAMES) as Timeframe[]).slice(Object.keys(TIMEFRAMES).indexOf(tf))

const CRYPTO = /^(BTC|ETH|LTC|XRP|SOL|ADA|DOGE|BNB|DOT|AVAX|LINK|XLM|BCH|TRX)/

/** TradingView symbols to try for a broker symbol, best first. Broker suffixes ("XAUUSDm", "EURUSD.r") are dropped.
 *  ponytail: forex, metals and the big coins only. Indices and stocks need a map when someone trades them. */
export function candidates(brokerSymbol: string) {
  const s = brokerSymbol.replace(/[a-z]+$/, "").split(/[^A-Za-z0-9]/)[0].toUpperCase()
  if (CRYPTO.test(s)) return [`BITSTAMP:${s}`, `COINBASE:${s}`, `BINANCE:${s.replace(/USD$/, "USDT")}`]
  return [`OANDA:${s}`, `FX:${s}`, `FOREXCOM:${s}`]
}
