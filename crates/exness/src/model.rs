//! Request and response types from `openapi/trading.public.yaml`.
//!
//! - Prices, volumes, and money are decimal strings on the wire (`"2650.15"`).
//!   They stay `String` here, so no precision is lost. Parse them where you need math.
//! - IDs are `u64` sent as strings. They stay `String`.
//! - Times are RFC 3339 strings.
//! - The spec marks few fields as required, so most fields are `Option`.
//! - Every enum has an `Unknown` variant, so a new server value does not break decoding.

use serde::{Deserialize, Serialize};

macro_rules! wire_enum {
    ($(#[$m:meta])* $name:ident { $($variant:ident = $wire:literal),+ $(,)? }) => {
        $(#[$m])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        pub enum $name {
            $(#[serde(rename = $wire)] $variant,)+
            /// A value this SDK does not know yet.
            #[serde(other)]
            Unknown,
        }

        impl $name {
            /// The value as sent on the wire.
            pub fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $wire,)+
                    Self::Unknown => "unknown",
                }
            }
        }
    };
}

wire_enum!(Side { Buy = "buy", Sell = "sell" });
wire_enum!(OrderType { Market = "market", Stop = "stop", Limit = "limit", Sltp = "sltp" });
wire_enum!(OrderState {
    PendingNew = "pending_new",
    Placed = "placed",
    Filled = "filled",
    Cancelled = "cancelled",
    Rejected = "rejected",
});
wire_enum!(PositionState { Open = "open", Closed = "closed" });
wire_enum!(DealType {
    Open = "open",
    Close = "close",
    Balance = "balance",
    NullCompensation = "null_compensation",
    SwapFee = "swap_fee",
    AdminFee = "admin_fee",
    Dividend = "dividend",
    ExnessDollar = "exness_dollar",
});
wire_enum!(OrderReason {
    Undefined = "undefined",
    StopLoss = "sl",
    TakeProfit = "tp",
    StopOut = "so",
    MarginCheckFailed = "margin_check_failed",
    Dealer = "dealer",
    CloseBy = "close_by",
    StockSplit = "stock_split",
    TradingServer = "trading_server",
});
wire_enum!(OperationState {
    Pending = "pending",
    Confirmed = "confirmed",
    Rejected = "rejected",
    Failed = "failed",
});
wire_enum!(AckStatus { Accepted = "accepted" });
wire_enum!(TradingEventStatus { Success = "success", Failed = "failed", Rejected = "rejected" });
wire_enum!(InstrumentEventAction { New = "new", Update = "upd", Delete = "del" });
wire_enum!(AccountTradingStatus { Active = "active", CloseOnly = "close_only" });
wire_enum!(ExecutionMode { Undefined = "undefined", Instant = "instant", Market = "market" });
wire_enum!(CalculationMode {
    Undefined = "undefined",
    Forex = "forex",
    ForexNoLeverage = "forex_no_leverage",
    Cfd = "cfd",
    CfdLeverage = "cfd_leverage",
});
wire_enum!(TradeMode { Enabled = "enabled", TradingDisabled = "trading_disabled" });
wire_enum!(InstrumentOrderType {
    Stop = "stop",
    Limit = "limit",
    StopLimit = "stoplimit",
    Market = "market",
});
wire_enum!(FillingMode { Fok = "fok", Ioc = "ioc", Boc = "boc" });
wire_enum!(CommissionType {
    Undefined = "undefined",
    PerLotPerSide = "per_lot_per_side",
    PerLotPerTrade = "per_lot_per_trade",
    PerMillionUsd = "per_million_usd",
});
wire_enum!(HttpMethod { Get = "GET", Post = "POST", Put = "PUT", Patch = "PATCH", Delete = "DELETE" });
wire_enum!(HmrPeriodEventType { Regular = "regular", Periodic = "periodic" });
wire_enum!(Timeframe {
    S1 = "S1",
    S5 = "S5",
    S15 = "S15",
    M1 = "M1",
    M3 = "M3",
    M5 = "M5",
    M10 = "M10",
    M15 = "M15",
    M30 = "M30",
    H1 = "H1",
    H2 = "H2",
    H4 = "H4",
    D1 = "D1",
    W1 = "W1",
    MN = "MN",
});
wire_enum!(PriceType { Bid = "bid", Ask = "ask", Both = "both" });

