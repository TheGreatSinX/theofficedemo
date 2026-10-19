<#
  Character sheet importer for GatherGrid.

  Turns the raw chibi cast sheet into per-character RPG Maker spritesheets
  (3 columns x 4 rows: down / left / right / up) with the baked checkerboard
  background removed, frames aligned and heights normalized.

  Requires Windows PowerShell 5.1+ (System.Drawing). No other dependencies.

  Usage:
    powershell -ExecutionPolicy Bypass -File import.ps1 -Action grid
    powershell -ExecutionPolicy Bypass -File import.ps1 -Action export
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
  [string]$Out = (Join-Path $PSScriptRoot "out")
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
}
