//! The Developer panel window: label `dev`, created at runtime and only when the spike runs.
//! It loads `dev.html`, and `capabilities/dev.json` grants it the spike's panel commands.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// The window's label (granted by `capabilities/dev.json`).
pub(crate) const DEV: &str = "dev";

/// How the window looks, apart from its content.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DevWindowSpec {
    pub(crate) label: &'static str,
    pub(crate) title: &'static str,
    pub(crate) page: &'static str,
    pub(crate) width: f64,
    pub(crate) height: f64,
    pub(crate) resizable: bool,
}

/// The window to create, or `None` when the spike is off: then no window exists.
pub(crate) fn dev_window_spec(enabled: bool) -> Option<DevWindowSpec> {
    enabled.then_some(DevWindowSpec {
        label: DEV,
        title: "Developer panel",
        page: "dev.html",
        width: 480.0,
        height: 640.0,
        resizable: true,
    })
}

/// Opens the Developer panel, or focuses it when it is already open. Does nothing when
/// the spike is off.
pub(crate) fn open_dev_panel(app: &AppHandle) -> tauri::Result<()> {
    let Some(spec) = dev_window_spec(super::enabled()) else {
        return Ok(());
    };
    if let Some(window) = app.get_webview_window(spec.label) {
        window.show()?;
        window.unminimize()?;
        return window.set_focus();
    }
    let built = WebviewWindowBuilder::new(app, spec.label, WebviewUrl::App(spec.page.into()))
        .title(spec.title)
        .inner_size(spec.width, spec.height)
        .resizable(spec.resizable)
        .build();
    match built {
        Ok(_) => Ok(()),
        // A second click raced the first and the window now exists: focus it.
        Err(error) => match app.get_webview_window(spec.label) {
            Some(window) => window.set_focus(),
            None => Err(error),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_window_only_when_enabled() {
        assert_eq!(dev_window_spec(false), None);
        let spec = dev_window_spec(true).expect("a window when enabled");
        assert_eq!(
            (
                spec.label,
                spec.title,
                spec.page,
                spec.width,
                spec.height,
                spec.resizable
            ),
            ("dev", "Developer panel", "dev.html", 480.0, 640.0, true)
        );
    }
}
