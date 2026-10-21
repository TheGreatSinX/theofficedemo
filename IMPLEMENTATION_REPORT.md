# GatherGrid — RPG Virtual Office Revamp: Implementation Report

**Scope:** Full UI/UX revamp, RPG Maker MZ asset compatibility, expandable world
system and multiplayer preservation for the existing `theofficedemo` codebase —
implemented on top of the original architecture (no greenfield rewrite).

**Verification status (all executed in this workspace):**

| Command | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | ✅ Clean, 0 errors |
| `npm run build` (`vite build`) | ✅ Success — 1,728 modules transformed |
| `npm run test:rules` | ✅ 12/12 security assertions |
| `npm run test:multiplayer` | ✅ 32/32 tests |
| `npm run test:maps` | ✅ 8/8 tests |
| `npm run test:editor` | ✅ 8/8 tests |
| `npm run test:assets` | ✅ 7/7 tests |
| `npm test` (all suites chained) | ✅ All green |

---

## 1. Architecture Overview

```
┌───────────────────────────── UI shell (App.tsx) ─────────────────────────────┐
│  World Mode (play)                     Studio Mode (author)                  │
│  Navbar · Minimap · Docks              Command bar · Rails · Palette ·       │
│  Modals (weather, avatar, emoji…)      Inspector · Layers · Modals           │
│  └──────────────┬───────────────────────────────────┬───────────────┘        │
│        OfficeCanvas (single Phaser game) — OfficeScene                       │
│         • layered/asset tile rendering   • studio tools & overlays           │
│         • remote player sync             • weather + scene effects           │
└──────────────┬──────────────────────────────────────┬────────────────────────┘
               │ React state (map data, history)      │ multiplayer client
   ┌───────────┴────────────┐              ┌──────────┴───────────┐
   │ mapSchema v2 (pure)    │              │ protocol/room/client │
   │ edits.ts (commands)    │              │ authority (bounds)   │
   │ AssetRegistry          │              │ serverAuth (tickets) │
   │ MapRepository/Worlds   │              │ server.ts (WS)       │
   └────────────────────────┘              └──────────────────────┘
```

Key invariants:

- **One Phaser game instance** for both modes; Studio Mode reuses the World
  renderer/scene (`setStudioMode`), so there are no duplicate scenes, textures,
  listeners or physics worlds.
- **Map data is the single source of truth** shared by World rendering, Studio
  editing, persistence, minimap, and the multiplayer server registration.
- **No binary blobs in Firestore map documents**: maps reference `assetId`s;
  images live in IndexedDB (+ Firebase Storage mirror when configured) and the
  `assets` collection stores metadata/thumbnails only.

## 2. Map Schema v2 (`src/types/game.ts`, `src/game/maps/mapSchema.ts`)

- Canonical runtime schema **v2**: ordered layers (`tiles` with `ground`/`row`
  depth modes, plus a dedicated `collision` layer), per-map tileset registry,
  spawn point lists, objects, interaction zones, environment and metadata.
- **Legacy v1 compatibility:** factory maps (`officeMaps.ts`) stay schema v1
  (`OFFICE_MAPS`); `getFactoryMap()` migrates on read. `migrateMapData()` also
  handles stored/imported documents, re-derives missing collision layers, spawn
  lists, tilesets, and normalizes grids. `serializeMapForStorage()` re-derives
  `floorTiles`/`wallTiles`/`solidMask` on save so nothing downstream breaks.
- **Validation:** `validateMapData()` enforces ids/names/dimensions/cell caps
  (400×400, 160k cells), layer/grid consistency, tileset coverage, entity caps.
- **Resizable maps:** `resizeMap()` grows/shrinks preserving overlapping tiles,
  clamping spawns, trimming objects/zones and reporting warnings.
- **Configurable tile size:** 16/32/48 supported (`SUPPORTED_TILE_SIZES`),
  scene rendering, avatar scaling and server bounds are all tile-size aware.
- **Mask transport:** `encodeMaskForTransport()` picks `rle:<b64>` (byte RLE)
  or `raw:<b64>` (bit-packed), capped at 30k chars; `computeMaskHash()` (FNV-1a,
  mirrored server-side) keys map revisions.

