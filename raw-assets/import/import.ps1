<#
  Character sheet importer for GatherGrid.

  Turns the raw chibi cast sheet into per-character RPG Maker spritesheets
  (3 columns x 4 rows: down / left / right / up) with the baked checkerboard
  background removed, frames aligned and heights normalized.

  Requires Windows PowerShell 5.1+ (System.Drawing). No other dependencies.

  Usage:
    powershell -ExecutionPolicy Bypass -File import.ps1 -Action grid
    powershell -ExecutionPolicy Bypass -File import.ps1 -Action export
    powershell -ExecutionPolicy Bypass -File import.ps1 -Action sheet34 -Src ..\office_admin_12frame.jpeg -Dest ..\..\src\assets\characters\char_office_admin.png
    powershell -ExecutionPolicy Bypass -File import.ps1 -Action crop -X 0 -Y 0 -W 400 -H 200 -Zoom 2
    powershell -ExecutionPolicy Bypass -File import.ps1 -Action maskdebug

  Outputs land in `raw-assets/import/out/`:
    grid_debug.png   detected row/frame boxes drawn over the source
    mask_debug.png   background mask visualization
    export/*.png     final per-character sheets + cast_preview.png

  Copy `export/char_*.png` into `src/assets/characters/` after a successful
  export. The runtime registry lives in `src/game/characterPresets.ts`.
#>
param(
  [string]$Action = "grid",
  [string]$Src = (Join-Path $PSScriptRoot "..\Pixel-Art Cybersecurity Character Sprite Sheet.png"),
  [int]$X = 0,
  [int]$Y = 0,
  [int]$W = 0,
  [int]$H = 0,
  [int]$Zoom = 1,
  [string]$Out = (Join-Path $PSScriptRoot "out"),
  [string]$Dest = "",
  [string]$Set = "office"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Out | Out-Null

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition (Get-Content -Raw (Join-Path $PSScriptRoot "SheetTool.cs"))

switch ($Action) {
  "analyze"   { [SheetTool]::Analyze($Src) }
  "crop"      { [SheetTool]::Crop($Src, $X, $Y, $W, $H, (Join-Path $Out "crop_${X}_${Y}_${W}x${H}.png"), $Zoom) }
  "maskdebug" { [SheetTool]::MaskDebug($Src, (Join-Path $Out "mask_debug.png")) }
  "grid"      { [SheetTool]::GridDebug($Src, (Join-Path $Out "grid_debug.png")) }
  "export"    { [SheetTool]::Export($Src, (Join-Path $Out "export")) }
  "sheet34"   { [SheetTool]::Process34($Src, $(if ($Dest -ne "") { $Dest } else { Join-Path $Out "char_34.png" })) }
  "npccast"   { [SheetTool]::ExportNpcCast($Src, (Join-Path $Out "export"), @("npc_captain","npc_poppy","npc_amber","npc_lilac","npc_teal","npc_ochre","npc_silver","npc_curly","npc_beanie","npc_sand")) }
  "equipment" { [SheetTool]::AnalyzeEquipment($Src) }
  "equipexport" {
    $office = @(
      "desk_simple@46,45,309,233",
      "desk_lshape@362,43,619,232",
      "desk_drawers@683,44,947,233",
      "chair_office@1020,42,1152,244",
      "monitor_off@62,278,231,408",
      "monitor_on@288,278,458,408",
      "monitor_curved_off@515,278,715,408",
      "monitor_curved_on@756,278,955,408",
      "laptop@1017,285,1155,421",
      "keyboard@55,474,269,552",
      "mouse@330,475,388,559",
      "lamp_desk@462,422,584,582",
      "books@651,459,861,575",
      "mug_coffee@912,474,1008,573",
      "plant_pot@1055,449,1163,578",
      "plant_big@64,581,183,764",
      "plant_small@251,639,333,748",
      "plant_dark@398,584,506,758",
      "headphones@586,615,707,745",
      "speaker@787,635,961,748",
      "plant_hanging@1039,602,1159,775",
      "shelf_plant@61,799,331,916",
      "shelf_trailing@390,789,629,939",
      "frame_landscape@707,803,803,911",
      "frame_sunset@839,803,937,911",
      "frame_moon@975,803,1070,911",
      "frame_tree@1109,803,1202,911",
      "rug_beige@50,958,226,1068",
      "rug_green@243,958,420,1069",
      "rug_blue@439,958,620,1067",
      "rug_red@636,957,818,1068",
      "rug_round_beige@856,952,1002,1068",
      "rug_round_green@1051,954,1194,1066",
      "floor_wood@51,1084,219,1212",
      "floor_wood_dark@244,1086,414,1210",
      "floor_herringbone@442,1084,614,1211",
      "floor_tile_light@642,1084,810,1210",
      "floor_tile_dark@841,1086,1006,1208",
      "floor_checker@1036,1084,1204,1209"
    )
    $gaming = @(
      "gaming_desk_purple@27,104,317,392",
      "gaming_desk_ice@344,112,601,391",
      "gaming_desk_crimson@627,104,893,392",
      "gaming_desk_sand@932,107,1188,392",
      "gaming_desk_mint@36,526,288,787",
      "gaming_desk_gold@341,505,631,787",
      "gaming_desk_neon@658,502,925,787",
      "gaming_desk_amber@29,869,310,1165",
      "gaming_desk_lilac@355,882,609,1166",
      "gaming_desk_dual@652,898,951,1169"
    )
    $manifest = if ($Set -eq "gaming") { $gaming } else { $office }
    $target = if ($Dest -ne "") { $Dest } else { Join-Path $Out "objects" }
    [SheetTool]::ExportEquipment($Src, $target, $manifest)
  }
}
