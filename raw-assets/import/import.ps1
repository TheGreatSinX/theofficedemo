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
  "propsexport" {
    # Prop sheets follow the same regular grid as the equipment sheets; the
    # rectangles come from the `equipment` analysis (1-based, inclusive).
    $cabinet = @(
      "cabinet_file_low@42,61,131,292",
      "cabinet_file_tall@190,61,278,292",
      "cabinet_lateral@326,61,465,292",
      "cabinet_file_narrow@512,61,592,292",
      "wardrobe_wood@649,61,758,292",
      "sideboard_wood@792,61,934,292",
      "locker_narrow@973,61,1083,292",
      "cabinet_glass@1114,61,1232,292",
      "bookshelf_wood@32,332,145,575",
      "locker_open@179,332,300,575",
      "cabinet_supply_open@337,332,451,575",
      "wardrobe_steel@488,332,612,575",
      "cabinet_vent@656,332,764,575",
      "rack_server_open@809,332,916,575",
      "cart_printer@966,332,1083,575",
      "cabinet_cream@1115,332,1235,575",
      "cabinet_sink@31,642,148,852",
      "cabinet_base_wood@179,642,305,852",
      "locker_quad@343,642,453,852",
      "shelf_binders_tall@491,642,607,852",
      "pedestal_drawers@651,642,756,852",
      "cabinet_file_open@799,642,913,852",
      "shelf_binders_beige@953,642,1067,852",
      "cabinet_tall_light@1106,642,1232,852",
      "cabinet_antique@32,911,161,1117"
    )
    $decor = @(
      "plant_succulent@66,41,165,293",
      "plant_ficus@246,41,371,293",
      "plant_snake@457,41,569,293",
      "plant_lily@636,41,800,293",
      "plant_hanging_macrame@854,41,1006,293",
      "plant_cactus@1084,41,1180,293",
      "plant_fern@34,330,201,570",
      "plant_bonsai@246,330,407,570",
      "plant_hydrangea@461,330,589,570",
      "plant_palm@641,330,804,570",
      "plant_grass@879,330,988,570",
      "plant_pothos_crate@1050,330,1205,570",
      "art_abstract@54,619,184,807",
      "art_landscape@249,619,397,807",
      "clock_wall@457,619,598,807",
      "sculpture_gold@679,619,785,807",
      "vase_blue@879,619,985,807",
      "globe@1062,619,1201,807",
      "calendar_desk@46,860,197,1033",
      "trophy_gold@256,860,385,1033",
      "certificate@448,860,604,1033",
      "corkboard@645,860,818,1033",
      "books_stack@863,860,1021,1033",
      "lamp_table@1077,860,1185,1033"
    )
    $sofa = @(
      "sofa_black_leather@80,113,310,300",
      "sofa_tan_three@416,113,740,300",
      "sofa_gray@832,113,1086,300",
      "sofa_brown_leather@1181,113,1444,300",
      "sofa_blue@58,424,333,623",
      "sofa_chesterfield@417,424,726,623",
      "sofa_sectional_cream@801,424,1092,623",
      "sofa_dark_gray@1161,424,1463,623",
      "sofa_cream_round@68,705,332,883",
      "sofa_bench_beige@432,705,691,883",
      "sofa_navy@792,705,1001,883",
      "ottoman_navy@1020,705,1123,883",
      "sofa_tan_tufted@1185,705,1440,883"
    )
    $manifest = switch ($Set) {
      "decor"   { $decor }
      "sofa"    { $sofa }
      default   { $cabinet }
    }
    $target = if ($Dest -ne "") { $Dest } else { Join-Path $Out "objects" }
    [SheetTool]::ExportEquipment($Src, $target, $manifest)
  }
  "extrasexport" {
    # Office extras sheet: printers, phone, water/coffee, fan, coat rack,
    # whiteboard, shredder and a meeting table (the equipment art it replaces
    # is still available, so only the missing pieces are exported here).
    $extras = @(
      "printer@207,285,346,455",
      "printer_fax@386,296,524,447",
      "phone_desk@563,305,704,451",
      "paper_tray@749,313,885,444",
      "wastebasket@943,304,1051,450",
      "water_dispenser@1137,265,1219,464",
      "coffee_maker@1304,288,1411,458",
      "fan_floor@224,499,335,699",
      "coat_rack@421,503,491,693",
      "whiteboard_stand@733,519,894,688",
      "shredder@1115,527,1236,682",
      "meeting_table@1279,524,1431,685"
    )
    $target = if ($Dest -ne "") { $Dest } else { Join-Path $Out "objects" }
    [SheetTool]::ExportEquipment($Src, $target, $extras)
  }
  "itexport" {
    # IT/server sheet: racks, network gear, camera, access control and UPS.
    $it = @(
      "server_racks_dual@41,37,347,281",
      "network_switch@74,344,295,442",
      "wifi_router@401,308,570,450",
      "nas_storage@659,341,837,450",
      "security_camera@897,316,1060,441",
      "access_controller@1164,316,1254,450",
      "fingerprint_scanner@112,497,226,646",
      "desktop_pc@1094,489,1311,629",
      "ups_battery@100,697,238,831",
      "external_drive@342,697,490,822",
      "ethernet_coil@589,701,757,830",
      "patch_panel@842,713,1038,815"
    )
    $target = if ($Dest -ne "") { $Dest } else { Join-Path $Out "objects" }
    [SheetTool]::ExportEquipment($Src, $target, $it)
  }
  "rackexport" {
    # Single detailed server cabinet from the dedicated rack sheet.
    $rack = @(
      "server_rack_tall@262,180,763,1326"
    )
    $target = if ($Dest -ne "") { $Dest } else { Join-Path $Out "objects" }
    [SheetTool]::ExportEquipment($Src, $target, $rack)
  }
}
