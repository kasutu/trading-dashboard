//! Historical candles from TradingView's chart websocket, without an account. The same messages the
//! unofficial TradingView-API library sends (https://github.com/Mathieu2301/TradingView-API).
//! Without an account TradingView serves about 7,000 one-minute bars, so older windows only exist in
//! longer candles; the caller steps up (see `routes::candles`).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

const URL: &str = "wss://data.tradingview.com/socket.io/websocket?from=chart&type=chart";
const TIMEOUT: Duration = Duration::from_secs(20);

/// One bar: start time (unix seconds) and prices.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub struct Bar {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

#[derive(Debug, PartialEq)]
pub enum FetchError {
    /// The symbol has no bars in this window at this length (or not without an account).
    NoData,
    /// TradingView does not know the symbol.
    Symbol,
    Other(String),
}

/// `~m~<length>~m~<payload>`. The length counts UTF-16 units, like JavaScript.
pub fn frame(payload: &str) -> String {
    format!("~m~{}~m~{payload}", payload.encode_utf16().count())
}

/// The payloads in one websocket message.
pub fn unframe(msg: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = msg;
    while let Some(after) = rest.strip_prefix("~m~") {
        let Some(end) = after.find("~m~") else { break };
        let Ok(len) = after[..end].parse::<usize>() else {
            break;
        };
        let body = &after[end + 3..];
        // Walk UTF-16 units to the byte where the payload ends.
        let mut units = 0;
        let cut = body
            .char_indices()
            .find(|(_, c)| {
                let done = units >= len;
                units += c.len_utf16();
                done
            })
            .map_or(body.len(), |(i, _)| i);
        out.push(&body[..cut]);
        rest = &body[cut..];
    }
    out
}

/// TradingView's code for a candle length: "1m" → "1", "1h" → "60", "1d" → "D".
pub fn resolution(tf: &str) -> Option<&'static str> {
    Some(match tf {
        "1m" => "1",
        "5m" => "5",
        "15m" => "15",
        "1h" => "60",
        "4h" => "240",
        "1d" => "D",
        _ => return None,
    })
}

const CRYPTO: [&str; 14] = [
    "BTC", "ETH", "LTC", "XRP", "SOL", "ADA", "DOGE", "BNB", "DOT", "AVAX", "LINK", "XLM", "BCH",
    "TRX",
];

/// TradingView symbols to try for a broker symbol, best first. Broker suffixes ("XAUUSDm", "EURUSD.r")
/// are dropped.
// ponytail: forex, metals and the big coins only. Indices and stocks need a map when someone trades them.
pub fn candidates(broker: &str) -> Vec<String> {
    let s = broker.trim_end_matches(|c: char| c.is_ascii_lowercase());
    let s = s
        .split(|c: char| !c.is_ascii_alphanumeric())
        .next()
        .unwrap_or("")
        .to_uppercase();
    if s.is_empty() {
        return vec![];
    }
    if CRYPTO.iter().any(|c| s.starts_with(c)) {
        let usdt = s
            .strip_suffix("USD")
            .map_or(s.clone(), |b| format!("{b}USDT"));
        return vec![
            format!("BITSTAMP:{s}"),
            format!("COINBASE:{s}"),
            format!("BINANCE:{usdt}"),
        ];
    }
    vec![
        format!("OANDA:{s}"),
        format!("FX:{s}"),
        format!("FOREXCOM:{s}"),
    ]
}

/// Broker symbol → the TradingView symbol that answered, for this process.
fn resolved() -> &'static Mutex<HashMap<String, String>> {
    static MAP: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    MAP.get_or_init(Default::default)
}

/// Up to `count` bars of `tf` that start by `to` (unix seconds), for a broker symbol. Tries the
/// TradingView symbols from [`candidates`] until one is known.
pub async fn bars(broker: &str, tf: &str, to: i64, count: u32) -> Result<Vec<Bar>, FetchError> {
    let res = resolution(tf).ok_or_else(|| FetchError::Other(format!("unknown length {tf}")))?;
    let known = resolved().lock().unwrap().get(broker).cloned();
    let names = known.map_or_else(|| candidates(broker), |n| vec![n]);
    for name in names {
        match series(&name, res, to, count).await {
            Err(FetchError::Symbol) => continue,
            other => {
                resolved().lock().unwrap().insert(broker.to_string(), name);
                return other;
            }
        }
    }
    Err(FetchError::Symbol)
}

/// The websocket address. Tests point it at a local stand-in.
fn url() -> String {
    std::env::var("TRADINGVIEW_WS").unwrap_or_else(|_| URL.into())
}

