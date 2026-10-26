//! Background work, fair across tenants: each user's items run one after the other, and up to
//! `PARALLEL` users run at once. One user with slow or failing items never holds up the rest.

use std::collections::BTreeMap;
use std::future::Future;
use std::sync::Arc;

use tokio::sync::Semaphore;
use tokio::task::JoinSet;

/// Users worked on at the same time.
pub const PARALLEL: usize = 8;

/// Runs `work` for every `(user, item)`, grouped by user. Returns the results in no set order.
pub async fn per_user<T, R, F, Fut>(items: Vec<(String, T)>, work: F) -> Vec<R>
where
    T: Send + 'static,
    R: Send + 'static,
    F: Fn(T) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = R> + Send,
{
    let mut by_user: BTreeMap<String, Vec<T>> = BTreeMap::new();
    for (user, item) in items {
        by_user.entry(user).or_default().push(item);
    }
    let gate = Arc::new(Semaphore::new(PARALLEL));
    let mut set = JoinSet::new();
    for (_, items) in by_user {
        let (gate, work) = (gate.clone(), work.clone());
        set.spawn(async move {
            let _permit = gate
                .acquire_owned()
                .await
                .expect("the semaphore is never closed");
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(work(item).await);
            }
            out
        });
    }
    let mut results = Vec::new();
    while let Some(done) = set.join_next().await {
        match done {
            Ok(r) => results.extend(r),
            // A panic in one user's work is logged and does not stop the others.
            Err(e) => tracing::error!("background job crashed: {e}"),
        }
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    #[tokio::test]
    async fn a_slow_user_does_not_hold_up_others() {
        let started = std::time::Instant::now();
        let busy = Arc::new(AtomicUsize::new(0));
        let max = Arc::new(AtomicUsize::new(0));
        let items: Vec<(String, u64)> = (0..20)
            .map(|i| (format!("u{}", i % 10), if i == 0 { 300 } else { 20 }))
            .collect();
        let (b, m) = (busy.clone(), max.clone());
        let out = per_user(items, move |ms| {
            let (b, m) = (b.clone(), m.clone());
            async move {
                let now = b.fetch_add(1, Ordering::SeqCst) + 1;
                m.fetch_max(now, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_millis(ms)).await;
                b.fetch_sub(1, Ordering::SeqCst);
                ms
            }
        })
        .await;
        assert_eq!(out.len(), 20);
        assert!(max.load(Ordering::SeqCst) <= PARALLEL);
        assert!(max.load(Ordering::SeqCst) > 1, "users run in parallel");
        // Sequential would be 300 + 19 × 20 = 680 ms.
        assert!(
            started.elapsed() < Duration::from_millis(600),
            "{:?}",
            started.elapsed()
        );
    }
}
