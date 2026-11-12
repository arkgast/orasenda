//! `native_menu_popup`: a native context menu at a point in the main window.
//!
//! On macOS `popup_menu_at` blocks the main thread until the menu closes, so the call runs
//! there and nothing waits on it with a lock held. The chosen id comes back through the
//! app's menu-event handler into [`PopupSlot`], a one-shot slot.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::on_blocking;

/// Item ids are namespaced, so the app menu's and the tray's handlers never mistake them.
pub(crate) const ID_PREFIX: &str = "popup:";

/// One entry of the menu.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NativeMenuItem {
    pub id: String,
    pub label: String,
    /// A Tauri accelerator such as `CmdOrCtrl+K`, shown beside the label.
    pub accelerator: Option<String>,
    /// `Some` makes a check item with that mark; `None` a plain item.
    pub checked: Option<bool>,
}

/// Where to show the menu, in the window's logical points, and what to show.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NativeMenuRequest {
    pub items: Vec<NativeMenuItem>,
    #[specta(type = specta_typescript::Number)]
    pub x: f64,
    #[specta(type = specta_typescript::Number)]
    pub y: f64,
}

/// The one-shot slot for the open popup: whether one is open, and what was chosen.
#[derive(Debug, Default)]
pub struct PopupSlot(Mutex<SlotState>);

#[derive(Debug, Default)]
struct SlotState {
    open: bool,
    /// Counts popups; item ids carry it so a late event of an earlier popup is dropped.
    generation: u64,
    chosen: Option<String>,
}

impl PopupSlot {
    fn state(&self) -> std::sync::MutexGuard<'_, SlotState> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Marks a popup open and answers its generation; `None` when one already is.
    pub(crate) fn begin(&self) -> Option<u64> {
        let mut state = self.state();
        if state.open {
            return None;
        }
        state.open = true;
        state.generation += 1;
        state.chosen = None;
        Some(state.generation)
    }

    /// Records a menu event's id when it is a popup item and a popup is open. Returns
    /// whether the event was the popup's, so the caller can skip other handlers.
    pub(crate) fn record(&self, event_id: &str) -> bool {
        let Some(rest) = event_id.strip_prefix(ID_PREFIX) else {
            return false;
        };
        let mut state = self.state();
        let parsed = rest
            .split_once(':')
            .and_then(|(generation, id)| Some((generation.parse::<u64>().ok()?, id)));
        if let Some((generation, id)) = parsed
            && state.open
            && generation == state.generation
        {
            state.chosen = Some(id.to_owned());
        }
        true
    }

    /// Closes the popup and answers the chosen id, `None` when it was dismissed.
    pub(crate) fn end(&self) -> Option<String> {
        let mut state = self.state();
        state.open = false;
        state.chosen.take()
    }
}

/// What one menu entry is built from, apart from Tauri types, so the mapping is testable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ItemSpec {
    pub id: String,
    pub label: String,
    pub accelerator: Option<String>,
    pub checked: Option<bool>,
}

pub(crate) fn item_specs(items: &[NativeMenuItem], generation: u64) -> Vec<ItemSpec> {
    items
        .iter()
        .map(|item| ItemSpec {
            id: format!("{ID_PREFIX}{generation}:{}", item.id),
            label: item.label.clone(),
            accelerator: item.accelerator.clone().filter(|a| !a.is_empty()),
            checked: item.checked,
        })
        .collect()
}

/// Shows the menu and answers the chosen item's id; `None` when dismissed, when a menu is
/// already open, or when it could not be shown (logged).
#[tauri::command]
#[specta::specta]
pub async fn native_menu_popup(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: NativeMenuRequest,
) -> Option<String> {
    #[cfg(desktop)]
    {
        popup(app, window.label().to_owned(), request).await
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, window, request);
        None
    }
}

/// The window a popup opens in: the one that asked.
pub(crate) fn popup_label(caller: &str) -> &str {
    caller
}