## 3. Asset System (`src/types/assets.ts`, `src/game/assets/*`, `src/services/*`)

- **RPG Maker MZ conventions** detected by `detectSheetLayout()`: `$` single
  characters (3×4), standard character grids (12×8 → 4×2 characters), `!`
  no-shift flags, A1–A5 families and B–E tilesets, with per-sheet frame/grid
  metadata and confidence notes.
- **Validation:** `validateAssetFile()` (type/ext/empty/8 MB cap) and
  `validateImageDimensions()` (min 8 px, max 4096 px, 16 MP safety cap).
- **Storage abstraction** (`AssetStorage.ts`): binary images stored in
  IndexedDB; Firestore metadata + 96 px thumbnails; Firebase Storage mirror when
  cloud config is present; everything reports truthfully `cloudPersisted`.
- **`AssetRegistry`**: import draft → validation → confirm pipeline with
  progress, duplicate detection, image cache, subscriptions, preloading and
  reference scanning (`collectReferencedIds`, `findMissingReferences`).
- **Map integration:** tilesets are map-local references (`source: 'asset'`,
  `firstTileId` assigned above the builtin range), objects store
  `assetId/frame/size` — imported content is fully editable and persists.

## 4. Studio Mode (`src/game/OfficeScene.ts`, `src/components/studio/*`)

- **Tools:** select, pan, paint (with brush sizes 1–4), erase, object
  placement, collision brush, spawn placement; wall painting optionally sets
  collision (`paintCollisionWithWalls`).
- **Rendering:** ground layers batch into chunked RenderTextures; `row` layers
  and entities are Y-sorted sprites (ground depth `order*0.1`; row layers
  `order*0.1 + (y+1)*tileSize`; entities `2000 + y`; overlays 8000+, bubbles
  9100/9200, weather 9350–9400).
- **Editing pipeline:** every mutation is an invertible `EditCommand`
  (`src/game/edits.ts`); the scene applies edits immediately and records
  commands; React owns `EditHistory` (80-deep, dirty tracking, labels).
  `undo()`/`redo()` return **pure command lists** (no map mutation); the App
  applies them and asks the scene to `refreshFromCommands()` (structural
  commands rebuild only what changed).
- **Panels:** command bar (save/publish/undo/redo/resize/new/import/export),
  tools rail, layers panel (visibility/lock/order/add/remove + map settings),
  palette (builtin tiles, imported sheets with canvas frame picking, objects,
  asset tab), inspector (objects, zones incl. door/portal warp targets with
  target-map spawn loading, spawn points, map overview lists).
- **Overlays:** grid, collision, zone overlays, hover/selection markers,
  zoom/pan (wheel), minimap integration; Esc exits, Ctrl+S saves, V/B/E/C/H/O/N
  tool hotkeys, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo/redo.

## 5. World Mode & World System

- **Worlds** (`WorldRepository`): groupings of maps with membership, order,
  versioning; Firestore `worlds` collection + localStorage mirror for offline.
- **World Manager modal:** create/rename/delete worlds, add/remove/reorder
  maps, set active world, and a **Connections** tab that derives cross-map
  edges from `door_warp` zones (`getMapConnections`).
- **Validated transitions:** `validateTransition()` resolves the target spawn
  (explicit `targetSpawnId`, legacy pixel coords, or default spawn), rejects
  missing spawns, out-of-bounds coordinates and solid destination tiles. The
  App performs the warp with a transition: preload assets → switch map (same
  scene, `switchMapWithTransition`) → re-register the map with the server.
- **Map browser** (`MapPickerModal`): open/edit/export/reset/delete (factory
  maps protected), JSON import/export, refresh.
- **Preserved features:** HQ weather live integration (visual state + rain /
  lighting / window flags → scene `setWeather` + environmental effects),
  emoji reactions, speech bubbles, presence, minimap, modals, avatar
  customization, chat preview, nearby colleagues.

## 6. Multiplayer Preservation & Hardening

- **Architecture preserved** (WS transport, rooms, tickets, 20 Hz ticks,
  interpolation, reactions) with protocol version `1.1.0`.
