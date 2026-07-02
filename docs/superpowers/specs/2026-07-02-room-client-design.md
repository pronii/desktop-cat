# Room Client MVP Design

## Goal

Add a usable "好友同屏" entry to the desktop cat client so a user can create or join a room and see friends' pet presence in the app.

## Approved Scope

- Add a "好友" button to the bottom toolbar.
- Open a compact "好友同屏" panel from the toolbar and tray menu.
- Let the user enter a six-digit room code and nickname, then join the room.
- Let the user create a six-digit room code locally and join it.
- Show connection state, current room code, and online friend count.
- Let the user leave the room.
- Connect from the Electron main process to `ws://45.136.28.241:3001/room`.
- Periodically publish the local pet window position and action state.
- Receive friend presence and show a list with recent pet state in the panel.
- Defer separate transparent friend pet windows to a later feature.

## Architecture

The WebSocket protocol lives in a main-process room client module. It exposes a small state-machine API that can be tested without Electron by injecting a WebSocket constructor. Electron IPC bridges the renderer panel to this module.

The renderer owns only DOM state and user interactions. It asks the preload API to join, create, leave, and subscribe to room state changes. The main process remains responsible for network connections, generated stable user identity, and pet window position reporting.

## Data Flow

1. User clicks "好友" or tray "好友同屏".
2. Renderer opens `roomPanel`.
3. Renderer calls `desktopCat.room.join(roomCode, nickname)` or generates a six-digit code then joins.
4. Main process opens WebSocket and sends `room:join`.
5. Server sends `room:joined`, `pet:join`, `pet:update`, and `pet:leave`.
6. Main process updates room state and emits `room:state-changed` to the renderer.
7. Renderer updates status and peer list.

## Error Handling

Connection errors update the visible status to disconnected or error. Leaving a room closes the socket, clears peer data, and keeps the panel usable for a new join. Invalid room codes are rejected before attempting a connection.

## Testing

`src/main/roomClient.js` is covered with Node's built-in test runner using a fake WebSocket. Tests cover join messages, received room state, peer updates, leave behavior, and guarding pet-state sends while disconnected.