// ---------- Trading state ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AccountState {
    pub balance: String,
    pub equity: String,
    pub used_margin: String,
    /// Sent only inside transaction events.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leverage: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Order {
    pub order_id: String,
    pub order_type: OrderType,
    pub state: OrderState,
    pub create_time: String,
    #[serde(default)]
    pub position_id: Option<String>,
    #[serde(default)]
    pub direction: Option<Side>,
    #[serde(default)]
    pub instrument: Option<String>,
    #[serde(default)]
    pub price: Option<String>,
    #[serde(default)]
    pub stop_loss_price: Option<String>,
    #[serde(default)]
    pub take_profit_price: Option<String>,
    #[serde(default)]
    pub update_time: Option<String>,
    #[serde(default)]
    pub volume: Option<String>,
    #[serde(default)]
    pub reason: Option<OrderReason>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Position {
    pub position_id: String,
    pub direction: Side,
    pub instrument: String,
    pub state: PositionState,
    pub create_time: String,
    pub volume: String,
    #[serde(default)]
    pub initial_volume: Option<String>,
    #[serde(default)]
    pub open_price: Option<String>,
    #[serde(default)]
    pub margin_rate: Option<String>,
    #[serde(default)]
    pub commission: Option<String>,
    #[serde(default)]
    pub swap: Option<String>,
    #[serde(default)]
    pub rollover_time: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Money {
    pub amount: String,
    pub currency: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Deal {
    pub deal_id: String,
    #[serde(rename = "type")]
    pub deal_type: DealType,
    pub create_time: String,
    #[serde(default)]
    pub order_id: Option<String>,
    #[serde(default)]
    pub position_id: Option<String>,
    #[serde(default)]
    pub direction: Option<Side>,
    #[serde(default)]
    pub instrument: Option<String>,
    #[serde(default)]
    pub volume: Option<String>,
    #[serde(default)]
    pub price: Option<String>,
    #[serde(default)]
    pub profit: Option<Money>,
    #[serde(default)]
    pub commission: Option<String>,
}

/// `GET .../snapshot`, and the first event on the events stream.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TradingStateSnapshot {
    pub account_state: AccountState,
    #[serde(default)]
    pub orders: Vec<Order>,
    #[serde(default)]
    pub positions: Vec<Position>,
}

// ---------- Requests ----------

/// `POST .../positions`: a market order that opens a position.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpenPositionRequest {
    pub instrument: String,
    pub side: Side,
    pub volume: String,
    /// Requested price, for execution modes that take one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price: Option<String>,
    /// Maximum price deviation in points.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deviation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_profit_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

impl OpenPositionRequest {
    pub fn new(instrument: impl Into<String>, side: Side, volume: impl Into<String>) -> Self {
        Self {
            instrument: instrument.into(),
            side,
            volume: volume.into(),
            price: None,
            deviation: None,
            stop_loss_price: None,
            take_profit_price: None,
            comment: None,
        }
    }

    pub fn stop_loss(mut self, price: impl Into<String>) -> Self {
        self.stop_loss_price = Some(price.into());
        self
    }

    pub fn take_profit(mut self, price: impl Into<String>) -> Self {
        self.take_profit_price = Some(price.into());
        self
    }

    pub fn comment(mut self, comment: impl Into<String>) -> Self {
        self.comment = Some(comment.into());
        self
    }
}

/// The fields of a limit or stop order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PriceOrder {
    pub instrument: String,
    pub side: Side,
    pub volume: String,
    pub price: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_profit_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// An SL/TP order attached to an open position.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SltpOrder {
    pub position_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_profit_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// `POST .../orders`. The `type` field picks the variant.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum NewPendingOrder {
    Limit(PriceOrder),
    Stop(PriceOrder),
    Sltp(SltpOrder),
}

