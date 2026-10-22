import assert from "node:assert/strict"
import { test } from "node:test"
import { candidates, fallbacks } from "./market.ts"

test("broker symbols become TradingView symbols", () => {
  assert.equal(candidates("XAUUSDm")[0], "OANDA:XAUUSD")
  assert.equal(candidates("EURUSD.r")[0], "OANDA:EURUSD")
  assert.deepEqual(candidates("BTCUSD"), ["BITSTAMP:BTCUSD", "COINBASE:BTCUSD", "BINANCE:BTCUSDT"])
})

test("longer candles come after the asked length", () => {
  assert.deepEqual(fallbacks("15m"), ["15m", "1h", "4h", "1d"])
  assert.deepEqual(fallbacks("1d"), ["1d"])
})
