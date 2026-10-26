//! Request signing for the Exness Trader API (`EXN-SIGN-VERSION: 1`).
//!
//! The signer builds a JSON payload with the signed fields, encodes it as
//! base64url without padding (`EXN-DATA`), and signs the payload bytes with
//! Ed25519 (`EXN-SIGN`).

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::pkcs8::DecodePrivateKey;
use ed25519_dalek::{Signer as _, SigningKey, VerifyingKey};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::Error;

pub const SIGN_VERSION: u8 = 1;

/// The signed fields. The field order follows the API docs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SignedData<'a> {
    pub api_key: &'a str,
    pub idempotency_key: &'a str,
    pub timestamp: u64,
    pub sign_version: u8,
    pub method: &'a str,
    pub path: &'a str,
    pub body_hash: String,
}

/// The six `EXN-*` headers for one request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedHeaders {
    pub api_key: String,
    pub idempotency_key: String,
    pub timestamp: String,
    pub sign_version: String,
    pub data: String,
    pub sign: String,
}

impl SignedHeaders {
    /// Header name and value pairs, ready to add to a request.
    pub fn pairs(&self) -> [(&'static str, &str); 6] {
        [
            ("EXN-API-KEY", &self.api_key),
            ("EXN-IDEMPOTENCY-KEY", &self.idempotency_key),
            ("EXN-TIMESTAMP", &self.timestamp),
            ("EXN-SIGN-VERSION", &self.sign_version),
            ("EXN-DATA", &self.data),
            ("EXN-SIGN", &self.sign),
        ]
    }
}

/// Signs requests with one API key and its Ed25519 private key.
#[derive(Clone)]
pub struct Signer {
    api_key: String,
    key: SigningKey,
}

impl std::fmt::Debug for Signer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Signer")
            .field("api_key", &self.api_key)
            .finish_non_exhaustive()
    }
}

impl Signer {
    pub fn new(api_key: impl Into<String>, key: SigningKey) -> Self {
        Self {
            api_key: api_key.into(),
            key,
        }
    }

    /// Loads the private key from PKCS#8 PEM text (`openssl genpkey -algorithm ED25519`).
    pub fn from_pkcs8_pem(api_key: impl Into<String>, pem: &str) -> Result<Self, Error> {
        let key = SigningKey::from_pkcs8_pem(pem).map_err(|e| Error::Key(e.to_string()))?;
        Ok(Self::new(api_key, key))
    }

    /// Loads the private key from hex: a 32-byte seed (64 hex characters), or
    /// the seed followed by its public key (128 hex characters). Key Management
    /// gives the 128-character form. The public half must match the seed.
    pub fn from_hex(api_key: impl Into<String>, hex: &str) -> Result<Self, Error> {
        let bytes = decode_hex(hex.trim())
            .ok_or_else(|| Error::Key("hex key has a character that is not 0-9 or a-f".into()))?;
        let (seed, public) = match bytes.len() {
            32 => (&bytes[..], None),
            64 => (&bytes[..32], Some(&bytes[32..])),
            n => {
                return Err(Error::Key(format!(
                    "hex key must be 32 or 64 bytes, got {n}"
                )));
            }
        };
        let key = SigningKey::from_bytes(seed.try_into().expect("32 bytes"));
        if public.is_some_and(|p| p != key.verifying_key().as_bytes()) {
            return Err(Error::Key(
                "the public half of the hex key does not match the seed".into(),
            ));
        }
        Ok(Self::new(api_key, key))
    }

    /// Loads the private key from PEM text or hex (see [`Signer::from_hex`]).
    pub fn from_key_text(api_key: impl Into<String>, text: &str) -> Result<Self, Error> {
        if text.contains("-----BEGIN") {
            Self::from_pkcs8_pem(api_key, text)
        } else {
            Self::from_hex(api_key, text)
        }
    }

