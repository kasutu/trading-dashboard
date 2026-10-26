//! Encryption of broker credentials at rest: AES-256-GCM, one key per user.
//!
//! - Each user's key is derived from `CREDENTIALS_KEY` with HKDF-SHA256 (info
//!   `jurno/credentials/v1/<user id>`), so no two tenants share a data key, and a value can
//!   only be opened for the user it was sealed for.
//! - Stored form: `version (1 byte) || nonce (12 bytes) || ciphertext with tag`. The trading
//!   account id is the associated data, so a value copied to another row does not decrypt.
//! - The master key comes from the environment, never from the database.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use hkdf::Hkdf;
use sha2::Sha256;
use uuid::Uuid;

use crate::config::features;
use crate::error::ApiError;

const VERSION: u8 = 1;
const NONCE: usize = 12;

/// The user's data key, from the master key.
fn user_key(master: &[u8; 32], user: &str) -> [u8; 32] {
    let mut key = [0u8; 32];
    Hkdf::<Sha256>::new(None, master)
        .expand(format!("jurno/credentials/v1/{user}").as_bytes(), &mut key)
        .expect("32 bytes is a valid HKDF-SHA256 length");
    key
}

fn master() -> Result<&'static [u8; 32], ApiError> {
    features().credentials_key.as_ref().ok_or_else(|| {
        ApiError::Unprocessable(
            "This server cannot store broker keys yet: CREDENTIALS_KEY is not set.".into(),
        )
    })
}

pub fn seal_with(master: &[u8; 32], user: &str, account: Uuid, plain: &[u8]) -> Vec<u8> {
    let key = user_key(master, user);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = Aes256Gcm::new(&key.into())
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

pub fn open_with(master: &[u8; 32], user: &str, account: Uuid, sealed: &[u8]) -> Option<Vec<u8>> {
    if sealed.len() < 1 + NONCE || sealed[0] != VERSION {
        return None;
    }
    let key = user_key(master, user);
    let (nonce, ct) = sealed[1..].split_at(NONCE);
    Aes256Gcm::new(&key.into())
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: ct,
                aad: account.as_bytes(),
            },
        )
        .ok()
}

/// Encrypts for `user`'s trading account `account`.
pub fn seal(user: &str, account: Uuid, plain: &str) -> Result<Vec<u8>, ApiError> {
    Ok(seal_with(master()?, user, account, plain.as_bytes()))
}

/// Decrypts. Fails when the master key changed, the value belongs to another user or account,
/// or it was tampered with.
pub fn open(user: &str, account: Uuid, sealed: &[u8]) -> Result<String, ApiError> {
    open_with(master()?, user, account, sealed)
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
    fn round_trip_bound_to_user_and_account() {
        let master = [7u8; 32];
        let a = Uuid::from_u128(1);
        let sealed = seal_with(&master, "u_alice", a, b"secret");
        assert_eq!(sealed[0], VERSION);
        assert!(!sealed.windows(6).any(|w| w == b"secret"));
        assert_eq!(
            open_with(&master, "u_alice", a, &sealed).as_deref(),
            Some(&b"secret"[..])
        );
        // Another tenant, another account, another master key, or a flipped bit: nothing.
        assert_eq!(open_with(&master, "u_bob", a, &sealed), None);
        assert_eq!(
            open_with(&master, "u_alice", Uuid::from_u128(2), &sealed),
            None
        );
        assert_eq!(open_with(&[8u8; 32], "u_alice", a, &sealed), None);
        let mut bad = sealed.clone();
        *bad.last_mut().unwrap() ^= 1;
        assert_eq!(open_with(&master, "u_alice", a, &bad), None);
        // A fresh nonce each time.
        assert_ne!(seal_with(&master, "u_alice", a, b"secret"), sealed);
    }

    #[test]
    fn users_get_different_keys() {
        let m = [1u8; 32];
        assert_ne!(user_key(&m, "u_alice"), user_key(&m, "u_bob"));
        assert_eq!(user_key(&m, "u_alice"), user_key(&m, "u_alice"));
        assert_ne!(user_key(&m, "u_alice"), m);
    }
}
