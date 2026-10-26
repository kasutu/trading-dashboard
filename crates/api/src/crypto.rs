//! Encryption of broker credentials at rest: AES-256-GCM with `CREDENTIALS_KEY`.
//!
//! Stored form: `version (1 byte) || nonce (12 bytes) || ciphertext with tag`. The row's
//! account id is the associated data, so a value copied to another row does not decrypt.
//! The key comes from the environment, never from the database.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use uuid::Uuid;

use crate::config::features;
use crate::error::ApiError;

const VERSION: u8 = 1;
const NONCE: usize = 12;

fn cipher_with(key: &[u8; 32]) -> Aes256Gcm {
    Aes256Gcm::new(key.into())
}

fn key() -> Result<&'static [u8; 32], ApiError> {
    features().credentials_key.as_ref().ok_or_else(|| {
        ApiError::Unprocessable(
            "This server cannot store broker keys yet: CREDENTIALS_KEY is not set.".into(),
        )
    })
}

pub fn seal_with(key: &[u8; 32], account: Uuid, plain: &[u8]) -> Vec<u8> {
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher_with(key)
        .encrypt(
            &nonce,
            Payload {
                msg: plain,
                aad: account.as_bytes(),
            },
        )
        .expect("AES-GCM encryption does not fail on valid input");
    let mut out = Vec::with_capacity(1 + NONCE + ct.len());
    out.push(VERSION);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    out
}

pub fn open_with(key: &[u8; 32], account: Uuid, sealed: &[u8]) -> Option<Vec<u8>> {
    if sealed.len() < 1 + NONCE || sealed[0] != VERSION {
        return None;
    }
    let (nonce, ct) = sealed[1..].split_at(NONCE);
    cipher_with(key)
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: ct,
                aad: account.as_bytes(),
            },
        )
        .ok()
}

/// Encrypts with the server key.
pub fn seal(account: Uuid, plain: &str) -> Result<Vec<u8>, ApiError> {
    Ok(seal_with(key()?, account, plain.as_bytes()))
}

/// Decrypts with the server key. Fails when the key changed or the value was tampered with.
pub fn open(account: Uuid, sealed: &[u8]) -> Result<String, ApiError> {
    open_with(key()?, account, sealed)
        .and_then(|b| String::from_utf8(b).ok())
        .ok_or_else(|| {
            ApiError::Unprocessable(
                "The stored keys cannot be read. The server key changed: connect the account again."
                    .into(),
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_bound_to_the_account() {
        let key = [7u8; 32];
        let a = Uuid::from_u128(1);
        let sealed = seal_with(&key, a, b"secret");
        assert_eq!(sealed[0], VERSION);
        assert!(!sealed.windows(6).any(|w| w == b"secret"));
        assert_eq!(open_with(&key, a, &sealed).as_deref(), Some(&b"secret"[..]));
        // Another account, another key, or a flipped bit: no plain text.
        assert_eq!(open_with(&key, Uuid::from_u128(2), &sealed), None);
        assert_eq!(open_with(&[8u8; 32], a, &sealed), None);
        let mut bad = sealed.clone();
        *bad.last_mut().unwrap() ^= 1;
        assert_eq!(open_with(&key, a, &bad), None);
        // A fresh nonce each time.
        assert_ne!(seal_with(&key, a, b"secret"), sealed);
    }
}
