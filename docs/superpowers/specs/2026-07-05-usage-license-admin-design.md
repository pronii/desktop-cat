# Usage, Device License, and Admin Dashboard Design

## Goal

Add a server-side admin view that shows current software usage, client IPs, and client device identifiers. Add a paid-feature foundation based on device license codes, where a license code is activated once and then bound to a local client device.

## Approved Scope

- Add a simple browser-based admin page.
- Protect admin pages and admin JSON endpoints with `DESKTOP_CAT_ADMIN_TOKEN`.
- Track current online WebSocket connections in memory.
- Let the Electron client generate and persist a stable `deviceId`.
- Let the client report `deviceId`, app version, platform, and a device label when joining the room server.
- Store license codes, device bindings, activation records, and check records in SQLite.
- Provide a server-side script to create license codes and print the plaintext codes once.
- Bind one license code to one device for the first version.
- Cache successful license checks locally for seven days.
- Show online usage and license state together in the admin page.
- Keep payment provider integration, account login, and multi-device license plans out of the first version.

## Competitor Pattern Summary

Realtime products generally treat this as a presence and occupancy problem, not page-view analytics.

Socket.IO Admin UI tracks currently connected clients, socket details, rooms, and events. It registers connection and disconnect listeners, then periodically sends server stats to the UI.

Ably and Pusher presence systems distinguish between connections, members, and unique client identifiers. A single user can have more than one active connection, so the server should count both raw connections and deduplicated devices.

The design follows that pattern:

- Raw WebSocket connections are counted as online connections.
- `deviceId` values are counted as online devices.
- Room membership remains separate from global usage.
- License state is joined from persistent storage when rendering admin data.

## Architecture

The room server keeps current connection telemetry in memory because it represents only live state. A new usage tracker records each WebSocket connection with a server-generated connection id, IP address, user agent, path, connected time, last seen time, room code, user id, nickname, and client-reported device metadata.

A SQLite-backed license store persists paid access state. It owns schema creation, license lookup, activation, check logging, device binding, revocation checks, and expiry checks. The room server calls into this store for license activation and check HTTP routes, and for enriching admin dashboard data with license status.

The Electron main process owns device identity. On first run it creates a random UUID and saves it in the app user data area. On later runs it reuses the same value. The room client includes device metadata in the existing `room:join` message, and a small license client calls activation and check endpoints when paid features need authorization.

## Server Components

### Usage Tracker

Responsibilities:

- Register WebSocket connections when `/room` or `/updates/stream` upgrades are accepted.
- Capture IP from the socket remote address. Trusted proxy support for `x-forwarded-for` is outside the first version.
- Capture user agent from the upgrade request.
- Update connection metadata when a room client sends `room:join`.
- Update `lastSeenAt` on valid client messages.
- Remove connections on socket close or error.
- Produce a snapshot with connection count, unique device count, authorized online device count, unauthorized online device count, and connection rows.

The tracker is in memory only. A server restart clears online state.

### License Store

SQLite stores durable authorization data. The first implementation uses one database file configured by `DESKTOP_CAT_LICENSE_DB_PATH`, defaulting to `data/desktop-cat.sqlite` under the server working directory.

Tables:

```text
licenses
- id
- code_hash
- code_prefix
- status
- max_devices
- expires_at
- created_at
- updated_at

license_devices
- id
- license_id
- device_id
- device_label
- platform
- app_version
- first_ip
- last_ip
- activated_at
- last_seen_at

license_checks
- id
- license_id
- device_id
- result
- ip
- checked_at
```

License code plaintext is not stored. The server stores a SHA-256 hash of a normalized code.
The `code_prefix` stores only a short display prefix so the admin page can identify a license without exposing the full code.

Statuses:

- `active`: license can be used.
- `revoked`: license was manually disabled.
- `expired`: license is no longer valid after `expires_at`.

The first version uses `max_devices = 1`.

### License Code Issuing

A server-side script creates license codes. It opens the same SQLite database as the room server, inserts `licenses` rows with hashed codes, and prints the plaintext codes once for the operator to send to paying users.

The script supports:

- Creating one or more active codes.
- Optional expiry date.
- Optional max device count, defaulting to one.

The first version does not create license codes from the browser admin page.

### HTTP Routes

Public license routes:

- `POST /license/activate`
- `POST /license/check`

Admin routes:

- `GET /admin`
- `GET /admin/usage.json`
- `GET /admin/licenses.json`

Admin routes require `DESKTOP_CAT_ADMIN_TOKEN`. The token can be supplied with `Authorization: Bearer <token>` for JSON routes. For the HTML page, the first version can accept `?token=<token>` and then use it for page refresh requests. If the admin token is not configured, admin routes return `403`.

## Client Components

### Device Identity

The Electron main process adds a device identity helper:

- Reads a saved `deviceId` from app user data.
- Generates a UUID if none exists.
- Saves the generated id.
- Provides `deviceId`, platform, app version, and a conservative device label to the room and license clients.

