//! A consistent copy of the live database.

use crate::{Store, StoreError};
use std::path::{Path, PathBuf};

impl Store {
    /// Writes a consistent copy of the database to `dest`, replacing a file already there.
    ///
    /// Under the store lock and outside any transaction, `VACUUM INTO '<dest>.partial'`, then a
    /// rename over `dest`. On failure the partial file is removed and `dest` is unchanged.
    pub fn snapshot_to(&self, dest: &Path) -> Result<(), StoreError> {
        let mut partial = dest.as_os_str().to_owned();
        partial.push(".partial");
        let partial = PathBuf::from(partial);
        let result = self.copy_then_rename(&partial, dest);
        if result.is_err() {
            // Best effort: the original error is the one worth reporting.
            let _ = std::fs::remove_file(&partial);
        }
        result
    }

    fn copy_then_rename(&self, partial: &Path, dest: &Path) -> Result<(), StoreError> {
        let target = partial
            .to_str()
            .ok_or_else(|| StoreError::Sqlite("the backup path is not valid text".to_owned()))?;
        // VACUUM INTO refuses an existing file, so a leftover from a crashed run goes first.
        match std::fs::remove_file(partial) {
            Ok(()) => {}
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
            Err(err) => return Err(StoreError::Sqlite(format!("cannot write the copy: {err}"))),
        }
        self.with_conn(|conn| Ok(conn.execute("VACUUM INTO ?1", [target]).map(drop)?))?;
        std::fs::rename(partial, dest)
            .map_err(|err| StoreError::Sqlite(format!("cannot write the copy: {err}")))
    }
}
