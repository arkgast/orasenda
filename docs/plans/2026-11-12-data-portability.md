# Data portability (P1 sub-project G) — Implementation Plan

- Spec: [docs/specs/2026-11-12-data-portability.md](../specs/2026-11-12-data-portability.md)
- Date: 2026-11-12
- Status: in backlog (#412–#420, in triage until approved)

## Overview
G is cut into nine tasks, built store → service → adapter → screens:
- **Store:** **G1** (snapshot, probe, counts) and **G2** (row reader and merge) own separate modules and run in parallel.
- **Service:** **G3** (backups, policy, pending swap) builds on G1; **G4** (import) on G2 and G3.
- **Adapter:** **G5** (overview, backups, Delete all data, the automatic check) builds on G3; **G6** (export and import through `tauri-plugin-dialog`) on G4.
- **Refactor:** **G7** moves `NumberField` out of `CadenceRows.tsx`, move only. It can run any time.
- **Screens:** **G8** (About and Your data) waits for G5, G6 and F7 (#393, which also edits `SettingsHeader.tsx` and `Settings.tsx`); **G9** (Backups) follows G8 and G7.

No migration: `SCHEMA_VERSION` stays 5. If a task finds one is needed, it takes **0006**, after F2's 0005, and the plan is amended on its issue.

Every file stays at 500 lines or fewer, tests included. Planned splits are in each task's Notes. Each task that changes IPC regenerates `bindings.ts` and updates `test/fixtures.ts`. The shared registration files are append-only. On a conflict the controller keeps both sides (`union.py`), then runs `cargo fmt` and `just bindings`, and fixes the exact capability lists. These files are `commands.list.rs`, `commands/mod.rs`, `lib.rs`, `capabilities/main.json`, `lib_tests.rs`, `api/mod.rs`, `api/events.rs`, `scheduler/host.rs` and `test/fixtures.ts`.

The UI tasks (G8, G9) get the opus code review and then the opus design review (layout boxes and gaps against the spec, no screenshots). The owner reviews visuals.

## Contract
- **Store API** (G1, G2): `Store::snapshot_to`, `portability::{probe, Probe, ProbeError, rows, SyncRows, merge, MergeCounts, counts, Counts}`.
- **Service API types** (`crates/service/src/api/data.rs`, created by G3, extended by G4): `BackupEntry`, `BackupKind`, `BackupPolicy`, `BackupFrequency`, `DataCounts`, `DataOverview`, `DataError`, `DataErrorKind`, `ImportReport`. They're specta types, so `bindings.ts` carries them.
- **IPC** (G5, G6): the commands in the spec's table and the event `backups-changed: DataOverview`. G8 and G9 build against these names, with the fixtures in `test/fixtures.ts`.

## Impact
- **Affected call paths:**
  - `open_store_at` (`crates/service/src/session/run.rs:31-35`) gains the pending swap, so every launch passes through it.
  - `runtime/session.rs::setup` and the `Focused(true)` handler (`lifecycle.rs:57`) start the automatic check.
  - The store lock is held during `VACUUM INTO`, so the scheduler's tick waits for it. A snapshot of today's database takes well under 100 ms.
- **Data:**
  - No schema change.
  - The new `meta` keys are `backup.frequency` and `backup.keep`.
  - New files in the app data dir: `Backups/`, `orasenda.restore.db`, `orasenda.delete` and `import-<uuid>.db` (temporary).
- **Dependency:** `tauri-plugin-dialog` 2.8.4 (G6, through baton:deps), desktop only, so `just mobile` still builds.
- **Downstream checks that must stay green:**
  - the recovery tests (`session/tests/run.rs`, `recovery.rs`);
  - the manifest and capability tests in `lib_tests.rs`;
  - `settings*.spec.ts` and `Settings.navigation.test.tsx` (the index gains two sections, and `about`'s heading changes);
  - the store's migration tests.
- **Rollout and rollback:**
  - Squash PRs.
  - Reverting G3 after a pending-swap file exists leaves the file unused. That's harmless: the next G build applies it.
  - Reverting G4 leaves imported rows in place, logged like normal writes.

## Dependency graph
```
G1 ──> G3 ──┬──> G4 ──> G6 ──┐
G2 ─────────┘    G3 ──> G5 ──┼──> G8 ──> G9
                     F7 #393 ┘          ▲
G7 ─────────────────────────────────────┘
```
Can start immediately in parallel: **G1, G2, G7**. Then G3 (after G1), G4 (after G2 and G3), G5 (after G3) and G6 (after G4). G8 waits for G5, G6 and F7. G9 waits for G8 and G7. The machine-wide cap is 3 pipelines; G's share is set by the controller when G starts.

## Tasks

### G1: Store snapshot, probe and counts  (#412)
- Priority: 0
- Depends on: none
- Owns: `crates/store/src/portability/{mod.rs,snapshot.rs,probe.rs,stats.rs}` and `crates/store/src/portability/tests/{snapshot.rs,probe.rs,stats.rs}` (new).
- Touches:
  - `crates/store/src/lib.rs`: `pub mod portability`, append-only.
  - `crates/store/src/db.rs`: one `pub(crate) fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> Result<T, StoreError>) -> Result<T, StoreError>` that takes the lock with no transaction (205 lines now; stays under 230).
- Interfaces:
  - Produces:
    - `Store::snapshot_to(&self, dest: &Path) -> Result<(), StoreError>`;
    - `portability::probe(path: &Path) -> Result<Probe, ProbeError>`;
    - `Probe { user_version: u32, has_device_id: bool }`;
    - `ProbeError { NotSqlite, Io(String) }`;
    - `portability::counts(txn: &Txn) -> Result<Counts, StoreError>`;
    - `Counts { sessions: u32, presets: u32, notes: u32, settings: u32 }`.
- Acceptance:
  - [ ] `snapshot_to` writes `<dest>.partial` with `VACUUM INTO` and renames it over `dest`. On error the partial file is gone and `dest` is unchanged. The copy opens with `Store::open` at the same `user_version` with equal rows in every table.
  - [ ] `probe` opens with `SQLITE_OPEN_READ_ONLY` and never writes. It reads a v1 file, a v5 file, `user_version` 99 and an empty SQLite file (`user_version` 0, `has_device_id` false). A text file gives `NotSqlite`.
  - [ ] `counts` counts live rows only (no tombstones) in `focus_session`, `preset`, `inbox_note`, and the `setting` rows.
- Tests first: `snapshot_round_trip_equal_rows`, `snapshot_replaces_existing_dest`, `snapshot_failure_leaves_no_partial`, `probe_reads_versions`, `probe_empty_sqlite_is_not_orasenda`, `probe_text_file_not_sqlite`, `probe_never_writes` (mtime and bytes unchanged), `counts_skip_tombstones`.
- Notes: sonnet, rust. No rusqlite type crosses the module's public API (code-structure). Fixtures: build a v1 file by running only `0001_init.sql` through a test helper in `portability/tests/mod.rs`.

### G2: Store row reader and merge  (#413)
- Priority: 0
- Depends on: none
- Owns: `crates/store/src/portability/rows.rs`, `crates/store/src/portability/merge/{mod.rs,settings.rs,presets.rs,sessions.rs,notes.rs}` and `crates/store/src/portability/tests/{rows.rs,merge.rs}` (new).
- Touches:
  - `crates/store/src/portability/mod.rs`: re-exports, append-only. If G1 hasn't merged yet, G2 creates `mod.rs` with only its own lines, and the controller unions them.
  - `crates/store/src/repo/{presets,focus_sessions,settings,inbox_notes}.rs`: only `pub(crate)` column lists or row mappers if they already exist. No behaviour change.
- Interfaces:
  - Produces:
    - `portability::rows(txn: &Txn) -> Result<SyncRows, StoreError>`;
    - `SyncRows { settings: Vec<SettingRow>, presets: Vec<PresetRowAll>, sessions: Vec<SessionRowAll>, notes: Vec<NoteRowAll> }`, all tombstones included;
    - `portability::merge(txn: &mut Txn, rows: &SyncRows) -> Result<MergeCounts, StoreError>`;
    - `MergeCounts { added: Counts, updated: Counts }` (`Counts` as G1 spells it; G2 defines it if G1 hasn't merged, and the controller keeps one).
- Acceptance:
  - [ ] It follows the spec's merge table exactly. An equal `updated_at` keeps the local row. For `inbox_note`, a `deleted_at` on either side wins and nothing else changes.
  - [ ] Every written row logs every field through `Txn::log_fields` with its `Entity`. An unchanged row logs nothing: merging the same rows twice gives zero counts and zero new `change_log` rows.
  - [ ] Any error rolls back the whole merge (it runs inside the caller's write).
- Tests first: `merge_inserts_rows_only_in_file`, `merge_later_updated_at_wins`, `merge_earlier_loses`, `merge_tie_keeps_local`, `merge_preset_tombstone_carries`, `merge_note_tombstone_wins_either_side`, `merge_twice_is_noop_no_log_rows`, `merge_logs_each_field`, `rows_include_tombstones`.
- Notes: sonnet, rust. Keep each table's merge in its own file (about 60–90 lines each). Tests go in `tests/merge.rs`; split by table into `tests/merge_*.rs` if it passes 400.

### G3: Backups, policy and pending swap (service)  (#414)
- Priority: 0
- Depends on: G1
- Owns: `crates/service/src/data/{mod.rs,names.rs,policy.rs,backups.rs,pending.rs}`, `crates/service/src/data/tests/{mod.rs,names.rs,backups.rs,pending.rs}`, `crates/service/src/api/data.rs` (all new).
- Touches:
  - `crates/service/src/lib.rs` and `api/mod.rs`, append-only.
  - `crates/service/src/session/run.rs`: `open_store_at` calls `data::apply_pending(dir)` before `Store::open`. After a restore it clears `active_session` in the same open, before recovery (279 lines; stays under 300).
- Interfaces:
  - Consumes: `Store::snapshot_to`, `portability::{probe, Probe, ProbeError, counts, Counts}` from G1.
  - Produces:
    - `data::backups::{list(dir: &Path) -> Vec<BackupEntry>, create(store: &Store, dir: &Path, kind: BackupKind, now_ms: u64) -> Result<BackupEntry, DataError>, delete(dir: &Path, file: &str) -> Result<(), DataError>, due(entries: &[BackupEntry], policy: &BackupPolicy, now_ms: u64) -> bool, prune(dir: &Path, keep: u32)}`;
    - `data::policy::{read(store: &Store) -> BackupPolicy, write(store: &Store, policy: &BackupPolicy, now_ms: u64) -> Result<BackupPolicy, DataError>}`;
    - `data::pending::{apply_pending(dir: &Path) -> PendingOutcome, stage_restore(dir: &Path, backup: &str) -> Result<(), DataError>, stage_delete(dir: &Path) -> Result<(), DataError>}`;
    - `PendingOutcome { None, Restored, Deleted }`;
    - `api::data::{BackupEntry { file: String, kind: BackupKind, createdMs: number, bytes: number, newer: bool }, BackupKind { Auto, Manual, BeforeImport, BeforeRestore }, BackupPolicy { frequency: BackupFrequency, keep: u32 }, BackupFrequency { Monthly, Quarterly }, DataCounts, DataError { kind: DataErrorKind, message: String }, DataErrorKind { Busy, Newer, NotOrasenda, Unreadable, Write, Unavailable, NotFound }}`.
- Acceptance:
  - [ ] Names are `orasenda-<YYYYMMDD>T<HHMMSS>Z-<kind>.db`. A same-second clash gets `-2`, `-3`. Parsing gives the time and kind back, and other names are ignored.
  - [ ] `list` probes each backup-named file. A file that isn't SQLite or has no `device_id` is deleted and never returned. A newer one is returned with `newer: true`. Results are newest first.
  - [ ] `create` makes the `Backups/` folder if missing, snapshots, then prunes to `keep` across every kind (oldest first). A newly created backup is never pruned.
  - [ ] `delete` accepts only a name `list` returned. A name with `/` or `..`, or one not in the list, gives `NotFound`.
  - [ ] `due` is true when the newest `auto` backup is ≥ 30 days old (monthly) or ≥ 91 days (quarterly), or when there's none. Manual and safety backups don't count.
  - [ ] Policy: unreadable `meta` values read as the defaults (monthly, 12); `keep` must be 1–50, or `write` refuses it. Lowering `keep` prunes at once.
  - [ ] `apply_pending`: the delete marker wins over a restore. Each removes `orasenda.db`, `-wal` and `-shm`; a restore renames the staged file in. Leftover `.partial` and `import-*.db` files are deleted. Restore staging copies to `.partial` and then renames.
  - [ ] After `Restored`, the opened store has no `active_session` row, so no session resumes.
- Tests first: `names_round_trip_and_suffix`, `list_drops_unrecognised_keeps_newer`, `create_prunes_all_kinds_to_keep`, `create_never_prunes_new_backup`, `delete_refuses_traversal_and_unknown`, `due_boundaries_monthly_quarterly`, `due_ignores_manual_and_safety`, `policy_defaults_on_bad_values`, `policy_keep_range`, `pending_delete_wins`, `pending_restore_swaps_and_clears_active_session`, `pending_removes_partials`, `open_store_at_applies_pending`, `create_makes_backups_folder`.
- Notes: sonnet, rust. Time for names comes from `now_ms` (UTC, no local calendar). Pruning and listing never touch files that don't match the pattern.

### G4: Import (service)  (#415)
- Priority: 0
- Depends on: G2, G3
- Owns: `crates/service/src/data/{import.rs,cap.rs}` and `crates/service/src/data/tests/import.rs` (new).
- Touches:
  - `crates/service/src/api/data.rs`: adds `ImportReport`.
  - `data/mod.rs`, append-only.
  - `crates/service/src/session/service.rs`: a `pub(crate) fn reload_after_import(&mut self)` that re-reads settings and presets the way a launch does (249 lines; stays under 280).
- Interfaces:
  - Consumes: `portability::{probe, rows, merge, MergeCounts}` (G1, G2); `data::backups::create` (G3).
  - Produces:
    - `data::import::run_import<H: Host>(host: &H, dir: &Path, source: &Path) -> Result<ImportReport, DataError>`;
    - `ImportReport { added: DataCounts, updated: DataCounts }`;
    - `data::busy<H: Host>(host: &H) -> bool` (a session is running or paused).
- Acceptance:
  - [ ] `Busy` while a session runs: no backup is taken and nothing changes.
  - [ ] A newer file gives `Newer`. `user_version` 0 or no `device_id` gives `NotOrasenda`. An unreadable file gives `Unreadable`. In every one of these, the live store and `Backups/` are unchanged.
  - [ ] The source is copied to `<dir>/import-<uuid>.db`, and only the copy is opened and migrated. The user's file is byte-for-byte unchanged. The copy is removed on success and on error.
  - [ ] A `before-import` backup is taken before the merge, always.
  - [ ] The merge runs in one live write. Afterwards, if more than `MAX_PRESETS` live presets remain, the newest by `updated_at` are kept, the selected preset always survives, and the rest are tombstoned and logged.
  - [ ] Afterwards the service reloads, applies the theme, and emits `settings-changed` and `presets-changed`, plus `inbox-changed` when notes were added or updated.
- Tests first: `import_busy_refused_no_backup`, `import_newer_refused_unchanged`, `import_not_orasenda`, `import_from_v1_fixture_migrates_copy_only`, `import_source_file_unchanged`, `import_takes_backup_first`, `import_twice_second_is_noop`, `import_preset_cap_keeps_selected`, `import_emits_changes_and_applies_theme`, `import_live_file_is_noop`.
- Notes: sonnet, rust. The recording `Host` from `test-support` checks the emits.

### G5: Data overview, backups and Delete all data (IPC)  (#416)
- Priority: 1
- Depends on: G3
- Owns:
  - `apps/orasenda/src-tauri/src/commands/data.rs` and `apps/orasenda/src-tauri/src/data_tasks.rs`: the automatic check and its single-flight guard.
  - `crates/platform-macos/src/reveal.rs`: NSWorkspace `activateFileViewerSelectingURLs`.
  - `apps/orasenda/src-tauri/src/lib_tests/data.rs`. These are all new.
- Touches:
  - append-only: `commands/mod.rs`, `commands.list.rs`, `lib.rs`, `capabilities/main.json`, `api/events.rs` (`backups-changed`), `scheduler/host.rs` (`emit_backups_changed`, `restart`), `ipc/bindings.ts` (regenerated), `test/fixtures.ts`, `crates/platform-macos/src/lib.rs`;
  - `runtime/session.rs`: start the check after `setup` (85 lines);
  - `lifecycle.rs`: the `Focused(true)` arm calls the check (337 lines; adds about 3).
- Interfaces:
  - Consumes: `data::{backups, policy, pending}` and `api::data::*` (G3); `portability::counts` (G1).
  - Produces:
    - `data_overview() -> DataOverview { counts: DataCounts | null, folder: string, backups: BackupEntry[], policy: BackupPolicy, totalBytes: number, store: StoreStatus }`;
    - `data_show_folder() -> Result<(), DataError>`;
    - `data_delete_all() -> Result<(), DataError>`;
    - `backups_create() -> Result<BackupEntry, DataError>`;
    - `backups_delete(file: string) -> Result<(), DataError>`;
    - `backups_restore(file: string) -> Result<(), DataError>`;
    - `backups_set_policy(policy: BackupPolicy) -> Result<BackupPolicy, DataError>`;
    - event `backups-changed: DataOverview`.
- Acceptance:
  - [ ] Every command is `async` and runs off the main thread. `main.json` grants exactly these; no other capability gains them.
  - [ ] With the store unavailable or newer: `data_overview` returns `counts: null`. `data_delete_all`, `backups_restore`, `backups_delete` and `data_show_folder` work. `backups_create` and `backups_set_policy` give `Unavailable`. Restore takes no safety backup.
  - [ ] `data_delete_all` and `backups_restore` give `Busy` while a session runs. Otherwise they stage, then call `Host::restart` (`AppHandle::restart` in the app; recorded in tests).
  - [ ] Restore of a `newer` backup gives `Newer`. Otherwise the order is: stage, then the `before-restore` backup, then restart.
  - [ ] The automatic check runs on a background thread at launch and on main-window focus. A second call while one runs returns at once. It creates an `auto` backup only when `due`, and emits `backups-changed` after any list change.
- Tests first: `data_commands_in_main_capability_only`, `overview_counts_null_when_unavailable`, `delete_all_busy_refused`, `delete_all_stages_and_restarts`, `restore_newer_refused`, `restore_order_stage_backup_restart`, `restore_without_store_skips_backup`, `create_unavailable_without_store`, `auto_check_single_flight`, `auto_check_creates_only_when_due`.
- Notes:
  - sonnet, rust.
  - `lib_tests.rs` is at 445 lines, so G5's capability and manifest tests go in the new `lib_tests/data.rs`. G5 doesn't add lines to `lib_tests.rs`; it only adds the `mod data;` line.
  - `lifecycle.rs` stays under 345.
  - The macOS-only `reveal.rs` stays behind `#[cfg(target_os = "macos")]`; `platform.rs` gives other targets a no-op.

### G6: Export and import through the dialog plugin (IPC)  (#417)
- Priority: 1
- Depends on: G4
- Owns: `apps/orasenda/src-tauri/src/commands/data_files.rs`, `apps/orasenda/src-tauri/src/file_picker.rs` (a `FilePicker` trait and the plugin implementation), `apps/orasenda/src-tauri/src/lib_tests/data_files.rs` (new).
- Touches:
  - `Cargo.toml` (workspace) and `apps/orasenda/src-tauri/Cargo.toml`: `tauri-plugin-dialog = "2.8.4"` through baton:deps, desktop only;
  - `Cargo.lock` (regenerated);
  - `lib.rs` (`.plugin(tauri_plugin_dialog::init())` under `#[cfg(desktop)]`);
  - append-only: `commands/mod.rs`, `commands.list.rs`, `capabilities/main.json`, `ipc/bindings.ts`, `test/fixtures.ts`.
- Interfaces:
  - Consumes: `Store::snapshot_to` (G1); `data::import::{run_import, busy}`, `ImportReport` (G4); `DataError` (G3).
  - Produces:
    - `data_export() -> Result<ExportOutcome, DataError>`, where `ExportOutcome = { kind: "saved"; file: string } | { kind: "cancelled" }`;
    - `data_import() -> Result<ImportOutcome, DataError>`, where `ImportOutcome = { kind: "imported"; report: ImportReport } | { kind: "cancelled" }`.
- Acceptance:
  - [ ] The Save panel defaults to `Orasenda data <YYYY-MM-DD>.db` (local date) with a `.db` filter. The Open panel takes `.db` only. Both come from Rust through `app.dialog().file()`, and the answer arrives on a `tauri::async_runtime::channel(1)`.
  - [ ] No capability file has a `dialog:` permission, and no npm dialog package is added.
  - [ ] `data_import` gives `Busy` before any panel opens. A cancelled panel gives `cancelled` and changes nothing.
  - [ ] `data_export` works while a session runs.
  - [ ] `just mobile` still builds.
- Tests first: `no_dialog_permission_in_capabilities`, `export_cancelled_writes_nothing`, `export_saved_snapshot_opens`, `import_busy_before_panel`, `import_cancelled_noop`, `import_imported_returns_report`. All of them use a fake `FilePicker`.
- Notes: sonnet, rust. Re-verify 2.8.4 with baton:deps at task start (latest stable on 2026-10-28).

### G7: Move NumberField into its own file (refactor)  (#418)
- Priority: 2
- Depends on: none
- Owns: `apps/orasenda/src/features/settings/sections/NumberField.tsx` (new).
- Touches: `apps/orasenda/src/features/settings/sections/CadenceRows.tsx`, which imports it.
- Interfaces:
  - Produces: `NumberField(props: NumberFieldProps)` and `type NumberFieldProps`, exported unchanged from `CadenceRows.tsx` (the props type above `:32`, the component at `:32`).
- Acceptance:
  - [ ] Move only: no line of the component changes, and `CadenceRows.test.tsx` passes untouched.
- Tests first: none new; the existing `CadenceRows.test.tsx` is the guard.
- Notes: haiku. A refactor PR moves code and never changes it (code-structure).

### G8: Settings › About and Your data  (#419)
- Priority: 1
- Depends on: G5, G6, F7 (#393)
- Owns: `apps/orasenda/src/features/settings/sections/YourData.tsx`, `apps/orasenda/src/features/settings/useDataOverview.ts`, `apps/orasenda/src/features/settings/Settings.data.test.tsx`, `verification/layout/settings.data.spec.ts` (new).
- Touches:
  - `sections/About.tsx`: heading "About", and the new privacy line;
  - `SettingsHeader.tsx`: `SectionId` gains `data` and `backups`, and `SECTIONS` gains "Your data" after About (F7's Keyboard comes before About). G9 adds "Backups" to `SECTIONS`;
  - `Settings.tsx`: renders `<YourData>` after `<About>`;
  - `test/fixtures.ts`.
- Interfaces:
  - Consumes: `data_overview`, `data_export`, `data_import`, `data_show_folder`, `data_delete_all` and `backups-changed` (G5, G6).
  - Produces:
    - `useDataOverview(): { overview: DataOverview | null; error: boolean; refresh(): void }`, which listens to `backups-changed`;
    - `YourData({ overview, sessionRunning })`.
- Acceptance:
  - [ ] It shows the rows from the spec mock: Stored, Data folder with *Show in Finder*, Move data with *Export data…* and *Import data…*, and Start over with *Delete all data…*. All are `quiet` except *Delete all data…*, which is `ghost`. There is no `primary`.
  - [ ] Each status line from the spec appears in its row with `role="status"`, and the button keeps focus.
  - [ ] The Delete all data Dialog is `destructive`, with the spec's exact copy and `critical` on the confirm only. Escape cancels, and focus returns to the trigger.
  - [ ] With the store unavailable or newer, the counts line reads "Unavailable until Orasenda can open its data.". Export and Import are disabled; *Show in Finder* and *Delete all data…* are enabled.
  - [ ] The `data` navigation target focuses the section heading. The index lists About, then Your data, in order.
  - [ ] Layout: both themes, at 360 and 900 wide, no overflow, 44px targets; contrast through `just contrast`.
- Tests first: `your_data_rows_render_counts`, `export_saved_line`, `import_report_line_non_zero_parts`, `import_nothing_new_line`, `import_newer_line`, `busy_line`, `delete_all_dialog_copy_and_focus`, `unavailable_store_disables_move_data`, `data_navigation_target`.
- Notes:
  - sonnet, then opus code review and design review.
  - `Settings.tsx` is at 384 lines (more after F7). If G8 would take it past 450, first move the section render list into `SettingsSections.tsx` in a move-only commit, then add `<YourData>` there.

### G9: Settings › Backups  (#420)
- Priority: 1
- Depends on: G8, G7
- Owns: `apps/orasenda/src/features/settings/sections/{Backups.tsx,BackupList.tsx}`, `apps/orasenda/src/features/settings/backupFormat.ts` (dates and sizes through `Intl`), `apps/orasenda/src/features/settings/Settings.backups.test.tsx`, `verification/layout/settings.backups.spec.ts` (new).
- Touches: `SettingsHeader.tsx` (`SECTIONS` gains "Backups" last); `Settings.tsx` or `SettingsSections.tsx` (renders `<Backups>`); `test/fixtures.ts`.
- Interfaces:
  - Consumes: `useDataOverview` (G8); `backups_create`, `backups_delete`, `backups_restore`, `backups_set_policy` (G5); `NumberField` (G7).
  - Produces: `Backups({ overview, sessionRunning })`, `BackupList({ entries, disabled })`, `formatBackupTime(ms: number): string`, `formatBytes(n: number): string`.
- Acceptance:
  - [ ] *Back up* is two `Choice` radios (Every month, Every 3 months). *Keep* is a `NumberField` with range 1–50 and the field's error line.
  - [ ] *Last backup* reads "3 November 2026, 09:12" or "None yet", with *Back up now*.
  - [ ] The list shows the count and total size, then one row per backup: date, kind as a word (Automatic, Manual, Before import, Before restore), size, *Restore…* (`quiet`) and *Delete…* (`ghost`). A newer backup says "From a newer Orasenda" and its *Restore…* is disabled.
  - [ ] Empty list: "No backups yet. The first one is made automatically, or choose Back up now."
  - [ ] The Delete-backup Dialog is `destructive`, with `critical` on the confirm only. The Restore Dialog isn't destructive and uses `loading`. Its body changes to the unreadable-store copy when `store` isn't `ok`. All copy matches the spec.
  - [ ] With the store unavailable: the list, *Restore…* and *Delete…* are enabled; *Back up now* and the policy fields are disabled.
  - [ ] `backups-changed` refreshes the list while the page is open.
  - [ ] Layout: both themes, at 360 and 900 wide, with an empty list and a 12-item list. No overflow, 44px targets, and the list scrolls with the page, not inside its own box.
- Tests first: `backups_policy_radios_save`, `keep_range_error_line`, `last_backup_none_yet`, `backup_list_kind_words_and_sizes`, `newer_backup_restore_disabled`, `delete_backup_dialog_critical_confirm_only`, `restore_dialog_unreadable_copy`, `backups_changed_refreshes`, `unavailable_store_keeps_list_actions`.
- Notes: sonnet, then opus code review and design review. Split `BackupList.tsx` out of `Backups.tsx` from the start (each under 250 lines).

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: export opens at the same version with every row | G1, G6 |
| Goal 2: import adds; a second import is a no-op with no log rows | G2, G4 |
| Goal 3: a newer file is refused with the exact line | G4, G8 |
| Goal 4: older files import through the migrations | G4 |
| Goal 5: monthly or quarterly automatic backups at launch and focus | G3, G5 |
| Goal 6: at most N backups, every kind | G3 |
| Goal 7: Restore swaps, clears the live session, makes a safety backup | G3, G5, G9 |
| Goal 8: Delete all data starts fresh and keeps backups | G3, G5, G8 |
| Goal 9: Busy refusals | G4, G5, G6, G8 |
| Goal 10: themes, keyboard, hit targets | G8, G9 |
| Unrecognised backups dropped; newer ones listed | G3, G9 |
| Store unavailable: data and backups stay separate | G5, G8, G9 |
| Three sections and navigation targets | G8, G9 |
| Dialog plugin from Rust only | G6 |
| Failure mode: disk full during `VACUUM INTO` | G1: `snapshot_failure_leaves_no_partial` |
| Failure mode: the user picks the live `orasenda.db` to import | G4: `import_live_file_is_noop` |
| Failure mode: `Backups/` missing on the first backup | G3: `create_makes_backups_folder` |
| Failure mode: an automatic check and *Back up now* in the same second | G3: `names_round_trip_and_suffix` |
| Failure mode: the app killed between staging and restart | G3: `pending_restore_swaps_and_clears_active_session` (applied at the next launch) |
