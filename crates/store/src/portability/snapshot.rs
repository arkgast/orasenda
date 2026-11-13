//! A consistent copy of the live database.

use crate::{Store, StoreError};
use std::path::Path;

impl Store {
    /// Writes a consistent copy of the database to `dest`, replacing a file already there.
    ///
    /// Under the store lock and outside any transaction, `VACUUM INTO '<dest>.partial'`, then a
    /// rename over `dest`. On failure the partial file is removed and `dest` is unchanged.
    pub fn snapshot_to(&self, dest: &Path) -> Result<(), StoreError> {
        let _ = dest;
        todo!()
    }
}