#[cfg(desktop)]
async fn popup(
    app: tauri::AppHandle,
    caller: String,
    request: NativeMenuRequest,
) -> Option<String> {
    use tauri::Manager;

    let slot = app.state::<PopupSlot>();
    let generation = slot.begin()?;
    let (done, finished) = std::sync::mpsc::channel::<()>();
    let shown = app.clone();
    let queued = app.run_on_main_thread(move || {
        if let Err(error) = show(&shown, popup_label(&caller), &request, generation) {
            eprintln!("native_menu_popup: {error}");
        }
        let _ = done.send(());
    });
    if let Err(error) = queued {
        eprintln!("native_menu_popup: the main thread is gone: {error}");
        return app.state::<PopupSlot>().end();
    }
    // No lock is held here: wait for the menu to close, then for one more turn of the main
    // thread, so a menu event queued behind the popup has been handled before the read.
    on_blocking(move || finished.recv().ok()).await;
    settle(&app).await;
    app.state::<PopupSlot>().end()
}

#[cfg(desktop)]
async fn settle(app: &tauri::AppHandle) {
    let (done, finished) = std::sync::mpsc::channel::<()>();
    if app
        .run_on_main_thread(move || {
            let _ = done.send(());
        })
        .is_ok()
    {
        on_blocking(move || finished.recv().ok()).await;
    }
}

#[cfg(desktop)]
fn show(
    app: &tauri::AppHandle,
    label: &str,
    request: &NativeMenuRequest,
    generation: u64,
) -> tauri::Result<()> {
    use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem};
    use tauri::{LogicalPosition, Manager};

    let window = app
        .get_webview_window(label)
        .ok_or(tauri::Error::WindowNotFound)?;
    let menu = Menu::new(app)?;
    for spec in item_specs(&request.items, generation) {
        let accelerator = spec.accelerator.as_deref();
        let item: Box<dyn IsMenuItem<tauri::Wry>> = match spec.checked {
            Some(checked) => Box::new(CheckMenuItem::with_id(
                app,
                spec.id,
                spec.label,
                true,
                checked,
                accelerator,
            )?),
            None => Box::new(MenuItem::with_id(
                app,
                spec.id,
                spec.label,
                true,
                accelerator,
            )?),
        };
        menu.append(item.as_ref())?;
    }
    window.popup_menu_at(&menu, LogicalPosition::new(request.x, request.y))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, accelerator: Option<&str>, checked: Option<bool>) -> NativeMenuItem {
        NativeMenuItem {
            id: id.into(),
            label: id.to_uppercase(),
            accelerator: accelerator.map(Into::into),
            checked,
        }
    }

    #[test]
    fn menu_popup_targets_calling_window() {
        for label in ["main", "floater", "focus-1"] {
            assert_eq!(popup_label(label), label);
        }
    }

    #[test]
    fn menu_popup_items_carry_accelerator_and_check() {
        let specs = item_specs(
            &[
                item("a", Some("CmdOrCtrl+K"), Some(true)),
                item("b", None, None),
                item("c", Some(""), Some(false)),
            ],
            7,
        );
        assert_eq!(specs.len(), 3);
        assert_eq!(specs[0].id, "popup:7:a");
        assert_eq!(specs[0].label, "A");
        assert_eq!(specs[0].accelerator.as_deref(), Some("CmdOrCtrl+K"));
        assert_eq!(specs[0].checked, Some(true));
        assert_eq!(specs[1].accelerator, None);
        assert_eq!(specs[1].checked, None);
        assert_eq!(specs[2].accelerator, None);
        assert_eq!(specs[2].checked, Some(false));
    }

    #[test]
    fn menu_popup_second_call_while_open_is_none() {
        let slot = PopupSlot::default();
        let first = slot.begin().expect("opens");
        assert_eq!(slot.begin(), None, "a second popup must not open");
        assert!(slot.record(&format!("popup:{first}:a")));
        assert_eq!(slot.end().as_deref(), Some("a"));
        assert!(slot.begin().is_some(), "closed, so a new one may open");
        assert_eq!(slot.end(), None, "dismissed answers None");
    }

    #[test]
    fn menu_popup_ignores_foreign_ids_and_late_events() {
        let slot = PopupSlot::default();
        assert!(!slot.record("settings"));
        assert!(slot.record("popup:1:late"));
        assert_eq!(slot.end(), None, "nothing open: nothing recorded");
        let old = slot.begin().expect("opens");
        slot.end();
        let _new = slot.begin().expect("opens");
        assert!(slot.record(&format!("popup:{old}:stale")));
        assert_eq!(slot.end(), None, "a stale generation is dropped");
    }
}
