# Office equipment art

Hand-drawn equipment imported into `src/assets/objects/`.

## Source sheets

| Sheet | File | Content |
| --- | --- | --- |
| Office equipment | `raw-assets/office_equipment_sheet.jpeg` | desks, chair, monitors, laptop, keyboard, mouse, lamp, books, mug, plants, headphones, speakers, shelves, framed art, rugs, floor tiles |
| Gaming desks | `raw-assets/gaming_desk_sheet.jpeg` | ten themed workstations |

## Import

```powershell
cd raw-assets/import
powershell -ExecutionPolicy Bypass -File import.ps1 -Action equipexport -Set office  -Src ..\office_equipment_sheet.jpeg -Dest ..\..\src\assets\objects
powershell -ExecutionPolicy Bypass -File import.ps1 -Action equipexport -Set gaming -Src ..\gaming_desk_sheet.jpeg     -Dest ..\..\src\assets\objects
```

The importer masks the checkerboard background (with a bounded two pixel halo,
so pale items such as rugs and tiles survive), crops the item rectangles listed
in `import.ps1` and writes one transparent PNG per item.

`-Action equipment` prints the detected rows/columns of a sheet when the crop
rectangles need to be refreshed.

## Using the art

- `src/game/objectSprites.ts` maps every item to its image and exposes
  `getObjectSprite(type)`.
- `src/game/assets/objectIds.ts` lists the object types (labels, footprint and
  whether they block movement) and the legacy types that now use the new art
  (`LEGACY_ART_MAP`), so existing maps keep working.
- Objects fill the height of their footprint and may reach into the next tile
  horizontally (a desk is wider than it is deep); they are anchored to the
  bottom of the tile and stay Y-sorted with the crowd.
