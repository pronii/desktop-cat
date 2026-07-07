# Room Pet Sync Design

## Goal

Extract the room pet synchronization responsibilities from `src/main/main.js` into a focused main-process controller without changing room protocol behavior, peer window layout, or renderer APIs.

## Scope

In scope:
- Create `src/main/roomPetSync.js` to own room client setup, room state forwarding, periodic local pet state reporting, and peer pet window syncing.
- Keep `main.js` responsible for app wiring, dependency construction, and window actions such as opening the room panel.
- Preserve existing IPC contracts by continuing to route room IPC through `registerMainIpcHandlers`.
- Add module-level tests for the new controller.

Out of scope:
- Changing WebSocket room messages.
- Changing peer pet layout math.
- Changing renderer room panel UI.
- Changing license, online, tray, or update client behavior.

## Design

`createRoomPetSyncController(options)` will accept dependencies for Electron window creation, room client creation, peer window manager creation, local state building, and current app state accessors. The controller exposes:

- `setup()`: lazily creates the peer manager and room client, subscribes to room state changes, and starts the periodic pet state reporter.
- `getRoomClient()`: returns the current client after setup.
- `syncCurrentPeers()`: syncs connected peer windows beside the current local pet.
- `teardown()`: stops reporting, unsubscribes listeners, leaves the room, and destroys peer windows.

The controller will retain the existing behavior:
- Forward every room state to the renderer.
- Destroy peer windows when the room disconnects or the local pet window is unavailable.
- Send local pet state every second while setup is active.
- Re-sync peer windows after local cat scale changes.

## Testing

Add `tests/main/roomPetSync.test.js` covering:
- Setup wires room state changes to renderer and peer window sync.
- Reporting sends local pet state and keeps peers beside the local pet.
- Missing local window clears peer windows.
- Teardown stops timers, unsubscribes state listeners, leaves the room, and destroys peer windows.
