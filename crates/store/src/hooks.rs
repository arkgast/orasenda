//! Test hooks for the app crate's tests, behind the `test-hooks` feature: make every write or
//! every read fail, or park every write on a channel. All act before `write` or `read` takes
//! the connection mutex, so a failing or parked call holds nothing the connection needs.

use crate::{Store, StoreError};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Mutex, PoisonError};

/// Parks writes: each `write` sends on `entered`, then waits for one message on `release`.
pub struct WriteGate {
    pub entered: Sender<()>,
    pub release: Receiver<()>,
}

#[derive(Default)]
pub(crate) struct Hooks {
    fail: AtomicBool,
    fail_reads: AtomicBool,
    gate: Mutex<Option<WriteGate>>,
}

impl Hooks {
    /// Runs at the start of every `write`, before the connection mutex is taken.
    pub(crate) fn before_write(&self) -> Result<(), StoreError> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(StoreError::Sqlite("injected".to_owned()));
        }
        // Held while parked, so concurrent writes queue here and park one at a time.
        let gate = self.gate.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(gate) = gate.as_ref() {
            // A test that dropped its receiver or sender has stopped watching the gate; the
            // write then goes on instead of parking forever.
            let _ = gate.entered.send(());
            let _ = gate.release.recv();
        }
        Ok(())
    }

    /// Runs at the start of every `read`, before the connection mutex is taken.
    pub(crate) fn before_read(&self) -> Result<(), StoreError> {
        if self.fail_reads.load(Ordering::SeqCst) {
            return Err(StoreError::Sqlite("injected".to_owned()));
        }
        Ok(())
    }
}

impl Store {
    /// While `fail` is true, every `write` returns `Err(StoreError::Sqlite("injected"))`
    /// without running its closure or touching the connection.
    pub fn fail_writes(&self, fail: bool) {
        self.hooks.fail.store(fail, Ordering::SeqCst);
    }

    /// While `fail` is true, every `read` returns `Err(StoreError::Sqlite("injected"))`
    /// without running its closure or touching the connection. Writes are not affected.
    pub fn fail_reads(&self, fail: bool) {
        self.hooks.fail_reads.store(fail, Ordering::SeqCst);
    }

