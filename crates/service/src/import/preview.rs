//! Listing the sources and reading one into a preview (spec 2026-11-15-task-import, Service).
//! Nothing here writes. The OS is read before the service lock is taken; the lock is held
//! only to match origins against the store and to keep the result as the pending preview.

use orasenda_core::PlatformError;
use orasenda_core::platform::import::{SourceAccess, ThingsReadError};
use orasenda_store::{StoreError, tasks};

use crate::api::{
    ColumnSettings, ImportError, ImportErrorKind, ImportItemView, ImportPreview, ImportSourceKind,
    ImportSourceView, ImportSourcesView, PreviewRequest, REMINDERS_UNBUNDLED,
};
use crate::board::columns;
use crate::board::view::Ctx;
use crate::import::fit::{FittedTask, Summary, fit};
use crate::import::item::RawItem;
use crate::import::pending::{PendingPreview, next_id};
use crate::import::todoist::{self, ParseError};
use crate::import::{reminders, things, view};
use crate::scheduler::Host;
use crate::session::{SessionService, lock};

/// Rows a preview holds at most.
const CAP: usize = 500;

/// What a source gave: its items in order, and how many archive files were not exports.
struct Read {
    items: Vec<RawItem>,
    skipped_files: u32,
}

/// What the store says about the origins asked, and the words it needs.
struct Matches {
    found: Vec<(String, tasks::Lane, bool)>,
    columns: Vec<ColumnSettings>,
    cx: Ctx,
}

fn session_active<H: Host>(host: &H) -> bool {
    host.service()
        .is_some_and(|service| lock(service).session_active(host.now_ms()))
}

/// `import_sources`: what the picker lists, in the order Reminders, Todoist, Things.
pub fn run_import_sources<H: Host>(host: &H) -> ImportSourcesView {
    let active = session_active(host);
    let source = |kind, reason: Option<&str>| ImportSourceView {
        kind,
        available: reason.is_none(),
        reason: reason.map(str::to_owned),
    };
    let waiting = active.then_some(crate::api::SESSION_ACTIVE);
    let mut sources = Vec::new();
    if let Some(reminders) = host.reminders() {
        let unbundled =
            (reminders.access() == SourceAccess::Unavailable).then_some(REMINDERS_UNBUNDLED);
        sources.push(source(ImportSourceKind::Reminders, unbundled.or(waiting)));
    }
    sources.push(source(ImportSourceKind::Todoist, None));
    if host.things().is_some() {
        sources.push(source(ImportSourceKind::Things, waiting));
    }
    ImportSourcesView { sources }
}

/// `import_preview`: reads the source, fits and matches it, and keeps the result as the one
/// pending preview. Writes nothing.
pub fn run_import_preview<H: Host>(
    host: &H,
    request: PreviewRequest,
) -> Result<ImportPreview, ImportError> {
    let service = host
        .service()
        .ok_or_else(|| ImportError::store(STORE_LINE))?;
    let kind = match &request {
        PreviewRequest::Reminders => ImportSourceKind::Reminders,
        PreviewRequest::Things => ImportSourceKind::Things,
        PreviewRequest::Todoist(_) => ImportSourceKind::Todoist,
    };
    if kind != ImportSourceKind::Todoist && session_active(host) {
        return Err(ImportError::session_active());
    }
    let id = next_id();
    {
        let mut guard = lock(service);
        guard.import_last_issued = guard.import_last_issued.max(id);
    }
    let read = match request {
        PreviewRequest::Reminders => read_reminders(host)?,
        PreviewRequest::Things => read_things(host)?,
        PreviewRequest::Todoist(path) => read_todoist(&path)?,
    };
    let fitted: Vec<_> = read.items.into_iter().map(fit).collect();
    let mut summary = Summary::from_fitted(&fitted);
    let tasks: Vec<FittedTask> = fitted.into_iter().filter_map(|f| f.task).collect();
    summary.things_checklists = kind == ImportSourceKind::Things && !tasks.is_empty();
    let mut lines = summary.lines();
    if read.skipped_files > 0 {
        lines.push(archive_line(read.skipped_files));
    }
    let now_ms = host.now_ms();
    let mut guard = lock(service);
    let origins: Vec<String> = tasks.iter().map(|t| t.origin.clone()).collect();
    let matches = guard.import_matches(&origins, now_ms).map_err(|error| {
        eprintln!("import: could not match origins ({error})");
        ImportError::store(STORE_LINE)
    })?;
    let total = u32::try_from(tasks.len()).unwrap_or(u32::MAX);
    let on_board: Vec<_> = tasks
        .iter()
        .map(|t| view::live_lane(&matches.found, &t.origin))
        .collect();
    let shown = shown_keys(&on_board);
    if tasks.len() > CAP {
        lines.insert(
            0,
            format!(
                "Showing {CAP} of {total}. Import these, then choose Import tasks again for the rest."
            ),
        );
    }
    let mut items: Vec<ImportItemView> = Vec::new();
    let mut kept = Vec::new();
    for (index, task) in tasks.into_iter().enumerate() {
        if !shown.contains(&index) {
            continue;
        }
        let key = index as u32;
        items.push(view::item(
            key,
            &task,
            on_board[index],
            &matches.columns,
            &matches.cx,
        ));
        kept.push((key, task));
    }
    // Only the newest read installs: an older one finishing late must not bring back a
    // preview that a newer read replaced, or that was discarded or imported meanwhile.
    if guard.import_last_issued == id {
        guard.import_pending = Some(PendingPreview { id, tasks: kept });
    }
    Ok(ImportPreview {
        id,
        source: kind,
        source_name: kind.name().to_owned(),
        items,
        total,
        line: None,
        summary: lines,
    })
}

