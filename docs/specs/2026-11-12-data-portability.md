# Data portability (P1 sub-project G) — Spec

- Status: approved (owner, 2026-11-12)
- Date: 2026-11-12
- Owner: Arnold Gandarillas Castillo
- Related:
  - [ROADMAP row G](../ROADMAP.md#p1-sub-projects) (`docs/ROADMAP.md:51`); ADR-002 (export line), ADR-012 (store pattern), ADR-014 (settings); proposes ADR-018 (this spec).
  - [Spec B](2026-11-09-settings.md) (About and data, `:59-61,192`); [spec F](2026-11-12-hotkeys-and-capture.md) (`inbox_note`, Settings › Keyboard).
  - Components: `SettingsRow`, `Button`, `Choice`, `Dialog`, `SettingsIndex`.

## TL;DR
- **One format: a SQLite copy of `orasenda.db`** made with `VACUUM INTO` (owner, 2026-11-12: "the most efficient and fastest option"). Export and every backup are such a copy. ADR-018 replaces ADR-002's "versioned JSON bundle" line.
- **Import merges by id** (owner): rows only in the file are added; when both sides have a row, the later `updated_at` wins and a tombstone counts as a change. An older file is upgraded by the existing migrations in a temporary copy; a newer one is refused.
- **Backups** run automatically every month or every 3 months (a setting, default monthly), on demand with *Back up now*, and before every Import and Restore. The newest **N** are kept, every kind counted (a setting, default 12; owner). A list shows each backup's date and size with *Restore…* and *Delete…*.
- **Delete all data** deletes the data only, never backups (owner: "separate concerns"). It is the one data-wide critical confirm, in a destructive `Dialog`.
- **Settings gets three sections** (owner): **About**, **Your data** and **Backups**. File panels come from `tauri-plugin-dialog` 2.8.4, called only from Rust (owner). No migration.

## Change in a nutshell
Settings, scrolled to the end:

```
 About
   Orasenda 0.1.0 for macOS
   Your data stays on this Mac. Orasenda doesn't use the network.
   Orasenda is free software under the Mozilla Public License 2.0.

 Your data
   Stored      214 sessions · 5 presets · 12 notes
   Data folder ~/Library/Application Support/com.veloud.orasenda   [Show in Finder]
   Move data   [Export data…]  [Import data…]
               Added 12 sessions and 3 notes.
   Start over  [Delete all data…]

 Backups
   Back up     (•) Every month   ( ) Every 3 months
   Keep        [ 12 ] newest backups
   Last backup 3 November 2026, 09:12                 [Back up now]
   Backups     12 backups · 4.1 MB
               3 November 2026, 09:12   Automatic  320 KB  [Restore…] [Delete…]
               28 October 2026, 18:40   Before import 301 KB [Restore…] [Delete…]
               …
```

*Export data…* opens a Save panel named "Orasenda data 2026-11-12.db". *Import data…* opens an Open panel for `.db` files, takes a backup, merges and says what it added. *Restore…* takes a backup of the current data, swaps the chosen file in and restarts Orasenda.

In general, every file G writes is a whole-database SQLite copy. The live store is never closed while the app runs: anything that replaces the file (Restore, Delete all data) leaves a marker and restarts, and the swap happens at the next launch before the store opens.

## Problem
Everything Orasenda stores sits in one file, `<app data dir>/orasenda.db` (`crates/service/src/session/run.rs:19,31-35`), and nothing on main can copy it, move it to another Mac, roll it back or clear it. A bad import, a corrupted disk or a wish to start over each needs Finder and Terminal today. Settings › About promises the data rows "in G" (`docs/specs/2026-11-09-settings.md:59,192`; `apps/orasenda/src/features/settings/sections/About.tsx:15-34` has only the version, privacy and licence lines).

## Goals / Success criteria
1. *Export data…* writes a file that `Store::open` opens at the same `user_version` and that holds every row of the live database.
2. *Import data…* of an export from another Mac adds the rows that Mac had and this one didn't. Importing the same file twice changes nothing the second time and logs no `change_log` rows.
3. Import of a file with a newer `user_version` changes nothing and says "This file was saved by a newer Orasenda. Update Orasenda to import it."
4. Import of an older file (any `user_version` from 1 to 5) works through the existing migrations.
5. With frequency *Every month*, an automatic backup is written at launch or main-window focus once 30 days have passed since the newest automatic backup (91 days for *Every 3 months*); never twice in one check.
6. After any backup, at most N backup files remain; the oldest go first, whatever their kind.
7. *Restore…* leaves the live database equal to the chosen backup (then migrated if older), with no live session, after a restart. A backup of the replaced data exists.
8. *Delete all data* leaves a fresh database (new `device_id`, the three default presets, default settings) after a restart, and every backup file still in place.
9. Import, Restore and Delete all data are refused while a session runs, with "End the session first." and nothing changed.
10. Both themes, keyboard only and the hit targets of the design-system README work for every control added.

## Non-goals
- Export to CSV or JSON, and per-entity export (usage data's CSV export comes with P5, `docs/SPEC.md:136`).
- Replace-on-import, and choosing what to import.
- Backups to another folder, iCloud or a server. Encrypted backups.
- Templates (`docs/SPEC.md:203`).
- Sending the app menu's *About Orasenda* to Settings (spec B, `:61`): it stays the native panel.
- Windows: the dialog plugin covers it; *Show in Finder* gets a Windows twin in the Windows phase.

## Users & permissions
One local user. No roles. The `main` window's capability gains the G commands. No webview gets the dialog plugin's permissions: only Rust calls it.

| Role | Can | Cannot |
|---|---|---|
| The Mac's user | Export, import, back up, restore, delete backups, delete all data | Import or restore while a session runs; import or restore a file from a newer Orasenda |

## Tenancy & localization
One device, one user. Dates in the Backups list and *Last backup* are shown in the Mac's local time zone with `Intl.DateTimeFormat` ("3 November 2026, 09:12"); file names use UTC so they sort and never collide on a DST change. Sizes use `Intl.NumberFormat` with KB and MB (1 KB = 1000 bytes, as Finder shows). English only, as the rest of P1.

## Domain model
- **Data file:** a SQLite database with `user_version` between 1 and `SCHEMA_VERSION` (5, `crates/store/src/lib.rs:37`) and a `meta.device_id`. A file with `user_version` 0 or no `meta` table is "not Orasenda data".
- **Syncable rows** (what import merges): `setting` (by `key`), `preset`, `focus_session` and `inbox_note` (by `id`). `Entity` already names them (`crates/store/src/txn.rs:9-14`).
- **Left out of import:** `meta`, `active_session`, `window_frame` and `change_log`. They stay in exported and backup files (a whole copy), and import ignores them.
- **Backup:** a file in `<app data dir>/Backups/` named `orasenda-<YYYYMMDD>T<HHMMSS>Z-<kind>.db`, where kind is `auto`, `manual`, `before-import` or `before-restore`. Its time and kind come from the name; its size from the file. Files that don't match the pattern are ignored (never listed, never pruned). Two backups in the same second get `-2`, `-3` before `.db`.
- **Unrecognised backup** (owner, 2026-11-12: "if a backup is not recognizable we can drop it"): a backup-named file that `probe` can't read or that isn't Orasenda data is deleted when the folder is listed, and never shown. A backup from a newer Orasenda is recognised: it is listed with "From a newer Orasenda", *Restore…* disabled and *Delete…* available.
- **Backup policy** (device-only `meta`, no migration, like F's flags):
  - `backup.frequency`: `"monthly"` (default) or `"quarterly"`; 30 or 91 days.
  - `backup.keep`: a whole number 1–50 as text, default `"12"`.
  - An unreadable value reads as its default. Because they live in `orasenda.db`, Delete all data resets them and Restore brings back the backup's values (FAQ).
- **Pending swap** (files in the app data dir, read once at launch):
  - `orasenda.restore.db`: a backup copied in by Restore.
  - `orasenda.delete`: an empty marker left by Delete all data.

## Interfaces
**Store (`crates/store`).** New module `portability/` (keeps `db.rs`, 205 lines, small):
- `Store::snapshot_to(&self, dest: &Path) -> Result<(), StoreError>`: under the store lock and outside any transaction, `VACUUM INTO '<dest>.partial'`, then rename to `dest` (replacing it). A failure removes the partial file.
- `probe(path) -> Result<Probe, ProbeError>` opens read-only (`SQLITE_OPEN_READ_ONLY`) and returns `Probe { user_version, has_meta }`. `ProbeError::NotSqlite` for a file SQLite can't read.
- `export::rows(txn) -> SyncRows` reads every row of the four syncable tables, tombstones included. `SyncRows` holds plain structs (no rusqlite types cross the boundary, `code-structure`).
- `merge::apply(txn, &SyncRows) -> MergeCounts` applies the rules under [Behavior](#behavior--edge-cases) and logs `change_log` for each written field through `Txn::log_fields` (`crates/store/src/txn.rs:68`). `MergeCounts { added: Counts, updated: Counts }`, with `Counts { sessions, presets, notes, settings }`.
- `stats::counts(txn) -> Counts` counts live rows (no tombstones).

**Service (`crates/service/src/data/`).** No tauri. Each function takes the data dir and the clock:
- `backups.rs`: `BackupPolicy`, `BackupKind`, `BackupEntry { file, kind, created_ms, bytes, newer }`, `list(dir)` (probes each file and drops unrecognised ones), `create(store, dir, kind, now_ms)` (snapshot, then prune to `keep`), `delete(dir, file)` (only a listed name; no path separators), `due(entries, policy, now_ms)`.
- `import.rs`: `import(store, dir, source, now_ms) -> Result<ImportReport, DataError>`. Probes `source`; copies it to `<dir>/import-<uuid>.db`; opens the copy with `Store::open` (migrations run on the copy only); reads `export::rows`; takes a `before-import` backup (always, even when the merge turns out to add nothing: the backup must exist before the write); runs `merge::apply` in one write on the live store; enforces the preset cap; removes the copy (also on error).
- `pending.rs`: `apply_pending(dir) -> PendingOutcome` runs inside `open_store_at` (`run.rs:31-35`) before `Store::open`. `orasenda.delete` wins over a restore file. Each removes `orasenda.db`, `-wal` and `-shm`; a restore then renames `orasenda.restore.db` to `orasenda.db`. After a restore, the service clears `active_session` before recovery runs.
- `DataError` kinds: `Busy` (session running), `Newer`, `NotOrasenda`, `Unreadable`, `Write`, `Unavailable` (the live store isn't open).

**Tauri commands (`apps/orasenda/src-tauri/src/commands/data.rs`), all `async`, never on the main thread:**

| Command | Returns | Notes |
|---|---|---|
| `data_overview()` | `DataOverview { counts, folder, backups: Vec<BackupEntry>, policy, totalBytes }` | Counts are `null` when the store is unavailable. |
| `data_export()` | `ExportOutcome = saved \| cancelled` | Save panel, default name `Orasenda data <YYYY-MM-DD>.db`, filter `.db`. |
| `data_import()` | `ImportOutcome = imported(ImportReport) \| cancelled` | Refuses `Busy` before opening the panel. |
| `data_show_folder()` | `()` | NSWorkspace `activateFileViewerSelectingURLs` on `orasenda.db` (`crates/platform-macos`, NSWorkspace already enabled). |
| `data_delete_all()` | `()` or `DataError` | Writes `orasenda.delete`, then `AppHandle::restart()` (`tauri-2.12.5/src/app.rs:606`). |
| `backups_create()` | `BackupEntry` | Kind `manual`. |
| `backups_delete(file)` | `()` | |
| `backups_restore(file)` | `()` or `DataError` | Probe (refuse `Newer`) → copy to `orasenda.restore.db.partial` → rename → `before-restore` backup (skipped when the store isn't open) → restart. Needs no open store. |
| `backups_set_policy(policy)` | `BackupPolicy` | Writes both `meta` keys in one write; prunes at once when `keep` drops. |

The automatic check runs on a background thread after `setup` opens the store (`apps/orasenda/src-tauri/src/runtime/session.rs:29-45`) and on the main window's `Focused(true)` (`lifecycle.rs:57`). It lists the folder, and creates an `auto` backup when `due`. A check already running makes the next one return at once. Each change to the list emits `backups-changed`, so an open Settings page refreshes.

**Plugin.** `tauri-plugin-dialog` 2.8.4 (added through baton:deps in its task), registered in `lib.rs` with `.plugin(tauri_plugin_dialog::init())`, used as `app.dialog().file()…save_file(cb)` and `pick_file(cb)` with the answer sent through a `tauri::async_runtime::channel(1)`, the pattern `notifications_request` uses (spec B, `:166`). No npm package, and no `dialog:*` permission in any capability file.

**Webview (`apps/orasenda/src/features/settings/`).**
- `SectionId` gains `data` and `backups`; `about` keeps its id and its heading becomes "About" (`SettingsHeader.tsx:6,12-18`). The index lists About, Your data, Backups last, after F7's Keyboard. Each is a navigation target.
- `sections/About.tsx` keeps the three lines; the privacy line becomes "Your data stays on this Mac. Orasenda doesn't use the network."
- New `sections/YourData.tsx`, `sections/Backups.tsx`, `sections/BackupList.tsx` and `useDataOverview.ts`. The whole-number field moves out of `CadenceRows.tsx:32` into `NumberField.tsx` unchanged (a move-only commit) and *Keep* reuses it.
- Buttons are `quiet`, except *Delete…* in the list and *Delete all data…*, which are `ghost`. `critical` appears only on the confirm of the two delete Dialogs (`button.md:3,8`). There is no `primary` in Settings.

## Behavior & edge cases
**Merge rules** (one write transaction; any error rolls back the whole import):

| Table | Row only in file | Row on both sides |
|---|---|---|
| `setting` | insert | the file's value wins when its `updated_at` is later |
| `preset` | insert | the file's row wins whole when its `updated_at` is later |
| `focus_session` | insert | the file's row wins whole when its `updated_at` is later |
| `inbox_note` | insert | no `updated_at` (`0005_inbox_note.sql`): a `deleted_at` on either side wins; nothing else changes |

- An equal `updated_at` keeps the local row. A written row logs every field, as a normal write does; an unchanged row logs nothing (goal 2).
- **Preset cap:** after the merge, if more than 12 live presets (`MAX_PRESETS`, `crates/service/src/session/presets/edit.rs:16`) remain, the newest 12 by `updated_at` stay and the rest are tombstoned and logged. The selected preset (`timer.preset`) is always kept. Default presets share fixed ids, so they never duplicate.
- After an import, the service re-reads settings and presets, applies the theme, and emits `settings-changed` and `presets-changed`, as a save does.

**Status lines** (in the row, `role="status"`; the button keeps focus):

| Event | Line |
|---|---|
| Export saved | "Saved Orasenda data 2026-11-12.db." |
| Import added rows | "Added 12 sessions, 1 preset and 3 notes." (only non-zero parts; "updated" parts follow: "Updated 2 settings.") |
| Import found nothing new | "Nothing new in this file." |
| `Newer` | "This file was saved by a newer Orasenda. Update Orasenda to import it." (restore: "This backup was saved by a newer Orasenda.") |
| `NotOrasenda` / `Unreadable` | "This file isn't Orasenda data." / "Orasenda couldn't read this file." |
| `Busy` | "End the session first." |
| `Write` | "Orasenda couldn't write the file. Check there is space and try again." |
| Backup made | "Backed up." |
| Cancelled panel | nothing |

**Dialogs** (one at a time; Escape cancels; the trigger gets focus back, `dialog.md`):
- Delete all data, `destructive`: title "Delete all your Orasenda data?"; body "Your sessions, presets, notes and settings on this Mac are removed and Orasenda restarts fresh. Backups are not touched. To keep a copy, choose Back up now first."; confirm "Delete all data".
- Delete a backup, `destructive`: "Delete the backup from 3 November 2026, 09:12?"; "The file is removed from this Mac. Your current data is not touched."; "Delete backup".
- Restore, not destructive (a backup of the current data comes first): "Restore the backup from 3 November 2026, 09:12?"; "Orasenda backs up your current data, replaces it with this backup and restarts."; "Restore and restart". `loading` while it works.

**Other cases:**
- **No backups yet:** *Last backup* reads "None yet" and the list reads "No backups yet. The first one is made automatically, or choose Back up now."
- **Store unavailable or newer** (`StoreStatus`, `crates/service/src/api/timer.rs:26-30`). Data and backups are separate (owner, 2026-11-12), so each section keeps what works without the store:
  - *Your data:* the counts line reads "Unavailable until Orasenda can open its data."; *Show in Finder* and *Delete all data…* work (the delete marker needs no store); Export and Import are disabled.
  - *Backups:* the list, *Restore…* and *Delete…* work (they act on files, and Restore at the next launch). *Back up now*, the automatic check and the policy fields are disabled, because they need the store. The Restore Dialog's body reads instead "Orasenda can't open your current data, so it can't back it up first. This backup replaces it and Orasenda restarts."
- **Session running:** Export and backups work (`VACUUM INTO` copies a consistent state under the lock). Import, Restore and Delete all data refuse with `Busy` and never open a panel or Dialog.
- **Exported file chosen as its own destination's neighbour, or overwriting:** the Save panel asks to replace; the `.partial` rename replaces atomically.
- **Restart fails or the app is killed after the marker:** the next launch applies it. A crash between `.partial` and the rename leaves only `.partial` files, which launch deletes.
- **Pruning with N = 1 during Restore:** the chosen file is copied to `orasenda.restore.db` before the `before-restore` backup prunes it, so the restore still has its data.
- **The welcome line and tips** (F's device-only `meta` flags) show again after Delete all data; after Restore they follow the backup.
- **Reduce motion:** nothing in G animates.

## Data & migrations
No migration and no new table: `SCHEMA_VERSION` stays 5. The two policy keys are device-only `meta` rows. If plan review finds a migration is needed, it takes **0006**, after F2's 0005. ADR-018 records that export files and backups are whole SQLite copies, upgraded on open by the existing migrations.

## Testing strategy
- **Store** (temp dirs, as `setup_creates_app_data_dir` does in `crates/service/src/session/tests/run.rs:318`): snapshot round-trip equals source rows; `probe` on a v1 file, a v5 file, a `user_version` 99 file, an empty SQLite file and a text file; merge per table and rule (insert, later wins, earlier loses, tie keeps local, tombstone wins for notes, idempotence with zero log rows); `counts` skips tombstones.
- **Service:** `list` drops a text file and an empty SQLite file named as backups, keeps and marks a newer one; same-second names get a suffix; Restore and Delete all data work with an unavailable store, and Restore then takes no safety backup; `due` boundaries (29/30 days, 90/91 days, no automatic backup yet, only manual backups present); prune across kinds keeps the newest N; `delete` refuses names with `/` or `..` or not listed; `import` from a v1 fixture built by running `0001_init.sql` only; `Newer` and `NotOrasenda` leave the live store and the backup folder unchanged; preset cap keeps the selected preset; `Busy` while a session runs; `apply_pending` for delete, restore, both, and leftover `.partial` files; a restore clears `active_session`.
- **App crate:** manifest and capability tests list the new commands and no `dialog:` permission; `export_bindings` names the commands; the dialog is behind a `FilePicker` trait so tests run without a panel; restart behind `Host`.
- **Webview:** the three sections render from a fake overview; each status line; the two delete Dialogs use `critical` only on confirm and return focus; the Restore Dialog; *Keep* range 1–50 with the field's error line; the index and navigation targets for `data` and `backups`; disabled states for unavailable or newer stores.
- **WebKit layout and contrast:** the Settings specimen covers both themes, compact width, an empty list and a 12-item list.
- **Owner checks (hands-on, both themes):** export on one Mac and import on another; Restore and Delete all data restart cleanly; Finder opens the folder.

## Decisions
- **ADR-018 (proposed): Data portability in SQLite files.** Relies on ADR-002 and ADR-012 (syncable versus device-only, tombstones) and ADR-014 (settings re-applied after import).
- **CONTEXT.md:** *Data file*, *Backup*, *Safety backup*, *Merge import*, *Pending swap*.

## FAQ
### Why SQLite files and not the JSON bundle ADR-002 named?
The owner chose speed and the least code: one `VACUUM INTO` serves export and backups, older files reuse the existing migrations, and nobody is expected to read the files (owner, 2026-11-12). A readable format can come later from the same `export::rows` if a user asks.

### Why merge on import and not replace?
Merging never loses data and makes a second import a no-op. Replacing is what Restore does, from a backup on this Mac.

### Why do the backup settings live in the database?
ADR-012 keeps the store the single durable medium, with no sidecar files. The cost: Delete all data resets them, and Restore brings back the backup's values. A sidecar file would avoid that, at the price of a second storage path.

### Why 30 and 91 days rather than calendar months?
Elapsed days need no local calendar in Rust and give the same result within a day or two. "Every month" stays the label.

### Why restart instead of closing the store?
The service, scheduler, tray and windows all hold the store through the service. Swapping the file at launch, before anything opens it, has one code path and is safe across crashes.

### Why may a Restore or an Import prune old backups?
The owner chose one limit for every kind of backup. The safety backup is always the newest, so it is never the one pruned.

## Open questions
None.

## Implementation status
Updated by the PRs that implement this spec.
- [ ] Plan and backlog (Phase 2 of this PR).
- G's Settings task waits for F7 (#393, Settings › Keyboard), which also edits `SettingsHeader.tsx`.
