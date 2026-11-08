# Orasenda: Common Issues

Known problems and their fixes, added as they come up.

- **`mockIPC` never removes event listeners (@tauri-apps/api 2.12.4).** With `shouldMockEvents: true`, the mock's `handleRemoveListener` reads `args.id` but `event.js` sends `eventId`, so an unlistened handler stays registered. Tests that assert unsubscription count listen/unlisten calls themselves (see `apps/orasenda/src/App.test.tsx`), and unmount before `clearMocks()`.
- **specta-typescript 0.0.13 exports `f64` as `number | null`.** For integers below 2^53 use `#[specta(type = specta_typescript::Number)]` (ADR-007).
