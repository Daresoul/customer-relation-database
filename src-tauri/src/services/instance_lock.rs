//! One running copy owns the logs. A second copy, started by a double click
//! while the first runs, must not rename or prune the live log before the
//! single-instance handoff closes it.

use std::fs::{File, OpenOptions};
use std::path::Path;

const LOCK_FILE: &str = "instance.lock";

/// The lock for this copy, or None when another copy holds it (or the lock
/// file can't be made: the start-up log housekeeping is then skipped once).
/// Keep the returned file open for the life of the process.
pub fn acquire(dir: &Path) -> Option<File> {
    let _ = std::fs::create_dir_all(dir);
    let file = match OpenOptions::new().create(true).truncate(false).write(true).open(dir.join(LOCK_FILE)) {
        Ok(f) => f,
        Err(e) => {
            log::warn!("Instance lock not available: {}", e);
            return None;
        }
    };
    match file.try_lock() {
        Ok(()) => Some(file),
        Err(std::fs::TryLockError::WouldBlock) => None,
        Err(std::fs::TryLockError::Error(e)) => {
            log::warn!("Instance lock not taken: {}", e);
            Some(file)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::acquire;

    #[test]
    fn a_second_copy_does_not_get_the_lock_while_the_first_runs() {
        let dir = tempfile::tempdir().unwrap();
        let first = acquire(dir.path());
        assert!(first.is_some());
        assert!(acquire(dir.path()).is_none(), "second copy");
        drop(first);
        assert!(acquire(dir.path()).is_some(), "free again once the first copy ends");
    }
}