impl NewPendingOrder {
    fn price_order(
        instrument: impl Into<String>,
        side: Side,
        volume: impl Into<String>,
        price: impl Into<String>,
    ) -> PriceOrder {
        PriceOrder {
            instrument: instrument.into(),
            side,
            volume: volume.into(),
            price: price.into(),
            stop_loss_price: None,
            take_profit_price: None,
            comment: None,
        }
    }

    pub fn limit(
        instrument: impl Into<String>,
        side: Side,
        volume: impl Into<String>,
        price: impl Into<String>,
    ) -> Self {
        Self::Limit(Self::price_order(instrument, side, volume, price))
    }

    pub fn stop(
        instrument: impl Into<String>,
        side: Side,
        volume: impl Into<String>,
        price: impl Into<String>,
    ) -> Self {
        Self::Stop(Self::price_order(instrument, side, volume, price))
    }

    pub fn sltp(
        position_id: impl Into<String>,
        stop_loss_price: Option<String>,
        take_profit_price: Option<String>,
    ) -> Self {
        Self::Sltp(SltpOrder {
            position_id: position_id.into(),
            stop_loss_price,
            take_profit_price,
            comment: None,
        })
    }

    fn fields(
        &mut self,
    ) -> (
        &mut Option<String>,
        &mut Option<String>,
        &mut Option<String>,
    ) {
        match self {
            Self::Limit(o) | Self::Stop(o) => (
                &mut o.stop_loss_price,
                &mut o.take_profit_price,
                &mut o.comment,
            ),
            Self::Sltp(o) => (
                &mut o.stop_loss_price,
                &mut o.take_profit_price,
                &mut o.comment,
            ),
        }
    }

    pub fn stop_loss(mut self, price: impl Into<String>) -> Self {
        *self.fields().0 = Some(price.into());
        self
    }

    pub fn take_profit(mut self, price: impl Into<String>) -> Self {
        *self.fields().1 = Some(price.into());
        self
    }

    pub fn comment(mut self, comment: impl Into<String>) -> Self {
        *self.fields().2 = Some(comment.into());
        self
    }
}

/// `PATCH .../orders/{order_id}`. Only the fields you set are sent.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModifyOrderRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_loss_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub take_profit_price: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

/// Query options for `DELETE .../positions/{position_id}`. The default closes the full position.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ClosePosition {
    /// Partial close volume. `None` closes all of it.
    pub volume: Option<String>,
    pub price: Option<String>,
    /// Maximum price deviation in points.
    pub deviation: Option<String>,
    /// Close against this opposite position (close-by).
    pub close_by_position_id: Option<String>,
}

// ---------- Responses ----------

/// The `202` answer to every trading call. The result arrives later as a
/// `transaction_event`, or from [`crate::Client::operation_status`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AckResponse {
    pub status: AckStatus,
    #[serde(default)]
    pub operation_id: Option<String>,
    /// The idempotency key, echoed back.
    #[serde(default)]
    pub client_request_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OperationStatus {
    pub operation_id: String,
    pub status: OperationState,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub client_request_id: Option<String>,
    #[serde(default)]
    pub error_code: Option<i32>,
    #[serde(default)]
    pub error_message: Option<String>,
}

impl OperationStatus {
    /// True once the status is no longer `pending`.
    pub fn is_final(&self) -> bool {
        self.status != OperationState::Pending
    }
}

