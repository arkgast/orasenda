# Task import and pointer drag (P2 close) — Implementation Plan

- Spec: [docs/specs/2026-11-15-task-import.md](../specs/2026-11-15-task-import.md)
- Date: 2026-11-15
- Status: done (2026-11-16)

## Overview
Fifteen tasks. First come the core, store and platform pieces and the components; then the service and IPC; then the screens, one at a time, each with its behaviour and UI together (owner's rule): the import sheet on the Board, then Settings and the palette, then drag. Last is a docs-only close-out.

| Task | What | Depends on | Wave |
|---|---|---|---|
| **I1** | Core: `rank::spread`; `platform::import` types, traits and `UnbundledReminders` | none | 1 |
| **I2** | Store: migration 0009 `task.origin`, `origins`, `last_backlog_rank`, portability | none | 1 |
| **I3** | Platform: `MacReminders` (EventKit), `Info.plist`, entitlements file | I1 | 2 |
| **I4** | Platform: `MacThings` (osascript, JXA `collect`) | I1 | 2 |
| **I5** | Service: import items, fitting, absolute dates, Reminders and Things mapping | I1 | 2 |
| **I6** | Service: the Todoist parser (CSV, backup `.zip`, origin hash) | I5 | 3 |
| **I7a** | Service: sources, preview, discard, matching, cap, view, API types, `Host` sources, fakes | I2, I6 | 4 |
| **I7b** | Service: `run_task_import`, undo, open settings | I7a | 5 |
| **I8** | IPC: import commands, `FilePicker::open_import`, platform wiring, bindings | I3, I4, I7b | 6 |
| **I9** | Components: `ImportSourcePicker`, `ImportPreviewList`; `Dialog` and `EmptyState` changes | none | 1 |
| **I10** | Components: `KanbanColumn` drop slot, `TaskCard` `moving` | #580 (Board polish P6) | after #580 |
| **I11** | Screen: the import sheet on the Board (Backlog footer, empty Board, Undo line) | I8, I9, Board polish (#574, #580) | 7 |
| **I12** | Screen: Settings › Your data row and the palette's "Import tasks…" | I11, #581 (Board polish P5) | 8 |
| **I13** | Screen: pointer drag on the Board | I10, I11; ordered after I12 by the owner's rule only (file-disjoint, may run beside I12 if the owner relaxes it) | 9 |
| **I14** | Close-out (docs only, haiku): spec, ROADMAP P2 closed, Board and Board polish status | I1–I13 merged, and Board polish (#574, #575, #579, #580, #581, #587) merged | 10 |

Every task writes its tests first, keeps every file at 500 lines or fewer, passes `./scripts/ci.sh`, and gets an opus review plus one fix round. UI tasks also get the opus design review (layout boxes and gaps, both themes, keyboard, VoiceOver names); there are no PR screenshots, and the owner reviews visuals.

**Design gate.** The canvas is https://claude.ai/artifact/N3RphAWsq8PnMhMMwzBq7R (A1–A3 entry point, B1–B3 preview, C1–C2 drag look). A screen or component task follows the pick recorded on its issue; until the owner records one, the leans stand: A2 (Backlog footer), B1 (sheet), C1.

**Design-system republish.** After I9 merges and after I10 merges, the controller (or an opus agent, never sonnet) runs `just design-system` from `main` and republishes the artifact with `"editing": "code"` (CLAUDE.md).

IPC tasks regenerate `bindings.ts` (`just bindings`) and never hand-merge it. Append-only registration files may be shared and keep both sides on conflict: `crates/platform-macos/src/lib.rs` (mod and `pub use` lines), `apps/orasenda/src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `apps/orasenda/src-tauri/commands.list.rs`, `build.rs`, `capabilities/main.json`, `src-tauri/src/lib_tests.rs`, `shared/test/fixtures*`, `packages/ui/designSystem.test.ts` (recount exports, `docs/common-issues.md`), `packages/ui/src/index.ts`, the specimens registry (`packages/ui/specimens/registry.ts`), `packages/ui/design-system/README.md` (I9 and I10 each edit one line), root `Cargo.toml` (`[workspace.dependencies]`), `docs/common-issues.md`.

## Contract
- **I1 owns** `orasenda_core::rank::spread(after: Option<&str>, n: usize) -> Vec<String>` and `orasenda_core::platform::import::{SourceAccess, ReminderItem, DueParts, RemindersSource, ThingsSource, ThingsReadError, UnbundledReminders}`, as the spec's Core section names them. `ReminderItem.id` is the origin key (the external id, else `local-<calendarItemIdentifier>`); I5 only prefixes `reminders:`.
- **I2 owns** `tasks::NewTask.origin`, `TaskRow.origin: Option<String>`, `tasks::origins(txn, &[String]) -> Result<Vec<(String, tasks::Lane, bool)>, StoreError>` (the store's `Lane`; `bool` is live), `tasks::last_backlog_rank(txn) -> Result<Option<String>, StoreError>`, `SCHEMA_VERSION = 9`.
- **Things JSON (I4 writes, I5 reads):** an array of `{id: string, name: string, notes: string, project: string|null, area: string|null, tagNames: string, dueDate: "YYYY-MM-DD"|null, activationDate: "YYYY-MM-DD"|null}`, already filtered to open to-dos and ordered by the script. I5 does not filter. I4's `collect_returns_open_todos_as_json` and I5's `things_basic.json` use this sample verbatim:
  ```json
  [{"id":"A1b2","name":"Draft Q1 plan","notes":"Outline first","project":"Work","area":null,"tagNames":"planning, q1","dueDate":"2026-11-20","activationDate":null},
   {"id":"C3d4","name":"Book dentist","notes":"","project":null,"area":"Home","tagNames":"","dueDate":null,"activationDate":"2026-11-18"}]
  ```
- **I5 owns** `import::item::RawItem` (the source-neutral item every parser yields: origin, title, notes parts, tags, priority, due, checklist, date lines, order key) and `import::fit::{fit(RawItem) -> Fitted, Summary}`.
- **I7a owns** the service API types (`ImportSourceKind`, `ImportSourcesView`, `ImportPreview`, `ImportItemView`, `ImportDone`, `ImportError`, `ImportErrorKind`, `PreviewRequest`), `run_import_sources`, `run_import_preview`, `run_import_discard`, and `Host::{reminders, things}`. **I7b owns** `run_task_import`, `run_task_import_undo`, `run_import_open_settings`.
- **I8 owns** the IPC: `import_sources`, `import_preview -> ImportPreviewOutcome`, `import_discard`, `task_import`, `task_import_undo`, `import_open_settings`; `FilePicker::open_import(&self) -> Result<Option<PathBuf>, DataError>`; `platform::import_sources() -> ImportSources` and `choose_reminders(in_bundle: bool) -> Arc<dyn RemindersSource>`.
- **I9 and I10 own** their components' props; the READMEs are the contract.
- The screens (I11–I13) consume these and never change them. A needed change goes back to the controller as a ruling on the issue.

## Impact
- **Schema (I2):** `ALTER TABLE task ADD COLUMN origin` and a partial index. Forward-only (ADR-012); rollback is the safety backup the app takes before a migration. Every store test, the migration tests 0006–0008, the fresh-schema checks and the portability round trip stay green. If the Routines session lands a 0009 first, I2 renumbers to the next free number and fixes `SCHEMA_VERSION` (`crates/store/src/lib.rs:44`).
- **`NewTask` constructors (I2):** `board/mod.rs` `run_task_add` (line 53) and `board/inbox_move.rs` gain `origin: None`; the board service tests stay green.
- **Board internals (I5, I7a, I7b):** visibility only, no behaviour change. (I5) the limits and `split_note` in `board/check.rs`, with `pub(crate) mod check;` at `board/mod.rs:8`; (I7a) `columns::read` (`columns.rs:27`), `view::{due_label, stored_lane, Ctx}` (`view.rs:163`) and `pub(crate) mod columns; pub(crate) mod view;`; (I7b) `board::write` (`board/mod.rs:211`) and `service::Answer`. The board tests stay green.
- **`Host` trait (I7a):** two methods with default bodies returning `None`, so the app host and the fakes compile before I8 wires them.
- **`FilePicker` (I8):** a new required method; the fake (`src-tauri/src/lib_tests/data_files.rs:58`) and both `DialogPicker` impls (`file_picker.rs`, the mobile one at :79) change with it, and `just mobile` stays green.
- **Components (I9, I10):** `Dialog` (task sheet, delete-data dialog), `EmptyState` (Inbox, Today, Board), `KanbanColumn` and `TaskCard` (Board). Every existing test and specimen of their consumers stays green.
- **Dependencies (I3, I6):** `just service-boundary`, `just mobile` and the Windows advisory job stay green; non-macOS builds compile the platform crate empty (ADR-010).
- **Rollout:** each PR is complete on its own; the import is reachable only once I11 lands, and drag only once I13 does.

## Dependency graph
```
I1 ─┬─> I3 ─────────────────────────────┐
    ├─> I4 ─────────────────────────────┤
    └─> I5 ─> I6 ─> I7a ─> I7b ─────────┴─> I8 ─┐
I2 ─────────────> I7a                           ├─> I11 ─> I12 (needs #581)
I9 ─────────────────────────────────────────────┘     │
#580 ─> I10 ──────────────────────────────────────────┴─> I13
all ─> I14
```
Can start at once: I1, I2, I9. Then I3, I4, I5 in parallel; I10 as soon as #580 merges.

## Tasks

### I1: Core: rank spread and import source traits
- Priority: 1
- Kind: rust
- Depends on: none
- Owns: `crates/core/src/rank.rs` (76 lines), `crates/core/src/platform/import.rs` (new), its tests.
- Touches: `crates/core/src/platform.rs` (193; one `pub mod import;` line).
- Interfaces:
  - Produces: `rank::spread(after: Option<&str>, n: usize) -> Vec<String>`; `SourceAccess { NotAsked, Granted, Denied, Unavailable }`; `ReminderItem { id, title, notes, url, list, priority: u8, due: Option<DueParts>, recurring: bool, created_ms: Option<u64> }`; `DueParts { date: Option<String>, time: Option<String> }`; `trait RemindersSource`, `trait ThingsSource`, `ThingsReadError { Denied, NotInstalled, TimedOut, TooLarge, Failed(String) }`; `UnbundledReminders` (`impl RemindersSource`: `access()` and `request()` return Unavailable, `read` and `open_settings` return `Err(PlatformError::Unsupported)`, the `NoopNotifier` pattern).
- Acceptance:
  - [ ] `spread(Some(r), n)` returns `n` strictly increasing ranks, all greater than `r`, each at most `r.len() + 2` long, for every `n` in 1..=3000.
  - [ ] `spread(None, n)` works on an empty lane.
  - [ ] The traits are object-safe (`Arc<dyn RemindersSource>`); core has no `objc2` and no `cfg(target_os)`; `just core-boundary` and the mobile check pass.
- Tests first: `spread_is_increasing_and_after_bound`, `spread_stays_short_at_3000`, `spread_on_empty_lane`, `spread_after_tombstone_rank`, `sources_are_object_safe`, `unbundled_reminders_is_unavailable`.
- Notes: `platform.rs` plus `platform/import.rs` is a valid Rust 2018+ layout; `platform.rs` is not moved.

### I2: Store: task origin (migration 0009)
- Priority: 1
- Kind: rust
- Depends on: none
- Owns: `crates/store/migrations/0009_task_origin.sql`, `crates/store/src/tests/migration_0009.rs`, `crates/store/src/repo/tasks.rs` (328), `crates/store/src/repo/tasks/tests/origin.rs` (new), `crates/store/src/portability/rows.rs` (226), `crates/store/src/portability/merge/tasks.rs` (103), `crates/store/src/portability/tests/tasks.rs`.
- Touches: `crates/store/src/migrate.rs` (36; the list), `crates/store/src/lib.rs` (44; `SCHEMA_VERSION`), `crates/store/src/tests.rs` (mod line), `crates/store/src/repo/tasks/tests/mod.rs` (69; mod line), `crates/service/src/board/mod.rs` (229; `origin: None` at :53) and `board/inbox_move.rs` (114), other `NewTask` constructors in tests.
- Interfaces: Produces the I2 contract lines.
- Acceptance:
  - [ ] A filled v8 database migrates to v9; existing tasks read `origin` NULL; the CHECK refuses `"x"`, `":a"` and a 301-character origin.
  - [ ] `insert` writes and logs `origin`; `COLUMNS` and `read_row` (`repo/tasks.rs:121,319`) carry it.
  - [ ] `origins` returns, for each asked origin, every task holding it with its lane and whether it is live, Done tasks older than 14 days included.
  - [ ] `last_backlog_rank` includes tombstoned Backlog tasks (as `end_of_lane`, `merge/tasks.rs:94-99`).
  - [ ] Export, merge import and backups round-trip `origin`; a v8 file imports with `origin` NULL.
  - [ ] `repo/tasks.rs` stays under 500 lines (expected about 380).
- Tests first: `migration_0009_keeps_tasks`, `origin_check_refuses_bad_values`, `insert_logs_origin`, `origins_reports_lane_and_live`, `origins_includes_old_done`, `last_backlog_rank_counts_tombstones`, `portability_round_trips_origin`, `v8_file_imports_without_origin`.
- Notes: if the Routines session lands a 0009 first, renumber. Snapshot and stats need no change. The `board/mod.rs:53` edit is line-disjoint from I5's `:8`; keep both on rebase.

### I3: Platform: Reminders through EventKit
- Priority: 1
- Kind: rust
- Depends on: I1
- Owns: `crates/platform-macos/src/reminders.rs` (new; split into `reminders/{mod,map}.rs` if it nears 500), `crates/platform-macos/Cargo.toml` (32), `apps/orasenda/src-tauri/Info.plist` (new), `apps/orasenda/src-tauri/entitlements.plist` (new), `apps/orasenda/src-tauri/src/lib_tests/plist.rs` (new).
- Touches: `crates/platform-macos/src/lib.rs` (41; mod and `pub use` lines, `lib.rs:23-34`), root `Cargo.toml` (`[workspace.dependencies]`), `apps/orasenda/src-tauri/src/lib_tests.rs` (mod line).
- Interfaces:
  - Consumes: `RemindersSource`, `ReminderItem`, `DueParts`, `SourceAccess` (I1).
  - Produces: `MacReminders` (`impl RemindersSource`); pure `access_from(status: EKAuthorizationStatus) -> SourceAccess`, `item_id(external: Option<&str>, local: &str) -> String`, `due_parts(y: isize, m: isize, d: isize, h: isize, min: isize) -> Option<DueParts>`.
- Acceptance:
  - [ ] `access_from` maps `fullAccess` to Granted; `writeOnly`, `denied` and `restricted` to Denied; `notDetermined` to NotAsked; any other value to Unavailable.
  - [ ] `ReminderItem.id` is `item_id(calendarItemExternalIdentifier, calendarItemIdentifier)` (the external id, else `local-` + the local one); `list` is the calendar title; `recurring` is `hasRecurrenceRules`; `created_ms` comes from `creationDate`. `due_parts` treats `NSDateComponentUndefined` as absent and needs year, month and day for a date.
  - [ ] `MacReminders` holds no ObjC object; each call makes its own `EKEventStore`, and `read` makes it only after access is Granted. Completions are `RcBlock`s sending over `mpsc` (the `notifier.rs:42-51` pattern); `EKReminder`s are mapped inside the block; a nil array is an `Err`.
  - [ ] `request` waits with no timeout; `read` waits 30 s, then calls `cancelFetchRequest` and returns `Err`. A doc comment says never to call either on the main thread.
  - [ ] `open_settings` opens `x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders`.
  - [ ] `lib_tests/plist.rs` checks, as text over `include_str!("../../Info.plist")` and `entitlements.plist`, that each expected `<key>` is followed by a non-empty `<string>` (Info.plist: both usage keys) or `<true/>` (entitlements: both keys). No plist crate; it runs on every OS. `entitlements.plist` is not wired into `tauri.conf.json`.
  - [ ] Tests never construct `MacReminders`.
- Tests first: `access_from_maps_every_status`, `access_from_unknown_is_unavailable`, `item_id_prefers_external`, `item_id_local_fallback`, `due_parts_needs_year_month_day`, `due_parts_time_optional`, `info_plist_has_reminders_key`, `info_plist_has_apple_events_key`, `entitlements_plist_has_both_keys`.
- Notes: new dependency `objc2-event-kit` 0.3.2 in `[workspace.dependencies]`, `default-features = false`, features `std`, `EKObject`, `EKEventStore`, `EKReminder`, `EKCalendar`, `EKCalendarItem`, `EKTypes`, `block2` (`EKEventStore` and `EKReminder` turn on `objc2-foundation/NSPredicate` and `NSCalendar`): vet with baton:deps (latest stable compatible with the objc2 0.6 / 0.3 family at `Cargo.toml:22-27`; record the check in the PR). The bundle gate lives in I8's `choose_reminders`.

### I4: Platform: Things through osascript
- Priority: 1
- Kind: rust
- Depends on: I1
- Owns: `crates/platform-macos/src/things.rs` (new; split into `things/{mod,stderr}.rs` if it nears 500), `crates/platform-macos/src/things.js` (the JXA source), `crates/platform-macos/tests/things_collect.rs` (new).
- Touches: `crates/platform-macos/src/lib.rs` (mod and `pub use` lines).
- Interfaces:
  - Consumes: `ThingsSource`, `ThingsReadError` (I1).
  - Produces: `MacThings` (`impl ThingsSource`); `pub fn error_from_stderr(stderr: &str) -> ThingsReadError`; `pub const THINGS_COLLECT_JS: &str`.
- Acceptance:
  - [ ] It runs `Command::new("/usr/bin/osascript")` with no shell, `env_clear()`, stdin null, `-l JavaScript` and the script as one `-e` argument.
  - [ ] `things.js` defines only `function collect(app)`; Rust appends the caller line that passes `Application("com.culturedcode.ThingsMac")`; `THINGS_COLLECT_JS` is exported for the test. The script has no `doShellScript`, no `includeStandardAdditions` and no file access, fetches properties in bulk, keeps only open to-dos, and formats dates as local `YYYY-MM-DD` from `getFullYear`/`getMonth`/`getDate`, writing the Contract's JSON shape.
  - [ ] Stdout is read on a thread and capped at 20 MB (`TooLarge`); non-UTF-8 output is `Failed`. After 120 s the child is killed and reaped (`TimedOut`).
  - [ ] `error_from_stderr`: −1743 gives Denied; −600 or "can't find application" gives NotInstalled; −1728 and anything else give Failed.
  - [ ] `installed()` asks `NSWorkspace` for the bundle id. `open_settings` opens `?Privacy_Automation`.
  - [ ] `tests/things_collect.rs` starts with `#![cfg(target_os = "macos")]` (the `tests/status_item.rs:7` pattern), appends a stub caller (open and completed to-dos, tags, a deadline, a when-date) to `THINGS_COLLECT_JS` and runs `/usr/bin/osascript -l JavaScript -e`; the output equals the Contract sample. `MacThings` is never constructed in tests.
  - [ ] `things.js` passes `biome ci` (Biome lints `**`, `biome.json:10-11`).
- Tests first: `stderr_1743_is_denied`, `stderr_600_is_not_installed`, `stderr_1728_is_failed`, `stderr_unknown_is_failed`, `script_has_no_shell_or_file_access` (a text check on `things.js`), `collect_returns_open_todos_as_json`, `collect_formats_local_dates`.
- Notes: no new dependency (`NSWorkspace` is already enabled in `objc2-app-kit`). The default test harness finds `tests/things_collect.rs`, so `Cargo.toml` is not touched.

### I5: Service: import items, fitting and the Reminders and Things mapping
- Priority: 1
- Kind: rust
- Depends on: I1
- Owns: `crates/service/src/import/{mod.rs,item.rs,fit.rs,dates.rs,reminders.rs,things.rs}` (new), `crates/service/src/import/tests/{mod.rs,fit.rs,dates.rs,reminders.rs,things.rs}`, `crates/service/src/import/tests/fixtures/things_basic.json` (the Contract sample) and other `things*.json`.
- Touches: `crates/service/src/lib.rs` (14; `mod import;`), `crates/service/src/board/check.rs` (112; the limits and `split_note` become `pub(crate)`), `crates/service/src/board/mod.rs:8` (`pub(crate) mod check;` only; line-disjoint from I2's `:53`, keep both on rebase).
- Interfaces:
  - Consumes: `ReminderItem` (I1); the Things JSON (Contract).
  - Produces: `RawItem`, `fit(RawItem) -> Fitted`, `Summary` (counts plus `lines() -> Vec<String>`), `dates::absolute(text: &str) -> Option<String>`, `reminders::map(Vec<ReminderItem>) -> Vec<RawItem>` (ordered), `things::parse(json: &str) -> Result<Vec<RawItem>, ParseError>` (ordered).
- Acceptance:
  - [ ] Each fit rule from the spec's Mapping section is applied and counted; the summary lines read word for word as the spec writes them, and the Things "doesn't share checklists" line is added for Things.
  - [ ] Notes are composed as title remainder, source notes, extra checklist lines, date lines, and cut at 10 000 characters on a line end from the last part first.
  - [ ] `absolute` accepts `YYYY-MM-DD` (time ignored), "20 Nov 2026" and "Nov 20 2026"; it refuses "every day", "tomorrow" and "Nov 20".
  - [ ] Reminders: priority 1–4 high, 5 medium, 6–9 low, 0 none; the list title is a tag; a date with a time keeps the date and adds `Reminders time: 15:00`; recurring adds `Repeats in Reminders`; the URL follows the notes; order is list title, created date, id; the origin is `reminders:` + `ReminderItem.id`.
  - [ ] Things: project or area, then `tagNames` split on commas; deadline as due; when-date as `When in Things: …`; order stable by project or area, then index; origin `things:<id>`. Items arrive already filtered; `things::parse` does not filter.
- Tests first: `title_over_200_splits_into_notes`, `empty_title_is_skipped_and_counted`, `tags_cut_dedupe_and_cap`, `checklist_over_30_spills_into_notes`, `notes_cut_takes_last_part_first`, `absolute_dates_accepted_and_refused`, `reminders_priority_mapping`, `reminders_time_and_repeat_go_to_notes`, `reminders_order_is_list_created_id`, `things_fixture_maps_tags_and_dates`, `things_comma_tags_split`.
- Notes: no new dependency. Pure code only; no `Host`. The JSON fixtures pass `biome ci`.

### I6: Service: the Todoist parser
- Priority: 1
- Kind: rust
- Depends on: I5
- Owns: `crates/service/src/import/todoist.rs`, `crates/service/src/import/todoist_zip.rs`, `crates/service/src/import/origin.rs` (new), `crates/service/src/import/tests/{todoist.rs,todoist_zip.rs}`, `crates/service/src/import/tests/fixtures/todoist/**` (small CSV files; any committed `.zip` stays under 10 KB).
- Touches: `crates/service/Cargo.toml` (25), root `Cargo.toml` (`[workspace.dependencies]`), `crates/service/src/import/mod.rs` and `tests/mod.rs` (mod lines).
- Interfaces:
  - Consumes: `RawItem`, `dates::absolute` (I5).
  - Produces: `todoist::parse_file(path: &Path) -> Result<Vec<RawItem>, ParseError>` with `ParseError { NotAnExport, Unreadable, TooLarge }`; `origin::todoist(project: &str, title: &str, n: u32) -> String`.
- Acceptance:
  - [ ] Columns are found by header name in any order; a missing `TYPE` or `CONTENT` header, or non-UTF-8 text, is `NotAnExport`; a BOM is skipped; RFC 4180 quoting with commas, quotes and line breaks parses; CRLF and LF both parse.
  - [ ] `TYPE=section` sets the section tag; `TYPE=note` rows append to the task's notes; rows with an empty or unknown `TYPE` are skipped; `INDENT` deeper than the parent becomes checklist items, flattened.
  - [ ] `PRIORITY` 1 high, 2 medium, 3 low, 4 none; `DEADLINE`, else `DATE`, as due when absolute, otherwise `Todoist date: …` in the notes.
  - [ ] The project tag is the file or entry stem without a trailing ` [id]`, ` (n)` or ` copy`.
  - [ ] Files over 20 MB (from metadata, before reading) are `TooLarge`. A `.zip` is read in memory through a reader capped at 50 MB in total, with declared sizes not trusted, nothing written to disk and at most 500 entries; only top-level `*.csv` entries count, in name order; directories, `__MACOSX/`, nested archives and encrypted entries are skipped; no CSV is `NotAnExport`.
  - [ ] The origin is `todoist:` plus the first 32 hex digits of SHA-256 over `project \u{1f} title \u{1f} n`; two same-named tasks in one project get different origins.
  - [ ] `just service-boundary` and `just mobile` pass.
- Tests first: `csv_by_header_name_any_order`, `csv_missing_headers_not_an_export`, `csv_bom_and_multiline_quotes`, `csv_crlf_built_in_test`, `sections_and_notes_rows`, `indent_becomes_checklist`, `unknown_type_skipped`, `priority_one_is_high`, `relative_date_goes_to_notes`, `project_name_cleanup`, `file_over_20mb_too_large`, `zip_skips_macosx_nested_and_dirs`, `zip_entries_in_name_order`, `zip_bomb_capped_at_50mb`, `zip_over_500_entries_refused`, `zip_without_csv_not_an_export`, `same_title_gets_distinct_origins`, `csv_header_only_is_empty`.
- Notes:
  - New dependencies in `[workspace.dependencies]`: `csv` 1.4.0; `zip` with `default-features = false, features = ["deflate-flate2"]` plus `flate2`'s `rust_backend` (`flate2` 1.1.11 and `miniz_oxide` are already in `Cargo.lock:757,1806`); `sha2 = "0.10.9"`, to unify with `Cargo.lock:2923` rather than take 0.11. Vet each with baton:deps (latest stable compatible with these pins; confirm the exact features and that no `zopfli`, `aes` or `time` crate enters the tree; record the check in the PR).
  - `.gitattributes` (`* text=auto eol=lf`) would rewrite CRLF fixtures, so the CRLF, BOM, 20 MB, 50 MB bomb and 500-entry cases are built in the test (temp dir, `ZipWriter`) and never committed.
  - Keep each file under 500 lines (`todoist.rs` for CSV, `todoist_zip.rs` for archives).

### I7a: Service: sources, preview and matching
- Priority: 1
- Kind: rust
- Depends on: I2, I6
- Owns: `crates/service/src/import/{preview.rs,pending.rs,view.rs}` (new), `crates/service/src/api/import.rs` (new), `crates/service/src/import/tests/{sources.rs,preview.rs,matching.rs}`, `crates/service/src/session/tests/support/import_fakes.rs` (new).
- Touches: `crates/service/src/api/mod.rs` (50; mod and re-exports), `crates/service/src/scheduler/host.rs` (61; two default methods), `crates/service/src/session/tests/support/fakes.rs` (461; at most 10 lines: the two `Host` methods delegate to `import_fakes.rs`), `crates/service/src/session/tests/support/mod.rs` (mod line), `crates/service/src/session/service.rs` (fields `import_pending` and `import_last`, `pub(crate)`, on the struct at :81 beside the existing `pending` at :92, initialised in `new` at :163), `crates/service/src/board/columns.rs` (`read` becomes `pub(crate)`), `crates/service/src/board/view.rs` (`due_label`, `stored_lane`, `Ctx` become `pub(crate)`), `crates/service/src/board/mod.rs` (`pub(crate) mod columns; pub(crate) mod view;`), `crates/service/src/import/mod.rs`.
- Interfaces:
  - Consumes: I2's `tasks::origins`; I5 and I6 parsers and `fit`; I1 traits.
  - Produces: `run_import_sources(host) -> ImportSourcesView`; `run_import_preview(host, PreviewRequest) -> Result<ImportPreview, ImportError>`; `run_import_discard(host, preview_id: u64)`; `Host::reminders() -> Option<Arc<dyn RemindersSource>>`, `Host::things() -> Option<Arc<dyn ThingsSource>>`; the API types in the spec's Service section (specta-derived, `u64` ids as `specta_typescript::Number`, `docs/common-issues.md`); `PendingPreview` and `LastImport` for I7b.
- Acceptance:
  - [ ] `run_import_sources` lists each source the host returns `Some` for, in the order Reminders, Todoist, Things; a Reminders source whose `access()` is Unavailable is listed `available: false` with the reason "Reminders works in the installed app only."; off macOS, Todoist alone. While `session_active`, Reminders and Things carry the spec's reason line.
  - [ ] `run_import_preview` checks `session_active` before reading, asks for access only when NotAsked, reads outside the service lock, then matches origins under it. It writes nothing, replaces any pending preview, numbers it from a per-process counter, and caps it at 500 rows (the "Showing 500 of 812…" line first in `summary`).
  - [ ] Matching: a live match in any lane gives `onBoard` and an unselected row whose why line names the user's column (`columns::read`); several matches name the first in lane order; a removed-only match is selected.
  - [ ] The meta line reads `<tags> · Due Fri 20 Nov · 4 checklist items`, built with `due_label`.
  - [ ] `run_import_discard` drops the pending preview only when the id matches.
  - [ ] Each `ImportError` kind it returns carries the spec's line.
- Tests first: `sources_without_platform_is_todoist_only`, `sources_unbundled_reminders_reason`, `sources_disabled_while_session_active`, `preview_writes_nothing`, `preview_asks_only_when_not_asked`, `preview_denied_is_denied_error`, `preview_things_timeout_line`, `preview_reminders_timeout_line`, `things_empty_source_line`, `preview_caps_at_500_new_first`, `match_live_in_any_lane_unselected`, `match_removed_only_selected`, `match_names_first_by_lane_order`, `meta_line_words`, `discard_drops_only_matching_id`, `todoist_preview_while_session_active`.
- Notes: the fakes for both traits live in `import_fakes.rs` so `fakes.rs` stays under 500. No new dependency.

### I7b: Service: import write, undo and settings
- Priority: 1
- Kind: rust
- Depends on: I7a
- Owns: `crates/service/src/import/commit.rs` (new), `crates/service/src/import/tests/{commit.rs,undo.rs}`.
- Touches: `crates/service/src/board/mod.rs` (`write` becomes `pub(crate)`, `:211`), `crates/service/src/board/service.rs` (`Answer` becomes `pub(crate)`), `crates/service/src/import/mod.rs`, `crates/service/src/import/tests/mod.rs`.
- Interfaces:
  - Consumes: I2's `tasks::last_backlog_rank`, `NewTask.origin`; I1's `rank::spread`; I7a's pending preview and last import.
  - Produces: `run_task_import(host, preview_id: u64, keys: Vec<u32>) -> Result<ImportDone, ImportError>`; `run_task_import_undo(host, import_id: u64) -> Result<u32, ImportError>`; `run_import_open_settings(host, ImportSourceKind) -> Result<(), ImportError>`.
- Acceptance:
  - [ ] `run_task_import` writes the chosen rows in source order at `rank::spread(last_backlog_rank, n)` with their origins in one `board::write`, emits `board-changed` after the lock, consumes the preview only on commit and records the last import. Rows are not re-matched. No keys, an unknown key or an id that isn't pending answers `stale` and writes nothing. A failed write keeps the preview.
  - [ ] `run_task_import_undo` tombstones the last import's live tasks in one write and answers the count; another id answers `stale`.
  - [ ] `run_import_open_settings` calls the source's `open_settings`; Todoist answers `unavailable`.
- Tests first: `import_appends_in_source_order`, `import_logs_origin_and_emits_after_lock`, `import_empty_keys_is_stale`, `import_unknown_key_is_stale`, `import_after_discard_is_stale`, `failed_write_keeps_preview`, `import_after_board_change_uses_current_last_rank`, `todoist_import_while_session_active`, `undo_tombstones_last_import`, `undo_skips_already_removed`, `undo_other_id_is_stale`, `open_settings_todoist_unavailable`.
- Notes: no new dependency.

### I8: IPC: import commands and platform wiring
- Priority: 1
- Kind: rust
- Depends on: I3, I4, I7b
- Owns: `apps/orasenda/src-tauri/src/commands/import.rs` (new), `apps/orasenda/src-tauri/src/lib_tests/import.rs` (new).
- Touches: `apps/orasenda/src-tauri/src/file_picker.rs` (95; `open_import` on the trait and on both `DialogPicker` impls, the mobile one at :79 answering `Unavailable`), `apps/orasenda/src-tauri/src/lib_tests/data_files.rs` (`FakePicker::open_import`, :58), `apps/orasenda/src-tauri/src/platform.rs` (82; `choose_reminders` beside `choose_notifier` at :42, and `import_sources()`), `apps/orasenda/src-tauri/src/runtime/session.rs` (`app.manage(ImportSources { reminders, things })`, beside :34-38), `apps/orasenda/src-tauri/src/runtime/ticker.rs` (204; the two `Host` methods read the managed `ImportSources`, as :48-50 does), `src-tauri/src/lib_tests.rs` (mod line), the append-only registration files (`commands/mod.rs`, `lib.rs`, `apps/orasenda/src-tauri/commands.list.rs`, `build.rs`, `capabilities/main.json`), `apps/orasenda/src/shared/ipc/bindings.ts` and `permissions/autogenerated` (regenerated).
- Interfaces:
  - Consumes: the I7a and I7b `run_*` functions and types; `MacReminders`, `MacThings` (I3, I4); `UnbundledReminders` (I1).
  - Produces: `import_sources() -> ImportSourcesView`; `import_preview(source: ImportSourceKind) -> Result<ImportPreviewOutcome, ImportError>` with `ImportPreviewOutcome = { picked: ImportPreview } | { cancelled }`; `import_discard(previewId: number)`; `task_import(previewId: number, keys: number[]) -> Result<ImportDone, ImportError>`; `task_import_undo(importId: number) -> Result<number, ImportError>`; `import_open_settings(source: ImportSourceKind) -> Result<(), ImportError>`; `FilePicker::open_import(&self) -> Result<Option<PathBuf>, DataError>`; `pub(crate) fn choose_reminders(in_bundle: bool) -> Arc<dyn RemindersSource>`; `platform::import_sources() -> ImportSources`.
- Acceptance:
  - [ ] `platform::import_sources() -> ImportSources` is separate from the service's `Platform`; on macOS Reminders is `choose_reminders(is_app_bundle())` and Things is `MacThings` (not bundle-gated); off macOS both are `None`.
  - [ ] `import_preview` runs on the blocking pool; for Todoist it shows the Open panel (`.csv`, `.zip`) first, a cancel answers `cancelled`, and a picker error maps to `unreadable`.
  - [ ] `import_open_settings` hops to the main thread as `notifications_open_settings` does (`commands/notifications.rs:18`).
  - [ ] Every command is in the `build.rs` manifest and granted only in `capabilities/main.json`; bindings are regenerated.
  - [ ] `just mobile` passes; the Windows advisory job builds.
- Tests first: `import_preview_cancelled_panel`, `import_preview_picker_error_is_unreadable`, `import_commands_in_main_capability_only`, `choose_reminders_outside_bundle_is_unavailable`, `host_sources_none_off_macos` (`cfg(not(target_os = "macos"))`).
- Notes: no new dependency.

### I9: Components: import source picker, preview list, Dialog and EmptyState
- Priority: 1
- Kind: ui
- Depends on: none (follows the canvas pick on its issue; until one is recorded, B1)
- Owns: `packages/ui/src/components/ui/import-source-picker.{tsx,md,test.tsx,specimen.tsx}`, `import-preview-list.{tsx,md,test.tsx,specimen.tsx}`, `dialog.{tsx,md,test.tsx,specimen.tsx}` (170, 249 test, 108 specimen), `empty-state.{tsx,md,test.tsx}` (45, 7, 40).
- Touches: `packages/ui/src/index.ts` (110), `packages/ui/designSystem.test.ts` (338), `packages/ui/specimens/registry.ts`, `packages/ui/design-system/README.md` (the scrim line: the import sheet).
- Interfaces: Produces the spec's props: `ImportSourcePicker { sources, reading?, onPick }`; `ImportPreviewList { label, items, onToggle, onSetAll, summary? }`; `Dialog.confirmLabel?`, `Dialog.confirmDisabledReason?` (`Dialog.loading` already exists, `dialog.tsx:42,160`); `EmptyState.secondaryAction?: { label, onAction }`.
- Acceptance:
  - [ ] `ImportSourcePicker`: one tab stop, ↑/↓ roving; a disabled row keeps its reason visible and linked by `aria-describedby`; `reading` shows "Reading…" with `aria-busy`.
  - [ ] `ImportPreviewList`: rows built from `Choice long` with `type="checkbox"`, in a `role="group"` named by `label`; one tab stop with ↑/↓, Home/End and Space; the count line ("12 of 14 selected") is not live; *Select all* or *Select none*, whichever applies; each row's name is its title and its description the meta and why lines; 500 rows render without a layout shift.
  - [ ] `Dialog` without `confirmLabel` renders no confirm; `confirmDisabledReason` disables the confirm with the reason linked; the task sheet and delete-data dialog tests stay green. `dialog.md`'s sheet line is amended as the spec says.
  - [ ] `EmptyState.secondaryAction` adds one ghost button after the quiet action; README amended.
  - [ ] Both themes in the specimens; `just contrast` passes. The import sheet at 1440×900, 900×600 and 640×480: no page scroll, list scrolls, actions pinned, hit-min rows, a visible focus ring.
- Tests first: `source_picker_roves_and_picks`, `source_picker_disabled_reason_described`, `preview_list_one_tab_stop`, `preview_list_space_toggles`, `preview_list_select_all_none`, `preview_list_names_and_descriptions`, `dialog_without_confirm`, `dialog_confirm_disabled_reason`, `empty_state_secondary_action`.
- Notes: no new dependency. Recount the exports after a rebase (`docs/common-issues.md`).

### I10: Components: drop slot and moving card
- Priority: 2
- Kind: ui
- Depends on: #580 (Board polish P6) (follows the canvas pick on its issue; until one is recorded, C1)
- Owns: `packages/ui/src/components/ui/kanban-column.{tsx,md,test.tsx,specimen.tsx}` (136, 176 test, 80 specimen), `task-card.{tsx,md,specimen.tsx}` (303, 96 specimen; recount after #575 and #580 land), `task-card.moving.test.tsx` (new).
- Touches: `packages/ui/design-system/README.md` (the Board line: drag).
- Interfaces: Produces `KanbanColumn.drop?: { index: number; label: string }` and `TaskCard.moving?: boolean`, as in the spec.
- Acceptance:
  - [ ] `drop` draws a `hit-min` dashed `line-strong` slot with "Moving <title> here" at `index` (counted with the dragged card left out); on a collapsed column the index is ignored and the strip shows the `selection` ground and "Move here".
  - [ ] `moving` shows a dashed `line-strong` edge and the word "Moving", with no opacity.
  - [ ] `kanban-column.md` and `task-card.md` drop their "no drag here" lines as the spec says.
  - [ ] Both themes; `just contrast`.
- Tests first: `drop_slot_at_index`, `drop_on_strip_reads_move_here`, `moving_card_word_and_edge`.
- Notes: no new component, so `designSystem.test.ts` and the specimens registry are untouched. New `TaskCard` cases go in `task-card.moving.test.tsx` so `task-card.test.tsx` doesn't grow. If `task-card.tsx` passes 450 lines after #580, split the row density into `task-card-row.tsx` here.

### I11: Screen: the import sheet on the Board
- Priority: 1
- Kind: mixed
- Depends on: I8, I9, Board polish #574 and #580 (they change `features/board/**`)
- Owns: `apps/orasenda/src/features/board/import/**` (new: `ImportSheet.tsx`, `useImport.ts`, `ImportSheet.*.test.tsx`).
- Touches: `features/board/BoardPage.tsx` (220; mount the sheet; `importAsked?: number` and `onImportOpened?: () => void`; the empty state), `features/board/BoardColumns.tsx` (79; pass `footer` for the Backlog column, which today only Today has; `NewTaskField` stays the child at the top, `BoardColumns.tsx:62`), `features/board/useBoardActions.ts` (234; the import line with Undo), `shared/test/fixtures*` and the `NAMES` list (a case on the real sheet).
- Acceptance:
  - [ ] Entry points follow the canvas pick on the issue (lean A2): a quiet "Import tasks…" in the Backlog footer, and the empty Board's `EmptyState` with the message "Add one, move a note from the Inbox, or import tasks." and *Import tasks…* as its `secondaryAction`; neither opens anything by itself.
  - [ ] `importAsked` opens the sheet only when it differs from the last value consumed, then calls `onImportOpened`, so a remount never reopens it.
  - [ ] The sheet (lean B1) opens with focus on the first source row; picking reads; the preview focuses the list; Close or a source change calls `import_discard`; an answer to an older request is dropped.
  - [ ] The sources are re-read whenever the timer view changes; while a session is active the Reminders and Things rows show the reason.
  - [ ] Denied shows the plain line and *Open System Settings*; for Reminders, on window focus while the denied line shows, the sheet calls `import_preview('reminders')` again (it asks only when access is NotAsked); for Things a quiet *Try again*; every `ImportError` kind shows its line; an empty source shows the default `EmptyState` with *Choose another source*.
  - [ ] The cap line ("Showing 500 of 812…") shows as the first `summary` entry of `ImportPreviewList`.
  - [ ] *Import N tasks* (singular "Import 1 task") is disabled with "Select at least one task to import." when none is selected, shows "Importing…" while writing, then closes the sheet; the status line reads "Imported N tasks to Backlog." with *Undo* (name "Undo importing N tasks"); Undo answers "Import undone."; `stale` shows its line and keeps the sheet open; a failed write shows *Try again* and keeps the preview.
  - [ ] Layout at 1440×900, 900×600 and 640×480 passes; both themes; VoiceOver names.
- Tests first: `footer_button_opens_sheet`, `empty_board_offers_import`, `import_asked_opens_once`, `focus_first_source_then_list`, `stale_answer_dropped`, `close_discards_preview`, `sources_reread_when_timer_changes`, `session_active_rows_show_reason`, `denied_shows_open_settings`, `reminders_rereads_on_focus`, `things_denied_try_again`, `empty_source_choose_another`, `cap_line_shown`, `import_disabled_with_reason`, `import_line_with_undo`, `undo_answers_import_undone`, `stale_import_keeps_sheet`, `failed_import_try_again_keeps_preview`.
- Notes: `BoardPage.tsx` gains about 25 lines; the sheet logic stays in `import/`. No new dependency.

### I12: Screen: Settings › Your data and the palette
- Priority: 2
- Kind: web
- Depends on: I11, #581 (Board polish P5, which edits the palette)
- Owns: the "Tasks from other apps" row in `apps/orasenda/src/features/settings/panes/YourData.tsx` (195) and its test `YourData.import.test.tsx` (new); `apps/orasenda/src/app/App.import.test.tsx` (new).
- Touches: `apps/orasenda/src/features/settings/PaneBody.tsx` (passes the handler, :107), `features/settings/Settings.tsx` (an `onImportTasks` prop), `apps/orasenda/src/app/palette/paletteCommands.ts` (147, plus #581's lines) and `paletteCommands.test.ts`, `app/palette/Palette.tsx` (165; the `importTasks` case), `app/palette/Palette.test.tsx` (291), `apps/orasenda/src/app/App.tsx` (303; holds `importAsked`, goes to the Board, resets in `onImportOpened`).
- Acceptance:
  - [ ] Settings › Your data shows "Tasks from other apps" with a quiet "Import tasks…" beside the data buttons; it goes to the Board and opens the sheet.
  - [ ] The palette lists "Import tasks…"; choosing it goes to the Board and opens the sheet; it is never the first result.
  - [ ] Focus lands in the sheet; Close returns focus to the Board's heading. Leaving the Board and coming back does not reopen the sheet.
- Tests first: `your_data_import_opens_board_sheet`, `palette_import_tasks_opens_sheet`, `palette_import_is_not_first`, `returning_to_board_does_not_reopen_sheet`.
- Notes: no new dependency. `App.test.tsx` (311) is not grown; the new cases live in `App.import.test.tsx`.

### I13: Screen: pointer drag on the Board
- Priority: 2
- Kind: mixed
- Depends on: I10, I11; ordered after I12 by the owner's rule only (file-disjoint, may run beside I12 if the owner relaxes it). Follows the canvas pick (C1 until one is recorded).
- Owns: `apps/orasenda/src/features/board/useCardDrag.ts` (new), `features/board/dragGeometry.ts` (new), `features/board/dragGeometry.test.ts` (new), `features/board/BoardPage.drag.test.tsx` (new).
- Touches: `features/board/BoardColumns.tsx` (`drop` and `moving` props), `features/board/BoardCard.tsx` (49), `features/board/BoardPage.tsx` (pointer handlers on the board root), `features/board/BoardPage.support.tsx` (51; a `stubRects` helper and a `setPointerCapture` stub), `features/board/board.css` (31; `user-select` while dragging, tokens only), `features/board/useBoardActions.ts` (the drag lines).
- Interfaces: Produces pure `targetAt(rects, scroll, point, draggedId) -> { lane, index } | null` and `edgeZone(rect, point) -> -1 | 0 | 1` in `dragGeometry.ts`.
- Acceptance:
  - [ ] Mouse and pen only; touch is ignored. A press moving less than 6px stays a click; past 6px the drag starts with pointer capture and `user-select` off, and the click that ends it is swallowed.
  - [ ] The card stays in place marked "Moving"; there is no slot at its own place, and a release there cancels. `targetAt` uses card rects measured at drag start plus scroll offsets, recomputed on `pointermove`, `scroll` and `wheel`.
  - [ ] A drop calls `task_move` with the index counted without the dragged card; in Done the slot is at the top and the call is `task_move(id, "done", 0)`; a drag that starts and ends in Done cancels; a folded strip takes the drop at its end.
  - [ ] Esc is consumed and cancels; so do `pointercancel`, window blur and a release outside every column.
  - [ ] The edge zone is hit-min tall and scrolls one step per animation frame; cards make room over `duration-calm`; under reduce-motion only the easing changes and nothing animates.
  - [ ] The status line says the four lines from the spec; a keyboard reorder stays silent (`useBoardActions.ts:115`); focus lands on the dropped card. A drop past a limit reads "4 of 3" and nothing moves back.
  - [ ] A real mouse drag moves a card between columns.
- Tests first: `target_between_midpoints`, `target_skips_dragged_card`, `target_done_is_top`, `target_with_scroll_offset`, `edge_zone_top_and_bottom` (in `dragGeometry.test.ts`); `click_below_threshold_selects`, `touch_is_ignored`, `drag_moves_between_columns`, `drag_reorders_within_column`, `release_on_own_place_cancels`, `drop_in_done_goes_to_top`, `done_to_done_cancels`, `drop_on_folded_strip`, `esc_cancels_and_is_consumed`, `release_outside_cancels`, `click_after_drag_swallowed`, `drag_announces_in_words`, `keyboard_reorder_stays_silent`, `drop_past_limit_allowed`, `no_drag_under_open_sheet` (in `BoardPage.drag.test.tsx`, with `stubRects`).
- Notes: no new dependency, and no HTML5 drag and drop. `DRAG_START_PX = 6` is a behaviour constant with a comment. jsdom has zero-size rects, so the geometry is tested pure and the page test stubs rects.

### I14: Close-out (docs only, haiku)
- Priority: 3
- Kind: docs
- Depends on: I1–I13 merged, and Board polish (#574, #575, #579, #580, #581, #587) merged
- Owns: this spec's status and Implementation status; this plan's status; the status lines of `docs/specs/2026-11-15-board-polish.md` and `docs/plans/2026-11-15-board-polish.md`; `docs/ROADMAP.md` (P2 row and note, lines 25 and 39); the Board spec's Follow-ups (`docs/specs/2026-11-14-board.md:240-246`); `CONTEXT.md`; `docs/common-issues.md`.
- Acceptance:
  - [ ] This spec and plan read "implemented (date)" with the merged PR list; the Board polish spec reads implemented with its PR list.
  - [ ] ROADMAP marks P2 done (Board, Board polish, import, drag) and closes P2.
  - [ ] The Board spec's Follow-ups name the PRs that closed #582 and #583, and the rulings for #584 (Later) and #585 (P4, #562).
  - [ ] #582 and #583 are closed by their PRs.
  - [ ] CONTEXT terms match the shipped names; common issues gain any lesson the run recorded (EventKit, osascript, TCC resets).
- Tests first: none (docs); `./scripts/ci.sh` passes.
- Notes: **controller steps, not part of the haiku PR:** create the "Later" milestone if it is absent (`gh api repos/arkgast/orasenda/milestones -f title=Later`) and add #584 to it with a comment quoting Decision 18; keep #585 open, add a `P4` label and a comment quoting Decision 19 and linking #562; comment on #562 linking #585.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Three sources, macOS-only gating | I3, I4, I7a, I8 |
| Decision 21: Reminders outside a bundle reads "works in the installed app only" | I1, I7a, I8 |
| Permissions at the moment of need, never stored, denied line | I3, I4, I7a, I11 |
| No OS source while a session is active | I7a, I11 |
| Preview, nothing written before Import | I7a, I9, I11 |
| One transaction, source order, spread ranks | I1, I2, I7b |
| Undo of the whole import | I7b, I11 |
| Origin and "Already on the Board" | I2, I3, I5, I6, I7a |
| Mapping and fitting with words | I5, I6, I7a, I9 |
| 500-row cap | I7a, I11 |
| Entry points: Board, palette, Settings | I11, I12 |
| Pointer drag, Done as a whole, Esc, words | I10, I13 |
| Components, READMEs, specimens, both themes | I9, I10 |
| Goal 7: design-system artifact republished from main | controller after I9 and after I10 (Overview) |
| Info.plist keys, entitlements file | I3 |
| #584, #585 rulings; P2 close | I14 (and its controller steps) |
| Failure mode: the Reminders read times out | I7a: `preview_reminders_timeout_line` |
| Failure mode: a Todoist CSV with a header row only | I6: `csv_header_only_is_empty` |
| Failure mode: the board changes between preview and import | I7b: `import_after_board_change_uses_current_last_rank` |
| Failure mode: a drag while the task sheet is open | I13: `no_drag_under_open_sheet` |
| Failure mode: Things returns `[]` | I7a: `things_empty_source_line` |