const STORE_LINE: &str = "Orasenda couldn't read your tasks. Try again.";

fn archive_line(n: u32) -> String {
    if n == 1 {
        "1 file in the archive wasn't a Todoist export.".to_owned()
    } else {
        format!("{n} files in the archive weren't Todoist exports.")
    }
}

/// The indexes a preview shows: all of them up to the cap; past it, new rows first (rows with
/// no live match), then rows already on the Board to fill the rest.
fn shown_keys(on_board: &[Option<crate::api::Lane>]) -> Vec<usize> {
    if on_board.len() <= CAP {
        return (0..on_board.len()).collect();
    }
    let new = (0..on_board.len()).filter(|i| on_board[*i].is_none());
    let old = (0..on_board.len()).filter(|i| on_board[*i].is_some());
    let mut keys: Vec<usize> = new.chain(old).take(CAP).collect();
    keys.sort_unstable();
    keys
}

impl SessionService {
    /// Looks up `origins` and the column names in one read.
    fn import_matches(&self, origins: &[String], now_ms: u64) -> Result<Matches, StoreError> {
        let store = self
            .store()
            .ok_or_else(|| StoreError::Sqlite("the store is unavailable".into()))?;
        let cx = self.board_ctx(now_ms);
        let (found, columns) =
            store.read(|txn| Ok((tasks::origins(txn, origins)?, columns::read(txn)?)))?;
        Ok(Matches { found, columns, cx })
    }
}

const READ_REMINDERS: &str = "Orasenda couldn't read your reminders. Try again.";
const READ_THINGS: &str = "Orasenda couldn't read your to-dos from Things. Try again.";

fn read_reminders<H: Host>(host: &H) -> Result<Read, ImportError> {
    let unavailable = || ImportError::new(ImportErrorKind::Unavailable, REMINDERS_UNBUNDLED);
    let denied = || {
        ImportError::new(
            ImportErrorKind::Denied,
            "Orasenda can't read your reminders. You can allow it in System Settings.",
        )
    };
    let source = host.reminders().ok_or_else(unavailable)?;
    let mut access = source.access();
    if access == SourceAccess::NotAsked {
        access = source.request();
    }
    match access {
        SourceAccess::Granted => {}
        SourceAccess::Unavailable => return Err(unavailable()),
        SourceAccess::Denied | SourceAccess::NotAsked => return Err(denied()),
    }
    match source.read() {
        Ok(items) => Ok(Read {
            items: reminders::map(items),
            skipped_files: 0,
        }),
        Err(PlatformError::Refused) => Err(denied()),
        Err(PlatformError::Unsupported) => Err(unavailable()),
        Err(error) => {
            eprintln!("import: reminders could not be read ({error:?})");
            Err(ImportError::new(
                ImportErrorKind::Unreadable,
                READ_REMINDERS,
            ))
        }
    }
}

fn read_things<H: Host>(host: &H) -> Result<Read, ImportError> {
    let not_installed =
        || ImportError::new(ImportErrorKind::NotInstalled, "Things isn't on this Mac.");
    let source = host.things().ok_or_else(not_installed)?;
    if !source.installed() {
        return Err(not_installed());
    }
    let json = source.read().map_err(|error| match error {
        ThingsReadError::Denied => ImportError::new(
            ImportErrorKind::Denied,
            "Orasenda can't ask Things for your to-dos. You can allow it in System Settings.",
        ),
        ThingsReadError::NotInstalled => not_installed(),
        ThingsReadError::TimedOut => ImportError::new(
            ImportErrorKind::TimedOut,
            "Things didn't answer. If macOS asked for permission, answer it, then try again.",
        ),
        ThingsReadError::TooLarge => ImportError::new(
            ImportErrorKind::TooLarge,
            "Things sent more to-dos than Orasenda can read at once.",
        ),
        ThingsReadError::Failed(why) => {
            eprintln!("import: things could not be read ({why})");
            ImportError::new(ImportErrorKind::Unreadable, READ_THINGS)
        }
    })?;
    let items = things::parse(&json).map_err(|error| {
        eprintln!("import: things sent something unreadable ({})", error.0);
        ImportError::new(ImportErrorKind::Unreadable, READ_THINGS)
    })?;
    Ok(Read {
        items,
        skipped_files: 0,
    })
}

fn read_todoist(path: &std::path::Path) -> Result<Read, ImportError> {
    let (items, skipped_files) =
        todoist::parse_file_counted(path).map_err(|error| match error {
            ParseError::NotAnExport => ImportError::new(
                ImportErrorKind::NotAnExport,
                "That file doesn't look like a Todoist export.",
            ),
            ParseError::Unreadable => ImportError::new(
                ImportErrorKind::Unreadable,
                "Orasenda couldn't open that file.",
            ),
            ParseError::TooLarge => ImportError::new(
                ImportErrorKind::TooLarge,
                "That file is too large to be a Todoist export.",
            ),
        })?;
    Ok(Read {
        items,
        skipped_files,
    })
}