The device label should avoid collecting hardware serials or MAC addresses. A hostname or user-editable label is enough for admin recognition.

### Room Join Metadata

The existing `room:join` payload is extended:

```json
{
  "type": "room:join",
  "roomCode": "123456",
  "userId": "alice",
  "nickname": "Alice",
  "deviceId": "uuid",
  "deviceLabel": "Windows PC",
  "appVersion": "0.3.8",
  "platform": "win32"
}
```

The server validates these fields with conservative length limits and ignores unknown fields.

### License Activation And Check

The client exposes two internal actions:

- Activate a license code by sending `licenseKey + deviceId + metadata`.
- Check current authorization by sending `licenseKey + deviceId`.

The client stores:

- `licenseKey` entered by the user.
- Last check result.
- Last successful check time.
- Cache expiry time, seven days after a successful check.

Paid features consult the local cache first. If the cache is absent or expired, they require an online license check. If the server returns revoked, expired, or bound-to-other-device, the client clears the usable paid state and shows a clear message.

## Data Flow

### Online Usage

1. Client connects to `/room`.
2. Server creates an in-memory connection record with IP, user agent, connected time, and path.
3. Client sends `room:join` with device metadata.
4. Server validates room data and updates the connection record with room code, user id, nickname, device id, app version, platform, and device label.
5. Admin page requests `/admin/usage.json`.
6. Server returns live usage rows enriched with license status from SQLite when a device id is known.
7. Socket close or error removes the live connection record.

### License Activation

1. User enters a license code in the client.
2. Client sends `POST /license/activate` with license code and device metadata.
3. Server normalizes and hashes the code.
4. Server finds the license row.
5. If the license is active and unbound, server binds it to the device id.
6. If the same device is already bound, server returns success.
7. If another device is already bound and `max_devices` is reached, server returns a bound-device error.
8. Client stores successful activation and a seven-day local cache.

### License Check

1. Client sends `POST /license/check` with license code and device id.
2. Server validates license status, expiry, and device binding.
3. Server writes a `license_checks` row with result and IP.
4. Client updates or clears its local authorization cache.

## Admin Page

The admin page is a compact operational dashboard, not a marketing page. It should be dense, readable, and useful on a server operator's desktop browser.

Top metrics:

- Online connections.
- Online devices.
- Authorized online devices.
- Unauthorized online devices.

Online table:

- Connection id.
- IP address.
- Device id.
- Device label.
- User id.
- Nickname.
- Room code.
- App version.
- Platform.
- License status.
- Connected at.
- Last seen at.

License table:

- License id.
- License status.
- Bound device id.
- Device label.
- Platform.
- App version.
- First IP.
- Last IP.
- Activated at.
- Last seen at.
- Expires at.

The first version does not need inline admin actions, but the data model leaves room for a future revoke, expire, and unbind workflow.

## Security And Privacy

- Do not collect MAC addresses or hardware serial numbers.
- Do not store plaintext license codes in SQLite.
- Validate payload sizes and field lengths on all license and room metadata fields.
- Protect admin routes with `DESKTOP_CAT_ADMIN_TOKEN`.
- Return generic activation failure messages where possible, while still giving the client enough detail for user-friendly states.
- Log activation and check results for audit and troubleshooting.
- Treat client-reported metadata as untrusted display data.

## Error Handling

License activation returns explicit states:

- `active`: activation or same-device reactivation succeeded.
- `not_found`: license code is unknown.
- `revoked`: license was disabled.
- `expired`: license has expired.
- `device_limit_reached`: license is already bound to another device.
- `invalid_request`: request payload is malformed.

License checks return the same authorization-oriented states. If SQLite is unavailable, license routes return a server error and the client may continue using a still-valid local cache.

Room metadata errors should not crash the WebSocket server. Invalid metadata should produce an error message for the client or be ignored when the field is optional.

## Deployment

Docker should persist the SQLite database with a volume:

```yaml
volumes:
  - ./data:/app/data
```

Environment variables:

- `DESKTOP_CAT_ADMIN_TOKEN`: required for admin routes.
- `DESKTOP_CAT_LICENSE_DB_PATH`: optional path to SQLite database.

The existing `npm run room:server` command continues to run the combined room, update, usage, and license service.

## Testing

Server tests:

- SQLite schema is created on startup.
- License activation binds an unused active license to a device.
- Repeating activation from the same device succeeds.
- Activation from another device fails after the one-device limit is reached.
- Revoked and expired licenses fail activation and checks.
- License checks are logged.
- Admin JSON routes reject missing or invalid tokens.
- Admin JSON routes return online connection and device counts.
- Room join metadata updates the usage tracker.

Client tests:

- Device id is generated once and reused.
- Room join includes device metadata.
- License activation stores local state.
- License check refreshes the seven-day cache.
- Expired local cache requires an online check.
- Revoked or expired server responses clear usable paid state.

## Out Of Scope

- Payment webhook integration.
- Account login.
- Multi-device plans.
- Self-service device unbinding.
- Admin write actions in the dashboard.
- Analytics history for past online usage.