- **`register_map` flow:** the client sends its current map revision
  (mapId, width/height/tileSize, mask RLE, spawn). The first registration for a
  room is canonical; matching registrations are accepted (`canonical: false`);
  divergent ones receive `map_mismatch` with the canonical revision so clients
  can reconcile. The server seeds factory-room bounds before any registration.
- **Server-authoritative bounds & collision now dynamic:** `MovementAuthority`
  validates against the registered map (margin `max(4, tileSize/2)`), decodes
  the RLE/raw mask, rejects solid-tile moves, clamps out-of-bounds coordinates,
  and relocates players left inside newly solid tiles with a
  `movement_rejected` correction (`validateTransition`-style checks shared).
- **No trust in client identity:** the ticket endpoint now verifies Firebase ID
  tokens against Google x509 certs (RS256, cached), derives `userId` from the
  token subject, and looks up roles via Firestore REST with the caller's token;
  unauthenticated requests cannot self-assert admin.
- **Protocol hardening:** strict message validation, 48 KB message cap,
  30,050-char mask cap, rate limiting, single-use tickets, room scoping.

## 7. Firestore Security Rules (`firestore.rules`)

- Existing collections unchanged; added:
  - `assets/{assetId}`: signed-in read/list; create only when
    `ownerUid == request.auth.uid` and payload validates; update/delete for
    creator or admin; ownership cannot be reassigned.
  - `worlds/{worldId}`: signed-in read; admin-only create/update/delete with
    payload validation.
- Validators enforce shape/size limits (ids ≤128 chars, dimensions, grids,
  thumbnail size cap) consistent with the client-side schema.

## 8. Tests (`tests/`)

- `firestore.rules.test.ts` — 12 security assertions (dirty-dozen style).
- `multiplayer.test.ts` — extended to **32 tests** including a new
  "Dynamic Map Registration" section: register_map validation, canonical
  first-registration semantics + spawn snapping, mask-driven collision
  rejection, out-of-bounds clamping against registered sizes, mismatch
  reporting with canonical revision, and bystander relocation.
- `map.schema.test.ts` (new, 8 tests) — v1→v2 migration fidelity for all three
  factory maps, storage serialization round-trips, creation/validation limits,
  resize grow/shrink semantics, mask transport (RLE + worst case + malformed),
  mask hash stability, spawn/transition validation, derived connections.
- `editor.test.ts` (new, 8 tests) — builders, command apply/invert round-trips
  for tiles/collision/objects/zones/spawns/layers/tilesets/map meta/resize,
  history purity (undo returns data, does not mutate), dirty tracking, redo-tail
  clearing, 80-entry depth cap, snapshot round-trips.
- `assets.test.ts` (new, 7 tests) — `$`/`!` conventions, character grids,
  A-family/B–E detection, frame math, file/dimension validation limits.

## 9. Compatibility & Operational Notes

- Phaser **4.2.1** APIs used correctly (`RenderTexture.draw`, image
  construction without `make.image` keys, `textures.addImage`).
- React 19 / Vite 8 / Tailwind v4 / Firebase 13 — unchanged stack.
- Install with `npm install --legacy-peer-deps` (upstream peer conflict).
- Firestore app keeps working without cloud config: local IndexedDB /
  localStorage fallbacks; import/export JSON preserves portability.
- Cloud reads are auth-gated by design: every collection requires sign-in per
  `firestore.rules`, so the repositories await `auth.authStateReady()` and skip
  Firestore queries entirely while signed out (silent local/factory fallback —
  no permission-error console noise). When a session becomes available (fresh
  Google sign-in or a restored session resolving after first paint), worlds,
  map list, weather config and asset metadata re-sync automatically.
- Deleted obsolete `MapEditorToolbar.tsx` and the legacy `EditorSettings`
  type — no dangling references remain.

## 10. Known Limitations / Honest Notes

- The test suites are Node-based logic/emulation suites (schema, editing,
  protocol, authority, storage math). They do **not** exercise a real browser
  canvas or a live Firebase project; a manual smoke pass in the browser
  (import an MZ sheet → paint → save → reload → verify) is recommended on a
  real device before production rollout.
- Firebase Storage mirroring requires bucket configuration; without it, assets
  are device-local with Firestore metadata (by design, reported in the UI).
