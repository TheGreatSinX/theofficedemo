# GatherGrid RPG Virtual Office — Codebase Audit

_Date: 2026-10-18 · Baseline commit: `772bfbe feat: initialize GatherGrid RPG project structure`_

## 1. Existing architecture

| Layer | Implementation |
| --- | --- |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 + Lucide icons + `motion` |
| Game engine | Phaser (`phaser@^4.2.1`), single `OfficeScene`, procedural canvas textures |
| Backend (dev/runtime) | Express + `ws` WebSocket server (`server.ts`), Vite middleware mode |
| Realtime | Ticket handshake → room-scoped WebSocket, 20 Hz authoritative tick, per-room `OfficeRoom`, `MovementAuthority` (speed, bounds, solid mask, rate limit), client interpolation (`RemotePlayerManager`) |
| Edge variant | Cloudflare Durable Object (`src/worker/OfficeDurableObject.ts`) + worker entry — parallel implementation, not wired into the Vite dev server; no `wrangler.toml` present |
| Persistence | Firestore (`officeMaps`, `platformConfig`, `users`, `admins`) + localStorage fallback; `IMapRepository` abstraction |
| Auth | Firebase Google sign-in, role resolution via `/admins` collection + bootstrap admin email, `AuthContext` |
| Weather | `HQWeatherService` → Open-Meteo live fetch, config in `platformConfig/hqWeather`, 10-minute refresh |
| Tests | `tests/multiplayer.test.ts` (27 protocol/authority/room/load tests), `tests/firestore.rules.test.ts` (rules-logic assertions) |

Map data model (`OfficeMapData`, schema v1): `width/height/tileSize`, `floorTiles[][]` (numeric IDs 0–5), `wallTiles[][]` (0 none, 10–13), `solidMask[][]`, `objects[]` (legacy string `type` → texture key), `interactionZones[]` (incl. `door_warp` with `warpTarget`), single `spawnPoint`. Three factory maps exist: `main_office` (24×18), `boardroom_wing` (18×14), `rooftop_garden` (18×14).

## 2. Functional features (verified in code)

- Phaser world with floor/wall/object rendering, arcade collisions, camera follow, pixel-perfect scaling.
- Arrow-key + click-to-move movement, sprint, coffee speed-boost buff, footstep audio, door-warp transitions across the 3 factory maps with fade effect.
- Ragnarok-style hover nameplates, speech bubbles, animated emoji reactions (hotkeys 1–5 + Google emoji picker persisted in localStorage).
- Multiplayer: presence, snapshot/join/leave, 20 Hz state broadcast, interpolation, server corrections, reconnect with backoff, latency display, reaction broadcast.
- Interaction zones with modals (meet/coffee/watercooler/whiteboard/booth/desk), minimap, colleague sidebar with teleport, chat drawer (mock service) with local speech bubbles.
- Avatar customizer persisted to Firestore; HQ weather modal + live weather pill.
- Admin map editor (floating toolbar): paint floor/wall, erase, place/remove objects, toggle collision, single-step undo, save draft, publish, JSON export/import, collision overlay.
- Firestore rules with default-deny, RBAC checks, per-collection validation; localStorage fallback when unauthenticated/offline.

## 3. Missing functionality (vs. master specification)

1. **Asset pipeline — none.** All textures are generated procedurally; there is no import, no asset storage, no tileset registry, no RPG Maker MZ sheet parsing (A1–A5, B–E, `$`/`!` conventions), no thumbnails, no asset persistence.
2. **Single fixed tile size (32) and fixed map sizes.** `TILE_SIZE` is a module constant used in scene math, collision blocks, editor, remote players, and presence; maps cannot be resized; no 16/48 support.
3. **No layer system** beyond floor/wall arrays; no decoration/foreground layers; no add/rename/reorder/hide/lock.
4. **Editor is a toolbar overlay**, not a Studio: no command bar with truthful save states, no tool rail (select/pan), no asset browser, no properties inspector, no layers panel, no status bar, no redo, no multi-tile brush, no spawn editing, no map resize, no zone/object property editing, no grid toggle, no pan/zoom controls.
5. **UI is single-mode.** No World/Studio separation, no design tokens, cramped navbar, panels overlapping the viewport at 1366×768.
6. **World system — none.** No worlds/projects, no map manager (create/rename/duplicate/delete maps), no connection management, no spawn-point management, no world overview. Warp targets hardcode `mapId`+pixel spawn.
7. **Persistence gaps.** No schema versioning/migration (only a `version` counter), no draft/published separation at load time, whole map blob stored per document with no size guard, no `listMaps`, no duplicated-map support, no asset-reference validation/recovery.
8. **Multiplayer/map divergence (correctness risk).** The server derives collision/bounds from the **factory** `OFFICE_MAPS` only; edited or custom maps silently fall back to a **36×24 default** bounds in `room.ts` and the Durable Object hardcodes the same. Any edited collision mask is therefore not enforced server-side, and resized maps are mis-validated.
9. **Weather is decorative only.** `isRaining`, lightning settings, and window effects are fetched but never applied to the Phaser world.
10. **No server-side identity verification** on `/api/auth/ticket`: the route trusts client-supplied `userId`/`role` (client never sends its Firebase ID token). Firestore remains protected by rules, but multiplayer identity is spoofable.
11. **Minor bugs:** emoji hotkeys 1–5 fire while the editor is open; `E`-interaction ignores `isInputFocused` for some paths; MapEditorToolbar duplicates tile-ID→texture maps in three places; `armed` collision overlap of click-to-move and editor paint; `Ctrl+Z` only works while editor open.