/// One chart session: resolve the symbol, ask for `count` bars ending at `to`, read them until the
/// series completes.
async fn series(symbol: &str, res: &str, to: i64, count: u32) -> Result<Vec<Bar>, FetchError> {
    let other = |e: &dyn std::fmt::Display| FetchError::Other(e.to_string());
    let mut req = url().into_client_request().map_err(|e| other(&e))?;
    req.headers_mut()
        .insert("Origin", "https://www.tradingview.com".parse().unwrap());
    let (mut ws, _) = tokio::time::timeout(TIMEOUT, tokio_tungstenite::connect_async(req))
        .await
        .map_err(|e| other(&e))?
        .map_err(|e| other(&e))?;

    let cs = format!(
        "cs_{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let symbol_json = json!({ "symbol": symbol, "adjustment": "splits" }).to_string();
    for (m, p) in [
        ("set_auth_token", json!(["unauthorized_user_token"])),
        ("chart_create_session", json!([cs])),
        (
            "resolve_symbol",
            json!([cs, "ser_1", format!("={symbol_json}")]),
        ),
        (
            "create_series",
            json!([cs, "$prices", "s1", "ser_1", res, ["bar_count", to, count]]),
        ),
    ] {
        let msg = frame(&json!({ "m": m, "p": p }).to_string());
        ws.send(Message::text(msg)).await.map_err(|e| other(&e))?;
    }

    let mut out: Vec<Bar> = Vec::new();
    let read = async {
        while let Some(msg) = ws.next().await {
            let msg = msg.map_err(|e| other(&e))?;
            let Message::Text(text) = msg else { continue };
            let mut pongs = Vec::new();
            for payload in unframe(&text) {
                if payload.starts_with("~h~") {
                    pongs.push(frame(payload));
                    continue;
                }
                let Ok(v) = serde_json::from_str::<Value>(payload) else {
                    continue;
                };
                match v["m"].as_str() {
                    Some("timescale_update") => out.extend(parse_bars(&v["p"][1]["$prices"]["s"])),
                    Some("series_completed") => return Ok(()),
                    Some("symbol_error") => return Err(FetchError::Symbol),
                    Some("series_error" | "critical_error" | "protocol_error") => {
                        return Err(FetchError::Other(format!("tradingview: {}", v["p"])))
                    }
                    _ => {}
                }
            }
            // TradingView closes the connection when heartbeats are not echoed.
            for p in pongs {
                ws.send(Message::text(p)).await.map_err(|e| other(&e))?;
            }
        }
        Err(FetchError::Other(
            "tradingview closed the connection".into(),
        ))
    };
    let done = tokio::time::timeout(TIMEOUT, read)
        .await
        .map_err(|_| FetchError::Other("tradingview timed out".into()))?;
    let _ = ws.close(None).await;
    done?;
    if out.is_empty() {
        return Err(FetchError::NoData);
    }
    out.sort_by_key(|b| b.time);
    out.dedup_by_key(|b| b.time);
    Ok(out)
}

/// `[{ "i": 0, "v": [time, open, high, low, close, volume] }, ...]`
fn parse_bars(s: &Value) -> Vec<Bar> {
    s.as_array()
        .into_iter()
        .flatten()
        .filter_map(|b| {
            let v = b["v"].as_array()?;
            let n = |i: usize| v.get(i).and_then(Value::as_f64);
            Some(Bar {
                time: n(0)? as i64,
                open: n(1)?,
                high: n(2)?,
                low: n(3)?,
                close: n(4)?,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_round_trip() {
        let msg = format!(
            "{}{}{}",
            frame(r#"{"m":"a","p":["é"]}"#),
            frame("~h~7"),
            frame("{}")
        );
        assert_eq!(unframe(&msg), [r#"{"m":"a","p":["é"]}"#, "~h~7", "{}"]);
        // An emoji is two UTF-16 units.
        assert_eq!(frame("😀"), "~m~2~m~😀");
        assert_eq!(
            unframe(&format!("{}{}", frame("😀x"), frame("y"))),
            ["😀x", "y"]
        );
    }

    #[test]
    fn broker_symbols() {
        assert_eq!(candidates("XAUUSDm")[0], "OANDA:XAUUSD");
        assert_eq!(candidates("EURUSD.r")[0], "OANDA:EURUSD");
        assert_eq!(
            candidates("BTCUSD"),
            ["BITSTAMP:BTCUSD", "COINBASE:BTCUSD", "BINANCE:BTCUSDT"]
        );
        assert!(candidates("...").is_empty());
    }

    #[test]
    fn bars_from_an_update() {
        let s = json!([{ "i": 0, "v": [1790554200.0, 1.0, 2.0, 0.5, 1.5, 10.0] }, { "i": 1, "v": [1] }]);
        assert_eq!(
            parse_bars(&s),
            [Bar {
                time: 1790554200,
                open: 1.0,
                high: 2.0,
                low: 0.5,
                close: 1.5
            }]
        );
    }
}