    /// While a gate is set, every `write` parks on it before taking the connection mutex.
    /// Writes that arrive while one is parked queue behind it, each parking in turn. `None`
    /// removes the gate; it waits for a parked write to be released first.
    pub fn gate_writes(&self, gate: Option<WriteGate>) {
        *self
            .hooks
            .gate
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = gate;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings;
    use std::sync::Arc;
    use std::sync::mpsc::channel;
    use std::thread;
    use std::time::Duration;

    const WAIT: Duration = Duration::from_secs(10);

    #[test]
    fn fail_writes_hook_fails_before_connection() {
        let store = Arc::new(Store::open_in_memory("device-a").expect("opens"));
        store.fail_writes(true);

        // Hold the connection mutex in a read on another thread.
        let (held_tx, held_rx) = channel();
        let (done_tx, done_rx) = channel::<()>();
        let reader = {
            let store = Arc::clone(&store);
            thread::spawn(move || {
                store.read(|_| {
                    held_tx.send(()).expect("test is listening");
                    done_rx.recv_timeout(WAIT).expect("test releases the read");
                    Ok(())
                })
            })
        };
        held_rx
            .recv_timeout(WAIT)
            .expect("read holds the connection");

        // A write that touched the connection would wait for the read; this one must not.
        let (result_tx, result_rx) = channel();
        let writer = {
            let store = Arc::clone(&store);
            thread::spawn(move || {
                let mut ran = false;
                let result = store.write(1_000, |txn| {
                    ran = true;
                    settings::set(txn, "k", &1)
                });
                result_tx.send((result, ran)).expect("test is listening");
            })
        };
        let (result, closure_ran) = result_rx
            .recv_timeout(WAIT)
            .expect("the failing write returns while the connection is held");
        assert_eq!(result, Err(StoreError::Sqlite("injected".into())));
        assert!(!closure_ran);
        done_tx.send(()).expect("reader is waiting");
        reader.join().expect("reader joins").expect("read succeeds");
        writer.join().expect("writer joins");

        store.fail_writes(false);
        store
            .write(2_000, |txn| settings::set(txn, "k", &2))
            .expect("writes succeed again");
        let value: Option<i32> = store.read(|txn| settings::get(txn, "k")).expect("reads");
        assert_eq!(value, Some(2));
    }

    #[test]
    fn fail_reads_hook_fails_reads_before_connection_and_writes_still_pass() {
        let store = Arc::new(Store::open_in_memory("device-a").expect("opens"));
        store
            .write(1_000, |txn| settings::set(txn, "k", &1))
            .expect("writes");
        store.fail_reads(true);

        // Hold the connection mutex in a read-free write on another thread.
        let (held_tx, held_rx) = channel();
        let (done_tx, done_rx) = channel::<()>();
        let holder = {
            let store = Arc::clone(&store);
            thread::spawn(move || {
                store.write(2_000, |_| {
                    held_tx.send(()).expect("test is listening");
                    done_rx.recv_timeout(WAIT).expect("test releases the write");
                    Ok(())
                })
            })
        };
        held_rx
            .recv_timeout(WAIT)
            .expect("write holds the connection");

        // A read that touched the connection would wait for the write; this one must not.
        let mut ran = false;
        let result: Result<Option<i32>, StoreError> = store.read(|txn| {
            ran = true;
            settings::get(txn, "k")
        });
        assert_eq!(result, Err(StoreError::Sqlite("injected".into())));
        assert!(!ran);
        done_tx.send(()).expect("holder is waiting");
        holder
            .join()
            .expect("holder joins")
            .expect("write succeeds");

        store
            .write(3_000, |txn| settings::set(txn, "k", &3))
            .expect("writes still pass");
        store.fail_reads(false);
        let value: Option<i32> = store.read(|txn| settings::get(txn, "k")).expect("reads");
        assert_eq!(value, Some(3));
    }

    #[test]
    fn gate_writes_hook_parks_before_connection_and_reads_still_pass() {
        let store = Arc::new(Store::open_in_memory("device-a").expect("opens"));
        store
            .write(1_000, |txn| settings::set(txn, "k", &1))
            .expect("writes");
        let (entered_tx, entered_rx) = channel();
        let (release_tx, release_rx) = channel();
        store.gate_writes(Some(WriteGate {
            entered: entered_tx,
            release: release_rx,
        }));

        let writer = {
            let store = Arc::clone(&store);
            thread::spawn(move || store.write(2_000, |txn| settings::set(txn, "k", &2)))
        };
        entered_rx
            .recv_timeout(WAIT)
            .expect("the write parks at the gate");

        // A parked write holds no connection: a read on another thread completes.
        let (read_tx, read_rx) = channel();
        let reader = {
            let store = Arc::clone(&store);
            thread::spawn(move || {
                let value = store.read(|txn| settings::get::<i32>(txn, "k"));
                read_tx.send(value).expect("test is listening");
            })
        };
        let seen = read_rx
            .recv_timeout(WAIT)
            .expect("the read completes while the write is parked");
        assert_eq!(seen, Ok(Some(1)));
        reader.join().expect("reader joins");

        release_tx.send(()).expect("writer is parked");
        writer
            .join()
            .expect("writer joins")
            .expect("write succeeds");
        store.gate_writes(None);
        let value: Option<i32> = store.read(|txn| settings::get(txn, "k")).expect("reads");
        assert_eq!(value, Some(2));
        store
            .write(3_000, |txn| settings::set(txn, "k", &3))
            .expect("an ungated write does not park");
    }
}