    /// Loads the signer from environment variables, for servers:
    ///
    /// - `EXN_API_KEY`: the API key identifier.
    /// - `EXN_PRIVATE_KEY_FILE`: path to the key file (PEM or hex), for example
    ///   a mounted secret such as `/run/secrets/exness_key`. Preferred.
    /// - `EXN_PRIVATE_KEY`: the key itself, PEM or hex. Used only when the file
    ///   variable is not set.
    pub fn from_env() -> Result<Self, Error> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self, Error> {
        let api_key =
            get("EXN_API_KEY").ok_or_else(|| Error::Key("EXN_API_KEY is not set".into()))?;
        let pem = match get("EXN_PRIVATE_KEY_FILE") {
            Some(path) => std::fs::read_to_string(&path)
                .map_err(|e| Error::Key(format!("cannot read {path}: {e}")))?,
            None => get("EXN_PRIVATE_KEY")
                .ok_or_else(|| Error::Key("set EXN_PRIVATE_KEY_FILE or EXN_PRIVATE_KEY".into()))?,
        };
        Self::from_key_text(api_key, &pem)
    }

    pub fn api_key(&self) -> &str {
        &self.api_key
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.key.verifying_key()
    }

    /// Signs one request.
    ///
    /// - `method` is made uppercase.
    /// - `path` must include the query string exactly as it will be sent.
    /// - `idempotency_key` must be empty for `GET`, and 5..128 characters of
    ///   `A-Z a-z 0-9 . _ - ~` for other methods.
    pub fn sign(
        &self,
        method: &str,
        path: &str,
        body: &[u8],
        idempotency_key: &str,
        timestamp_ms: u64,
    ) -> Result<SignedHeaders, Error> {
        let method = method.to_ascii_uppercase();
        check_idempotency_key(&method, idempotency_key)?;

        let data = SignedData {
            api_key: &self.api_key,
            idempotency_key,
            timestamp: timestamp_ms,
            sign_version: SIGN_VERSION,
            method: &method,
            path,
            body_hash: body_hash(body),
        };
        let payload = serde_json::to_vec(&data).expect("signed data always serializes");
        let signature = self.key.sign(&payload);

        Ok(SignedHeaders {
            api_key: self.api_key.clone(),
            idempotency_key: idempotency_key.to_owned(),
            timestamp: timestamp_ms.to_string(),
            sign_version: SIGN_VERSION.to_string(),
            data: URL_SAFE_NO_PAD.encode(&payload),
            sign: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
        })
    }
}

/// SHA-256 of the body, base64url without padding.
pub fn body_hash(body: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(body))
}

fn decode_hex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}

