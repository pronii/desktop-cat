# Robustness Hardening Plan

> **Superpowers workflow:** implement as incremental hardening of the existing main process and clipboard-history storage, preserving all current user-visible behavior.

**Goal:** Eliminate four confirmed robustness gaps — missing single-instance lock, no display-change handling, blocking synchronous storage writes, and wasteful topmost polling — without introducing new dependencies or changing UX.

## Scope

- Add `app.requestSingleInstanceLock()` + `second-instance` handler in `src/main/main.js`.
- Add `screen` display-change listeners that recover an off-screen pet window.
- Convert `src/clipboard-history/storage.js` to debounced async writes + `flushSync()` on teardown.
- Add adaptive topmost polling interval in `src/main/main.js` to cut idle PowerShell spawns.
- Run syntax checks on all changed files.

## Implementation Steps

- [x] Write spec `2026-07-01-robustness-hardening-design.md`.
- [x] Write this plan.
- [x] **Single-instance lock:** in `src/main/main.js`, before `app.whenReady()`, call `app.requestSingleInstanceLock()`; on `false` return early / quit. Register `app.on('second-instance')` to reveal + focus existing pet window.
- [x] **Display-change handling:** add `setupDisplayChangeHandlers(window)` in `src/main/main.js` listening to `display-added`, `display-removed`, `display-metrics-changed`; recover window into a visible work area with 200ms throttle; wire it in `createPetWindow`; tear down on `closed`.
- [x] **Storage async debounce:** in `src/clipboard-history/storage.js`, replace `_save()` with `scheduleSave()` (300ms debounce + `fs.writeFile`); add `flushSync()`; keep `_load()` sync. Update callers (`add`, `removeById`, `clear`, `setItems`) to call `scheduleSave()`.
- [x] **Flush on exit:** in `src/clipboard-history/main.js` `teardownClipboardHistory()`, call `storage.flushSync()` before nulling storage.
- [x] **Adaptive topmost polling:** in `src/main/main.js`, track consecutive non-suspend probes; after N (6) calm probes widen interval to 1500ms; reset to 500ms on suspend detection or window show/focus. Implement via clearing/resetting `setInterval`.
- [x] **Syntax check:** run `node --check` on `src/main/main.js`, `src/clipboard-history/storage.js`, `src/clipboard-history/main.js`.
- [ ] Update README robustness notes if needed.
