//! The native menu built from the entries.

use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Wry};

use super::{HEADER, MenuEntry};

/// Appends `entries` to `append`; `header` collects the header item for `set_text`.
fn append_entries(
    app: &AppHandle,
    entries: &[MenuEntry],
    header_text: Option<&str>,
    header: &mut Option<MenuItem<Wry>>,
    append: &mut dyn FnMut(&dyn IsMenuItem<Wry>) -> tauri::Result<()>,
) -> tauri::Result<()> {
    for entry in entries {
        match entry {
            MenuEntry::Item {
                id,
                label,
                accelerator,
                checked: None,
            } => append(&MenuItem::with_id(app, *id, label, true, *accelerator)?)?,
            MenuEntry::Item {
                id,
                label,
                accelerator,
                checked: Some(checked),
            } => append(&CheckMenuItem::with_id(
                app,
                *id,
                label,
                true,
                *checked,
                *accelerator,
            )?)?,
            MenuEntry::Header => {
                let item =
                    MenuItem::with_id(app, HEADER, header_text.unwrap_or(""), false, None::<&str>)?;
                append(&item)?;
                *header = Some(item);
            }
            MenuEntry::Separator => append(&PredefinedMenuItem::separator(app)?)?,
            MenuEntry::Submenu { label, entries } => {
                let submenu = Submenu::new(app, *label, true)?;
                append_entries(app, entries, header_text, header, &mut |child| {
                    submenu.append(child)
                })?;
                append(&submenu)?;
            }
        }
    }
    Ok(())
}

/// The native menu for `entries`, and its header item when there is one.
pub(in crate::tray) fn build_menu(
    app: &AppHandle,
    entries: &[MenuEntry],
    header_text: Option<&str>,
) -> tauri::Result<(Menu<Wry>, Option<MenuItem<Wry>>)> {
    let menu = Menu::new(app)?;
    let mut header = None;
    append_entries(app, entries, header_text, &mut header, &mut |child| {
        menu.append(child)
    })?;
    Ok((menu, header))
}
