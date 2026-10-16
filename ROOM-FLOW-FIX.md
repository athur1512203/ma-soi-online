# Create / Join room investigation — 2026-10-16

## Evidence before modification

- The deployed Vercel UI successfully created room GG6CDE, showed Host at seat 0, and a second browser joined with lowercase code. Both displayed the same two players. No error/warning console entries were returned.
- Render health and Engine.IO polling handshake returned HTTP 200 with Access-Control-Allow-Origin: https://ma-soi-online-wkqy.vercel.app. Handshake advertised WebSocket upgrade.
- Live three-client Socket.IO tests passed using forced polling and forced WebSocket and the exact Vercel Origin header.
- Consequently the reported current production failure was not reproduced. Missing VITE_SERVER_URL, incorrect CORS, or a backend outage were not established as its cause. Private Render/Vercel logs and environment dashboards were not available.

## Confirmed weaknesses and fixes

- Join used the generic 5-second action emitter without pending state or a shared lock. Repeated clicks could dispatch duplicate joins or overlap with create; the server rejects extra membership, but the UI could display errors after a successful join.
- Join now uses the same serialized controller as create. Both buttons share one synchronous lock, distinguish pending labels, validate names/codes, display server-specific errors and timeout errors, and wait for authoritative session/state before unlocking. Late acks cannot overwrite successful membership.
- Codes are trimmed and uppercased. The input permits surrounding whitespace during paste before normalization; the controller still requires exactly six alphanumeric characters.
- Connection handshake timeout is 60 seconds to give a waking Render instance more time. Automatic reconnection and token authentication are preserved. This is resilience work; a real cold start was not forced or reproduced.
- Backend room codes, Host assignment, seat allocation, validation and reconnect already passed tests; no backend/gameplay/CSS/role/animation changes were needed.

## Validation

- npm test: PASS, including all existing gameplay, lobby, deployment, CORS and bot-security suites.
- New room-flow integration: three clients, matching ordered player IDs, leave synchronization, same identity/seat after reconnect, offline create/join refusal, missing/invalid room, 100 repeated calls and cross create/join suppression. Both polling and WebSocket are forced separately.
- The same integration passed against https://ma-soi-backend.onrender.com with the exact production Vercel Origin. All own test rooms were left/cleaned up.
- Existing lobby suite additionally verifies room full (12 seats), started room rejection, duplicate session, expired reconnect and invalid names.
- Frontend unit tests verify code normalization, shared lock, full-room message, timeout, late ack and disconnect handling.
- npm run build: PASS, also explicitly built with VITE_SERVER_URL=https://ma-soi-backend.onrender.com.
- Production build preview connected to the real Render backend and successfully created a room with Host controls and a room code. Browser console returned no errors/warnings. A second preview browser joined using a lowercase, whitespace-padded code; after both players left, joining the deleted room displayed “Không thể tham gia phòng: Phòng không tồn tại.”

## Deployment and manual settings

Vercel build-time variable: VITE_SERVER_URL=https://ma-soi-backend.onrender.com
Render: NODE_ENV=production; CORS_ORIGINS=https://ma-soi-online-wkqy.vercel.app; DEV_BOT_TEST unset or 0. Keep normal timers. Render provides PORT automatically.

Check the deployment for the new main commit in the dashboards if public checks cannot confirm it. Redeploy Vercel after changing its build-time variable. No secrets are required for this change.

Rooms and sessions live only in RAM: a backend process restart deletes them. Reconnect preserves membership only while the same process retains the session (default grace period 30 seconds). No database or durable room restoration was added. The active production backend was not restarted during testing.

## Changed files

- src/create-room-client.js
- src/main.jsx
- tests/create-room-client.test.mjs
- tests/room-flow.test.mjs
- tests/run-tests.mjs
- ROOM-FLOW-FIX.md

Re-run isolated tests with npm test. Opt-in production probe (PowerShell):

    $env:LIVE_SERVER_URL='https://ma-soi-backend.onrender.com'
    node tests/room-flow.test.mjs
    Remove-Item Env:LIVE_SERVER_URL