/// One mid candle (price type `bid` or `ask`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Candle {
    pub time: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    #[serde(default)]
    pub volume: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CandleSide {
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

/// One candle with both sides (price type `both`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CandleBidAsk {
    pub time: String,
    pub bid: CandleSide,
    pub ask: CandleSide,
    #[serde(default)]
    pub volume: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AnyCandle {
    BidAsk(CandleBidAsk),
    Single(Candle),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CandleHistory {
    #[serde(default)]
    pub candles: Vec<AnyCandle>,
}

/// Options for `GET .../candles`. `to` and `count` cannot both be set.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandleQuery {
    pub instrument: String,
    pub timeframe: Timeframe,
    /// RFC 3339 start time.
    pub from: String,
    pub to: Option<String>,
    /// Non-zero. Negative counts back from `from`.
    pub count: Option<i64>,
    /// The server default is `bid`.
    pub price_type: Option<PriceType>,
}

impl CandleQuery {
    pub fn new(
        instrument: impl Into<String>,
        timeframe: Timeframe,
        from: impl Into<String>,
    ) -> Self {
        Self {
            instrument: instrument.into(),
            timeframe,
            from: from.into(),
            to: None,
            count: None,
            price_type: None,
        }
    }

    pub fn to(mut self, to: impl Into<String>) -> Self {
        self.to = Some(to.into());
        self
    }

    pub fn count(mut self, count: i64) -> Self {
        self.count = Some(count);
        self
    }

    pub fn price_type(mut self, price_type: PriceType) -> Self {
        self.price_type = Some(price_type);
        self
    }
}

/// Options for the history endpoints. Give `from`, or a `cursor` from the previous page.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HistoryQuery {
    /// Inclusive RFC 3339 start (UTC).
    pub from: Option<String>,
    /// Exclusive RFC 3339 end (UTC).
    pub to: Option<String>,
    pub cursor: Option<String>,
    /// 1..=200. The server default is 100.
    pub limit: Option<u32>,
    pub instrument: Option<String>,
    /// Orders only.
    pub order_state: Option<OrderState>,
    /// Deals only.
    pub deal_type: Option<DealType>,
}

impl HistoryQuery {
    pub fn from(from: impl Into<String>) -> Self {
        Self {
            from: Some(from.into()),
            ..Self::default()
        }
    }

