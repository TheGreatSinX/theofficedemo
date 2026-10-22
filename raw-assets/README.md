# Raw assets (source art)

Drop **original, untouched** source art here. Generated, game-ready outputs are
committed under `src/assets/` instead.

## Office cast sheet

`Pixel-Art Cybersecurity Character Sprite Sheet.png` — the hand-drawn chibi cast
(1536×1024, checkerboard "transparency" baked into the pixels, 6 rows × 16
frame slots). Seven complete characters were extracted; the red-haired staffer
is frontal-only (no side view) and is intentionally not in the roster yet.

## Standalone 12-frame character sheets

`office_admin_12frame.jpeg` and `devops_engineer_12frame.jpeg` — single
characters drawn as a classic RPG Maker MZ sheet (3 columns × 4 rows:
down / left / right / up, column 0 is the idle pose). The Office Admin sheet
replaces the roster entry that the cast sheet could only supply with a single
side and back drawing.

## Import pipeline

`import/import.ps1` + `import/SheetTool.cs` — zero-dependency C#/PowerShell
importer (Windows, System.Drawing). It:

1. detects the baked 11px checkerboard and removes it with an edge flood fill
   plus an anti-aliasing cleanup pass and despeckle;
2. finds the six character rows and the 16 frame boxes per row;
3. harvests each character's frames across the rows (front idle, front walk,
   side, backs), uses the right-facing side art for the right row and mirrors
   it for the left row, and normalizes frame heights and feet baselines;
4. if a direction only has a single drawing (Office Admin's side and back
   rows), bakes a small step bob into the two outer cells so the preset still
   animates instead of sliding while frozen;
5. writes `out/export/char_<id>.png` — 97×153 frames, 3×4 RPG Maker layout —
   plus `out/export/cast_preview.png` for a quick visual check.

The `sheet34` action handles a standalone 3×4 sheet instead: it masks the
background the same way, keeps the largest 8-connected component per cell
(so baked drop shadows are dropped), reorders the columns to the registry's
step / idle / step convention and scales every frame to the same 143px body
height with the feet on the 147px baseline.

```powershell
cd raw-assets/import
powershell -ExecutionPolicy Bypass -File import.ps1 -Action grid     # detection boxes
powershell -ExecutionPolicy Bypass -File import.ps1 -Action export   # final sheets
powershell -ExecutionPolicy Bypass -File import.ps1 -Action sheet34 -Src ..\office_admin_12frame.jpeg -Dest ..\..\src\assets\characters\char_office_admin.png
```

Copy the exported `char_*.png` files to `src/assets/characters/`; the in-game
registry (`src/game/characterPresets.ts`) lists ids, names and frame sizes.