- Very large maps (>128 tiles per side) warn about editor performance by
  design; rendering uses chunked batching but very dense `row` layers rely on
  user discipline.

## 11. Deployment (Cloudflare Workers)

- Deploys through Cloudflare Workers Builds (build: `npm run build`, deploy:
  `npx wrangler deploy`) driven by the committed `wrangler.jsonc` (worker
  name `office`, live at **`office.landverseauto.workers.dev`**; note that
  `97ee04f1-office.…workers.dev` is a frozen version-preview URL and does not
  track deployments) — no interactive setup, no npm install during deploy.
- **Root cause of the first failed deploy (fixed):** without a committed
  Wrangler config, `wrangler deploy` ran its interactive "Vite framework"
  auto-setup, which shelled out to a plain `npm install` and aborted on this
  project's known `esbuild` peer conflict (`esbuild@^0.25` vs. Vite 8's
  `^0.27 || ^0.28`). The build step itself was always green.
- **Full-stack deploy:** the worker entry (`src/worker/index.ts`) serves the
  SPA from `dist/` through the `ASSETS` binding and hosts the same
  authoritative multiplayer stack as the local dev server (`server.ts`):
  - `POST /api/auth/ticket` — identity verification
    (`src/worker/workerAuth.ts`, the Workers-native port of
    `src/multiplayer/serverAuth.ts`: RS256 via WebCrypto against Google's
    secure-token JWKS + Firestore role lookup with the caller's own token)
    and single-use, room-scoped, 60-second tickets stored in the room's
    Durable Object.
  - `GET /ws` — forwarded to the room's `OfficeDurableObject`, which runs the
    shared `OfficeRoom` logic (dynamic `register_map` bounds, movement
    authority, room ticks) over SQLite-backed Durable Object storage.
  - `GET /api/health` and `GET /api/rooms?roomId=` — ops probes; `/api/*`
    otherwise answers JSON 404 so the SPA never swallows API calls.
- **Verified locally before pushing:** `npx wrangler dev` +
  `npx tsx tests/worker.e2e.ts` — 27/27 checks against the real workerd
  runtime: the ticket JSON contract and auth paths (no user → 400, disabled →
  403, bad token → 401, GET → 405), handshake rejections (no ticket → 401,
  consumed ticket reuse → 403, cross-room ticket → 403), `register_map`
  canonical + mismatch flows, the movement round-trip, heartbeat/pong,
  reactions, and disconnect broadcasts. `npx wrangler deploy --dry-run` also
  verified (75 KiB bundle, both bindings resolved).
- **Firebase project: `th30ffi3-dem0`** (migrated from the AI Studio project;
  see `firebase-applet-config.json` for the web config). All client, worker,
  and local-server Firebase values come from that single file.
  `firebase.json` + `.firebaserc` target the project for rules deploys
  (`npx firebase-tools deploy --only firestore:rules`).
- **Firebase provisioning for `th30ffi3-dem0` (all completed):**
  1. Firestore `(default)` database — created, region `asia-southeast1`.
  2. `firestore.rules` — deployed; the `cloud.firestore` release serves the
     committed ruleset, so unauthenticated reads are rejected (verified via a
     live anonymous read probe → 403).
  3. Authentication — initialized with **Google** sign-in enabled (the default
     email/password config is untouched; the app only surfaces Google).
  4. Authorized domains — `office.landverseauto.workers.dev` (production)
     and the older `97ee04f1-office.landverseauto.workers.dev` preview URL,
     alongside `localhost`, `th30ffi3-dem0.firebaseapp.com`, and
     `th30ffi3-dem0.web.app` (verified via the Auth admin API).
- Multiplayer works without sign-in (unverified `employee` tickets; admin can
  never be self-asserted). While signed out, the app silently uses local and
  factory data — auth-gated cloud reads are skipped (see §9) — so unsigned
  guests never surface Firestore permission errors.

## 12. Pixel RPG UI Reskin (shell chrome)

The game world and Studio editor were already pixel-RPG; this pass reskins the
surrounding interface chrome so the whole app reads as RPG Maker.

- **Design system (`src/index.css`):** `@theme` tokens (fonts + `--color-rpg-*`
  palette: ink/inset/window blues, light edge, gold, green, red) plus unlayered
  component classes that intentionally win over Tailwind utilities:
  `rpg-window`, `rpg-window-title`, `rpg-inset`, `rpg-inset-active`, `rpg-btn`
  (+ `-gold` / `-danger` / `-plain` / `-light` / `-round`), `rpg-tab`, `rpg-chip`
  (+ tone variants), `rpg-input`, `rpg-bar`, `pixel-title`, `pixel-font`.
- **Typography:** Press Start 2P for headings/buttons/badges, VT323 for body
  (micro `text-[9..11px]` hotkeys, `text-xs`/`text-sm` are normalized globally
  so VT323 stays legible at RPG sizes). Noto Color Emoji kept for emoji
  rendering; chunky pixel scrollbars; `::selection` in gold.
- **Reskinned surfaces:** navbar, colleagues directory, minimap, chat drawer,
  emote dock, controls overlay, all world-mode modals (login, avatar, weather,
  emoji picker, interaction), Studio command bar + tool sidebar + palette +
  inspector + status bar, all three Studio modals (worlds/maps/assets), toasts,
  app background, and the canvas backdrop.
- **Intentionally unchanged:** the Phaser canvas pixel art, avatar inline color
  styles, and lucide stroke icons (they sit on beveled buttons as-is).
- **Verification:** `tsc` + `vite build` clean; all 67 automated assertions
  (rules 12, multiplayer 32, maps 8, editor 8, assets 7) still pass; CSS bundle
  shrank (~63 → ~41 kB) because the old slate/indigo utilities were removed.

## 13. Hand-drawn character presets (avatar roster)

The chibi office cast from the raw sheet is now a selectable avatar roster,
synced to other players through the existing multiplayer `avatarConfig` flow.

- **Import pipeline:** `raw-assets/import/` (zero-dependency C#/PowerShell).
  It removes the baked checkerboard background with an edge flood fill (plus an
  anti-aliasing cleanup pass and despeckle), detects the six rows and 16 frame
  slots per row, harvests each character's front idle/walk, side and back
  frames, mirrors the side view for the right-facing row, normalizes frame
  heights and feet baselines, and exports 97×153 frames. Outputs land in
  `src/assets/characters/char_<id>.png` (3 columns × 4 rows: down/left/right/up).
- **Roster:** seven complete characters — Office Worker, SOC Analyst,
  Consultant, Project Manager, DevOps Engineer, Field Engineer, Office Admin.
  The red-haired staffer in the sheet is frontal-only (no side view), so she was
  intentionally left out instead of faking a profile animation.
- **Data model:** `AvatarConfig.characterId?: string` references a preset; the
  color fields remain stored so switching back to a custom avatar restores the
  previous look. No Firestore rule or protocol changes were needed — the whole
  `avatarConfig` map already flows profile → ticket → Durable Object →
  `RemotePlayerManager`.
- **Renderer (`OfficeScene`):** preset sheets are preloaded in `preload()` and
  registered in `create()` (image texture + sliced frames + walk/idle anims).
  Textures use LINEAR filtering so the high-resolution art downscales cleanly.
  Preset sprites render ~1.4 tiles tall, with physics metrics expressed in
  source pixels so the collision footprint matches classic 32×32 avatars;
  `RemotePlayerManager` now receives the metrics callback and applies it to
  remote and mock players as well.
- **Walk cycle:** every preset uses the same 3-frame, 8 fps ping-pong walk as
  the SOC Analyst (down/left/right/up, idle on the middle column). The source
  art already supplied multiple step drawings for six characters; Office Admin
  had only one side/back drawing, so the importer now bakes a subtle step bob
  into those two rows. No direction slides while frozen.
- **Avatar Studio:** a "Character Roster" gallery (thumbnail crops of the
  down-facing idle frame) sits above the procedural color controls, which dim
  while a preset is selected. The live preview renders the chosen preset sheet,
  and the Custom tile clears `characterId`.
- **Verification:** `tsc`, `vite build` and the full 67-assertion suite pass;
  `cast_preview.png` was inspected for frame layout, alignment and mirrored rows.
