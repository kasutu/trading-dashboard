# exness_rs

Vendored copy of `hermes/exness_rs` (kasutu/hermes, commit 379eac7). The hermes repo is private, so the Docker build cannot fetch it. Change the SDK there first, then copy `src/`, `tests/` and `Cargo.toml` here. This copy also has two clippy fixes for Rust 1.99 (`is_multiple_of` in `signer.rs`, an allowed `large_enum_variant` on `TradingEvent`); keep them or make them upstream.

A Rust client for the Exness Trader API. The crate name is `exness`.

## Status

- Done: request signing (`Signer`) and a signed REST client (`Client`) with generic `get`, `post`, `patch`, and `delete`.
- Done: host settings. There is no default host; you give the host from Key Management. Optional host discovery (`discover_access_point`).
- Done: typed models (`exness::model`) and a typed method for every REST endpoint, plus `wait_operation` to poll for a trade result.
- To do: WebSocket streams (events and ticks).
- Live test passed on a demo account (signed GETs: discovery, account details, snapshot). Trading calls and streams are not tested live yet.

Remaining work and open questions: [TODO.md](TODO.md).

The API contract is `openapi/trading.public.yaml` (v1.0.2), copied from <https://www.exness-api.com/openapi/trading.public.yaml>.

## Keys

1. Make a private key: `openssl genpkey -algorithm ED25519 -out private.pem`
2. Export the public key to register in Key Management: `openssl pkey -in private.pem -pubout -outform DER | openssl base64 -A`
3. Keep `private.pem` outside the repo if you can, with `chmod 600 private.pem`. The repo ignores `*.pem` and `*.key` in case one ends up here.
4. Give the API key only the scopes it needs. Do not give it Payments scope.
5. If a key leaks, delete it in Key Management and make a new one.

The test files hold a dummy key (32 bytes of `0x11`). It is not linked to any account.

In memory, `Signer` does not print the key in `Debug` output, and the key bytes are cleared when the signer is dropped.

## Keys on a server

Exness never sees your private key. You register only the public key, and the server signs each request with the private key. So the server needs the private key at runtime, and nothing else does.

`Signer::from_env()` reads:

| Variable | Value |
|----------|-------|
| `EXN_API_BASE_URL` | The host shown in Key Management after you create the API key. A bare host is fine. Read by `Client::from_env()`. |
| `EXN_API_KEY` | API key identifier (not secret on its own) |
| `EXN_PRIVATE_KEY_FILE` | Path to the key file, PEM or hex. Preferred. |
| `EXN_PRIVATE_KEY` | The key itself, PEM or hex. Used only if the file variable is not set. |

Key Management can give the secret as 128 hex characters (the Ed25519 seed followed by its public key). `Signer::from_hex` reads that form.

Prefer a file from your secret store over an environment variable. Environment variables can show up in crash dumps, `docker inspect` and child processes.

| Where it runs | How to give it the key |
|---------------|------------------------|
| VPS with systemd | `LoadCredential=exness_key:/etc/exness/private.pem` in the unit, then `EXN_PRIVATE_KEY_FILE=${CREDENTIALS_DIRECTORY}/exness_key`. Keep the source file `chmod 600`, owned by root. |
| Docker / Compose | A `secrets:` entry. It appears at `/run/secrets/<name>`. |
| Kubernetes | A `Secret` mounted as a read-only volume. |
| Cloud | A secret manager (AWS Secrets Manager, GCP Secret Manager, Vault, Doppler) that writes the file or sets the variable at start. |

Rules:

- Make the key on the server, or in the secret store, not on a laptop. Copy only the public key out to register it.
- Use one key per environment (demo, live) and per server. Then you can revoke one without stopping the others.
- Give the key only the scopes it needs: trading, never payments.
- The API checks the request's source IP against the key. Give the server a static outbound IP and allow only that IP.
- To rotate: register a new public key, deploy the new private key, check it works, then delete the old key in Key Management.

## Use

```rust
use std::time::Duration;
use exness::{Client, new_idempotency_key};
use exness::model::{OpenPositionRequest, Side};

let client = Client::from_env()?; // or Client::new(host, Signer::from_pkcs8_pem(api_key, &pem)?)
let account = client.account_details(id).await?;

// Trading calls return a 202 ack. Keep the key to retry the same request safely.
let key = new_idempotency_key();
let req = OpenPositionRequest::new("XAUUSDm", Side::Buy, "0.01").stop_loss("2590.5");
let ack = client.open_position(id, &req, &key).await?;

// The result arrives as a transaction event, or poll for it:
let op = ack.operation_id.expect("operation id");
let status = client.wait_operation(id, &op, Duration::from_millis(250), Duration::from_secs(10)).await?;
```

| Method | Endpoint |
|--------|----------|
| `account_details`, `instruments`, `instrument_conditions`, `limits` | `/v1/configuration/...` |
| `candles` | `GET /v1/market-data/.../candles` |
| `snapshot`, `operation_status`, `wait_operation` | `GET /v1/trading/...` |
| `open_position`, `close_position` | `POST`, `DELETE .../positions` |
| `place_order`, `modify_order`, `cancel_order` | `POST`, `PATCH`, `DELETE .../orders` |
| `orders_history`, `deals_history` | `GET /v1/history/...`, paged with `HistoryQuery::next_page` |

Prices, volumes, and money are decimal strings, as the API sends them. Parse them where you need math.

## Host

Key Management lists `api.exness.com` (main) and `api.exness-api.com` (alternative). In the live test these served only host discovery; account calls on them returned 404. Find your account's own host once and set it as `EXN_API_BASE_URL`:

```sh
EXN_API_BASE_URL=api.exness.com EXN_API_KEY=... EXN_PRIVATE_KEY=... EXN_ACCOUNT_ID=... cargo run --example discover
# AccessPoint { access_point: "https://ap-xxxxxxxx.exness.com", ... }
```

In code: `client.with_access_point(&client.discover_access_point(id).await?)`. The docs mark that endpoint as provisional, and it is not in the OpenAPI file. The SDK has no default host, so a missing host is an error, not a silent wrong host.

The SDK sends `User-Agent: exness-rs/<version>`. Cloudflare in front of the API blocks requests without one. If you pass your own client with `with_http`, give it a user agent.

Mutating calls need an idempotency key: 5 to 128 characters of `A-Z a-z 0-9 . _ - ~`. Use the same key to retry the same request safely.

Run the example:

```sh
EXN_API_BASE_URL=<host> EXN_API_KEY=... EXN_PRIVATE_KEY_FILE=/path/to/private.pem EXN_ACCOUNT_ID=... cargo run --example account
```

## Test

```sh
cargo test
```
