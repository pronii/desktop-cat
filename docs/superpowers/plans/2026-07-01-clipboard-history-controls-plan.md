# Clipboard History Controls Plan

> **Superpowers workflow:** implement this as an incremental feature extension to the existing clipboard-history module, keeping the main process as the single source of truth for history data and recording state.

**Goal:** Add practical history controls: delete/clear history and a privacy pause switch that temporarily stops new clipboard records from being stored.

## Scope

- Add single-item delete to the standalone clipboard history window.
- Keep the existing clear-all action, but make it harder to trigger accidentally.
- Add pause/resume recording state in the main process.
- Expose pause state through both preload bridges.
- Add pause/delete/clear controls to the compact pet-window clipboard panel.
- Update README after implementation.

## Implementation Steps

- [x] Inspect current clipboard-history IPC, preload, renderer, and compact panel code.
- [x] Add main-process IPC handlers for `remove`, `get-state`, and `set-paused`.
- [x] Broadcast state changes to any open history UI.
- [x] Update standalone history window header with pause and clear controls.
- [x] Add delete buttons to history cards.
- [x] Update compact panel with pause, clear, and delete controls.
- [x] Run syntax checks and smoke-safe verification.