## 4. Data compatibility risks

- Numeric tile IDs are mapped to texture keys in at least three duplicated tables (scene build, scene editor paint, toolbar palette). Extending IDs without a registry will break rendering.
- `MapObject.type` doubles as the Phaser texture key — imported assets need a different reference (`assetId` + `frame`) with a conversion layer; legacy types must keep working.
- `TILE_SIZE` constant is assumed by scene math, remote-player depth sorting, presence tile conversion, and the server authority — centralizing is required before dynamic tile sizes.
- Server `AuthoritativeMapBounds` are factory-derived; nothing keeps the replica in sync with edited maps.
- Firestore rules validate only envelope fields (`isValidOfficeMap`), so schema migration must stay client-side and defensive; map payload size limits are unenforced.

## 5. UI/UX limitations

- No cohesive design tokens (colors/spacing/panels/focus/selection/disabled states are ad-hoc Tailwind strings).
- Editor overlays (toolbar, minimap, chat drawer, emoji dock) all float over the play area and compete for the same real estate; the emoji dock and minimap overlap at 1366×768.
- No clear hierarchy between playing and authoring; admin actions live in the same bar as presence controls.
- No truthful save state (toast-only), no dirty tracking, no failure persistence.
- Panels are fixed-width; no collapse/resize affordances.

## 6. Security considerations

- Firestore rules: default deny, RBAC via `admins` + users.role, map write admin-only, field validation present. Gaps: `mapData` internals unvalidated (size/shape), no rules for future `assets`/`worlds` collections yet.
- Multiplayer ticket endpoint trusts the client (`userId`, `role`, `avatarConfig`); no Firebase ID token verification. Room capacity, message size, rate limiting, movement clamping enforced server-side.
- Map publishing is gated by Firestore rules (server-side), not just UI (`MapEditorToolbar` shows role banner; publish writes will fail for employees) — verified in rules.
- No CSRF/CORS posture issues for the WS upgrade (same-origin), ticket single-use + 60 s TTL.

## 7. Proposed changes (implementation plan)

**M1 — Foundation.** Design tokens in `index.css` → Tailwind `@theme`; app shell with World/Studio modes; Studio layout skeleton; audit baselines (lint/build/tests) executed and recorded.

**M2 — Modes.** World Mode revamp (top bar: workspace/map/floors/online/latency/weather/avatar/audio/editor/account; collapsible panels; interaction dock); Studio Mode (command bar with undo/redo/save/publish/import assets/export/settings + truthful save states; left tools + asset browser; center Phaser canvas with grid/zoom/pan; right inspector; bottom layers + status bar). All controls bound to real editor state.

**M3 — Assets + dynamic maps.** `IndexedDB`-backed asset storage with optional Firebase Storage backend behind `IAssetStorage`; image validation; RPG Maker MZ sheet detection (A1–A5, B–E, character sheets incl. `$`/`!`) with manual override; thumbnails; Firestore `assets` metadata (admin-write, signed-in read); multi-tileset maps; configurable tile size (16/32/48 scaled rendering); resizable maps; multi-layer model; schema v2 with explicit migration from v1 and derived legacy fields on save; chunked ground rendering for large maps; editor patches with undo/redo; world schema (`worlds` collection) + World Manager (CRUD, connections, spawns, overview); multiplayer map registration (bounds + collision mask hash/RLE) and server-side validation against registered maps.

## 8. Testing strategy

- Preserve and run existing suites: `npm run lint`, `npm run test:multiplayer`, `npm run test:rules` (rules harness is self-contained logic tests), `npm run build`.
- Add unit suites: `tests/map.schema.test.ts` (migration v1→v2, resize preserve/truncate, RLE round-trip, validation bounds), `tests/assets.test.ts` (file validation, sheet layout detection incl. `$`/`!`, frame extraction math, duplicate handling), `tests/editor.test.ts` (undo/redo command inversion, serialization integrity, asset-reference integrity).
- Add multiplayer tests for map registration (mismatch rejection, bounds enforcement after registration).
- Manual acceptance per spec §16/§17.7 within the running dev server; report only executed results.
