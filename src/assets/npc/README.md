# NPC assets

Art used by the ambient cast (`src/game/npc/`).

NPCs reuse the **same** sprite pipeline as players, so anything in here has to
follow the RPG Maker MZ character-sheet convention:

```
3 columns × 4 rows   →   row 0 down · row 1 left · row 2 right · row 3 up
column 0 step · column 1 standing (idle) · column 2 step
```

## Where NPCs get their sprites

`NpcDefinition.sheet` picks one of three sources:

| Source | Where it comes from | Notes |
| --- | --- | --- |
| `{ kind: 'preset', id }` | `src/assets/characters/char_<id>.png` | The bundled hand-drawn cast. |
| `{ kind: 'asset', assetId }` | Studio → Assets (imported sheet) | Any MZ 3×4 or 12×8 sheet from the asset library. |
| `{ kind: 'procedural', avatar }` | Generated at runtime | Classic 32×32 avatar colours. |

## Adding a new NPC

1. Put the sprite in `src/assets/characters/` (or import it through the
   Studio asset library) and register it in `src/game/characterPresets.ts`.
2. Add the definition to `src/game/npc/npcCatalog.ts`:

```ts
{
  id: 'npc_ada',
  name: 'Ada Byron',
  title: 'Analyst',
  mapId: 'main_office',
  x: 5, y: 7,               // spawn tile
  direction: 'down',
  sheet: { kind: 'preset', id: 'consultant' },
  waypoints: [{ x: 9, y: 7, pauseMs: 1500 }],
  speed: 60,
  lines: ['Sprint board is up to date.'],
}
```

3. NPCs are drawn with the same 3-frame, 8 fps walk cycle as players, are
   Y-sorted with the crowd and can be talked to with **E** / **Space**.

> Keep spawn and waypoint tiles clear of desks, plants and other solid
> objects — NPCs walk a straight line between waypoints.