fn check_idempotency_key(method: &str, key: &str) -> Result<(), Error> {
    if method == "GET" {
        if !key.is_empty() {
            return Err(Error::IdempotencyKey("must be empty for GET".into()));
        }
        return Ok(());
    }
    if !(5..=128).contains(&key.len()) {
        return Err(Error::IdempotencyKey(format!(
            "must be 5..128 characters for {method}, got {}",
            key.len()
        )));
    }
    if !key
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b".-_~".contains(&b))
    {
        return Err(Error::IdempotencyKey(
            "allowed characters are A-Z a-z 0-9 . _ - ~".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier};

    // A fixed test key. Never use it for a real account.
    const TEST_PEM: &str = "-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBERERERERERERERERERERERERERERERERERERERERER
-----END PRIVATE KEY-----";

    fn signer() -> Signer {
        Signer::from_pkcs8_pem("exnsk-live-example", TEST_PEM).unwrap()
    }

    fn decode(s: &str) -> Vec<u8> {
        URL_SAFE_NO_PAD.decode(s).unwrap()
    }

    #[test]
    fn empty_body_hash_matches_docs() {
        assert_eq!(
            body_hash(b""),
            "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"
        );
    }

    #[test]
    fn get_payload_matches_docs_example() {
        let h = signer()
            .sign(
                "get",
                "/v1/configuration/accounts/123456789/account",
                b"",
                "",
                1773656070123,
            )
            .unwrap();
        let payload = String::from_utf8(decode(&h.data)).unwrap();
        assert_eq!(
            payload,
            r#"{"api_key":"exnsk-live-example","idempotency_key":"","timestamp":1773656070123,"sign_version":1,"method":"GET","path":"/v1/configuration/accounts/123456789/account","body_hash":"47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"}"#
        );
        assert_eq!(h.timestamp, "1773656070123");
        assert_eq!(h.sign_version, "1");
        assert_eq!(h.idempotency_key, "");
    }

    #[test]
    fn signature_covers_decoded_payload() {
        let s = signer();
        let body = br#"{"instrument":"XAUUSDm"}"#;
        let h = s
            .sign(
                "POST",
                "/v1/trading/accounts/1/orders",
                body,
                "order-20260316-0001",
                1,
            )
            .unwrap();
        let payload = decode(&h.data);
        let sig = Signature::from_slice(&decode(&h.sign)).unwrap();
        s.verifying_key().verify(&payload, &sig).unwrap();

        let json: serde_json::Value = serde_json::from_slice(&payload).unwrap();
        assert_eq!(json["body_hash"], body_hash(body));
        assert_eq!(json["idempotency_key"], "order-20260316-0001");
    }

    #[test]
    fn no_padding_in_headers() {
        let h = signer().sign("GET", "/x?a=1", b"", "", 1).unwrap();
        assert!(!h.data.contains('=') && !h.sign.contains('='));
    }

    #[test]
    fn query_string_is_signed_as_given() {
        let h = signer().sign("GET", "/c?b=2&a=1", b"", "", 1).unwrap();
        let json: serde_json::Value = serde_json::from_slice(&decode(&h.data)).unwrap();
        assert_eq!(json["path"], "/c?b=2&a=1");
    }

    #[test]
    fn from_lookup_reads_file_or_inline_pem() {
        let dir = std::env::temp_dir().join(format!("exness-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("key.pem");
        std::fs::write(&path, TEST_PEM).unwrap();
        let path = path.to_str().unwrap().to_owned();
        let want = signer().verifying_key();

        let file = Signer::from_lookup(|n| match n {
            "EXN_API_KEY" => Some("k".into()),
            "EXN_PRIVATE_KEY_FILE" => Some(path.clone()),
            _ => None,
        })
        .unwrap();
        assert_eq!(file.verifying_key(), want);

        let inline = Signer::from_lookup(|n| match n {
            "EXN_API_KEY" => Some("k".into()),
            "EXN_PRIVATE_KEY" => Some(TEST_PEM.into()),
            _ => None,
        })
        .unwrap();
        assert_eq!(inline.verifying_key(), want);

        let missing = Signer::from_lookup(|n| (n == "EXN_API_KEY").then(|| "k".into()));
        assert!(matches!(missing, Err(Error::Key(_))));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn hex_key_matches_pem_key() {
        let want = signer().verifying_key();
        let seed = "11".repeat(32);
        let full = format!(
            "{seed}{}",
            want.as_bytes()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        );
        assert_eq!(Signer::from_hex("k", &seed).unwrap().verifying_key(), want);
        assert_eq!(
            Signer::from_key_text("k", &full).unwrap().verifying_key(),
            want
        );

        let wrong_public = format!("{seed}{}", "00".repeat(32));
        assert!(matches!(
            Signer::from_hex("k", &wrong_public),
            Err(Error::Key(_))
        ));
        assert!(matches!(Signer::from_hex("k", "zz"), Err(Error::Key(_))));
    }

    #[test]
    fn debug_hides_key() {
        assert_eq!(
            format!("{:?}", signer()),
            r#"Signer { api_key: "exnsk-live-example", .. }"#
        );
    }

    #[test]
    fn idempotency_key_rules() {
        let s = signer();
        assert!(s.sign("GET", "/x", b"", "abcde", 1).is_err());
        assert!(s.sign("POST", "/x", b"", "", 1).is_err());
        assert!(s.sign("POST", "/x", b"", "abcd", 1).is_err());
        assert!(s.sign("DELETE", "/x", b"", "has space", 1).is_err());
        assert!(s.sign("POST", "/x", b"", &"a".repeat(129), 1).is_err());
        assert!(s.sign("PATCH", "/x", b"", "ok.key_1-~", 1).is_ok());
    }
}