    /// The query for the page after `cursor`.
    pub fn next_page(&self, cursor: impl Into<String>) -> Self {
        Self {
            from: None,
            to: None,
            cursor: Some(cursor.into()),
            ..self.clone()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimeRange {
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

/// One page of history. Pass `next_cursor` to [`HistoryQuery::next_page`] while `has_more`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoryPage<T> {
    pub items: Vec<T>,
    #[serde(default)]
    pub next_cursor: Option<String>,
    #[serde(default)]
    pub has_more: bool,
    #[serde(default)]
    pub range: Option<TimeRange>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrderHistoryItem {
    pub event_time: String,
    pub order: Order,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DealHistoryItem {
    pub event_time: String,
    pub deal: Deal,
}

// ---------- Configuration ----------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountSettings {
    pub currency: String,
    pub leverage: String,
    pub account_status: AccountTradingStatus,
    pub trade_mode: TradeMode,
    pub execution_mode: ExecutionMode,
    #[serde(default)]
    pub margin_call_level: Option<String>,
    #[serde(default)]
    pub stopout_level: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountDetails {
    pub account_id: String,
    pub create_date: String,
    #[serde(default)]
    pub account_name: Option<String>,
    #[serde(default)]
    pub settings: Option<AccountSettings>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstrumentList {
    #[serde(default)]
    pub instruments: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SwapMultiplier {
    #[serde(default)]
    pub day: Option<String>,
    #[serde(default)]
    pub multiplier: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommissionSettings {
    #[serde(default)]
    pub commission_type: Option<CommissionType>,
    #[serde(default)]
    pub commission_value: Option<Money>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstrumentSession {
    #[serde(default)]
    pub trade_mode: Option<TradeMode>,
    #[serde(default)]
    pub week_start_time: Option<String>,
    #[serde(default)]
    pub week_end_time: Option<String>,
}

/// `GET .../instruments/{instrument}/conditions`, and the payload of instrument events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstrumentConditions {
    pub instrument: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub international_name: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub base_currency: Option<String>,
    #[serde(default)]
    pub quote_currency: Option<String>,
    #[serde(default)]
    pub margin_currency: Option<String>,
    #[serde(default)]
    pub point_digits: Option<i32>,
    #[serde(default)]
    pub calc_mode: Option<CalculationMode>,
    #[serde(default)]
    pub exec_mode: Option<ExecutionMode>,
    #[serde(default)]
    pub margin_percent: Option<String>,
    #[serde(default)]
    pub contract_size: Option<String>,
    #[serde(default)]
    pub volume_min: Option<String>,
    #[serde(default)]
    pub volume_max: Option<String>,
    #[serde(default)]
    pub volume_step: Option<String>,
    #[serde(default)]
    pub swap_long: Option<String>,
    #[serde(default)]
    pub swap_short: Option<String>,
    #[serde(default)]
    pub swap_multipliers: Vec<SwapMultiplier>,
    #[serde(default)]
    pub trade_mode: Option<TradeMode>,
    #[serde(default)]
    pub order_types: Vec<InstrumentOrderType>,
    #[serde(default)]
    pub filling_modes: Vec<FillingMode>,
    #[serde(default)]
    pub trade_sessions: Vec<InstrumentSession>,
    #[serde(default)]
    pub commission_settings: Option<CommissionSettings>,
}

// ---------- Limits ----------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RateLimit {
    pub limit: u64,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OperationRequestLimits {
    #[serde(default)]
    pub max_candles_per_request: Option<u64>,
    #[serde(default)]
    pub max_candles_per_request_description: Option<String>,
    #[serde(default)]
    pub history_range_days: Option<u64>,
    #[serde(default)]
    pub history_age_days: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RestMethodLimits {
    pub api_operation_id: String,
    pub http_method: HttpMethod,
    pub path: String,
    pub rate_limit: RateLimit,
    #[serde(default)]
    pub limits: Option<OperationRequestLimits>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RestLimits {
    pub global_account_rate: RateLimit,
    pub methods: Vec<RestMethodLimits>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TokenBucketLimit {
    pub limit: u64,
    pub window_seconds: f64,
    pub burst: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StrikeLimits {
    pub refill_amount: u64,
    pub threshold: u64,
    pub period_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WebSocketGlobalLimits {
    pub max_active_connections: u64,
    pub max_inbound_message_bytes: u64,
    pub connection_rate: TokenBucketLimit,
    pub inbound_message_rate: TokenBucketLimit,
    pub strikes: StrikeLimits,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WebSocketEndpointLimits {
    pub api_operation_id: String,
    pub http_method: HttpMethod,
    pub path: String,
    pub connection_rate: TokenBucketLimit,
    pub inbound_message_rate: TokenBucketLimit,
    /// The spec gives no shape for this. Kept as raw JSON.
    pub subscription_operation_rate: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WebSocketLimits {
    pub global_account_limits: WebSocketGlobalLimits,
    pub endpoints: Vec<WebSocketEndpointLimits>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ApiLimits {
    pub rest: RestLimits,
    pub websocket: WebSocketLimits,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LimitsResponse {
    pub limits: ApiLimits,
}

// ---------- Stream messages (decoded by the WebSocket client, not built yet) ----------

/// One tick from `/ws/ticks`. The docs' example accepts `bid` and `ask` as
/// numbers or strings, so both are read.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Tick {
    pub instrument: String,
    #[serde(deserialize_with = "number_or_string")]
    pub bid: f64,
    #[serde(deserialize_with = "number_or_string")]
    pub ask: f64,
    #[serde(default)]
    pub timestamp: Option<String>,
}

fn number_or_string<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum NumOrStr {
        Num(f64),
        Str(String),
    }
    match NumOrStr::deserialize(d)? {
        NumOrStr::Num(n) => Ok(n),
        NumOrStr::Str(s) => s.parse().map_err(serde::de::Error::custom),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransactionPayload {
    #[serde(default)]
    pub orders: Vec<Order>,
    #[serde(default)]
    pub positions: Vec<Position>,
    #[serde(default)]
    pub deals: Vec<Deal>,
    #[serde(default)]
    pub account_state: Option<AccountState>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransactionEvent {
    pub payload: TransactionPayload,
    #[serde(default)]
    pub operation_id: Option<String>,
    #[serde(default)]
    pub client_request_id: Option<String>,
    #[serde(default)]
    pub status: Option<TradingEventStatus>,
    #[serde(default)]
    pub error_code: Option<i32>,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub event_time: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AccountStatePayload {
    pub account_state: AccountState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AccountStateEvent {
    pub event_time: String,
    pub payload: AccountStatePayload,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InstrumentEvent {
    pub event_time: String,
    pub action: InstrumentEventAction,
    pub payload: InstrumentConditions,
}

/// A high margin requirement period: lower leverage on some instruments.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HmrPeriod {
    pub period_id: String,
    pub event_type: HmrPeriodEventType,
    pub instruments: Vec<String>,
    pub leverage: String,
    pub start_time: String,
    pub end_time: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HmrSnapshot {
    pub periods: Vec<HmrPeriod>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HmrUpdate {
    pub upserted_periods: Vec<HmrPeriod>,
    pub removed_period_ids: Vec<String>,
}

/// One message from `/ws/events`, keyed by `event_type`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "event_type", rename_all = "snake_case")]
#[allow(clippy::large_enum_variant)]
pub enum TradingEvent {
    #[serde(rename = "trading_state_snapshot")]
    Snapshot {
        payload: TradingStateSnapshot,
    },
    #[serde(rename = "transaction_event")]
    Transaction(TransactionEvent),
    #[serde(rename = "account_state_event")]
    AccountState(AccountStateEvent),
    #[serde(rename = "instrument_event")]
    Instrument(InstrumentEvent),
    HmrSnapshot(HmrSnapshot),
    HmrUpdate(HmrUpdate),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pending_order_has_type_tag() {
        let o = NewPendingOrder::limit("XAUUSDm", Side::Buy, "0.01", "2600.5").stop_loss("2590");
        assert_eq!(
            serde_json::to_value(&o).unwrap(),
            json!({"type":"limit","instrument":"XAUUSDm","side":"buy","volume":"0.01","price":"2600.5","stop_loss_price":"2590"})
        );
        let s = NewPendingOrder::sltp("77", None, Some("2700".into()));
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            json!({"type":"sltp","position_id":"77","take_profit_price":"2700"})
        );
    }

    #[test]
    fn unknown_enum_value_decodes() {
        let s: OrderState = serde_json::from_value(json!("something_new")).unwrap();
        assert_eq!(s, OrderState::Unknown);
    }

    #[test]
    fn candles_decode_both_shapes() {
        let h: CandleHistory = serde_json::from_value(json!({"candles":[
            {"time":"2026-01-01T00:00:00Z","open":1.0,"high":2.0,"low":0.5,"close":1.5,"volume":10.0},
            {"time":"2026-01-01T00:01:00Z",
             "bid":{"open":1.0,"high":2.0,"low":0.5,"close":1.5},
             "ask":{"open":1.1,"high":2.1,"low":0.6,"close":1.6}}
        ]}))
        .unwrap();
        assert!(matches!(h.candles[0], AnyCandle::Single(_)));
        assert!(matches!(h.candles[1], AnyCandle::BidAsk(_)));
    }

    #[test]
    fn tick_accepts_numbers_and_strings() {
        let t: Tick =
            serde_json::from_value(json!({"instrument":"XAUUSDm","bid":"2650.1","ask":2650.3}))
                .unwrap();
        assert_eq!((t.bid, t.ask), (2650.1, 2650.3));
    }

    #[test]
    fn trading_events_decode_by_event_type() {
        let e: TradingEvent = serde_json::from_value(json!({
            "event_type":"transaction_event",
            "operation_id":"9","client_request_id":"order-0001","status":"success",
            "payload":{"positions":[{"position_id":"5","direction":"sell","instrument":"XAUUSDm",
                "state":"open","create_time":"2026-01-01T00:00:00Z","volume":"0.01"}],
                "account_state":{"balance":"100","equity":"99","used_margin":"1","leverage":"1:2000"}}
        }))
        .unwrap();
        let TradingEvent::Transaction(t) = e else {
            panic!("wrong variant")
        };
        assert_eq!(t.client_request_id.as_deref(), Some("order-0001"));
        assert_eq!(t.payload.positions[0].direction, Side::Sell);

        let e: TradingEvent = serde_json::from_value(json!({
            "event_type":"trading_state_snapshot",
            "payload":{"account_state":{"balance":"1","equity":"1","used_margin":"0"}}
        }))
        .unwrap();
        assert!(matches!(e, TradingEvent::Snapshot { .. }));

        let e: TradingEvent = serde_json::from_value(
            json!({"event_type":"hmr_update","upserted_periods":[],"removed_period_ids":["3"]}),
        )
        .unwrap();
        assert!(matches!(e, TradingEvent::HmrUpdate(_)));
    }
}
