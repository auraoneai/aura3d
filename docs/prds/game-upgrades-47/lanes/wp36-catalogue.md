# WP-36 asset catalogue (GU47)

Generated 2026-10-30T08:59:53.431Z by `wp36-pipeline.mjs --catalogue` from `artifacts/gu47-meshy/_state/rows/`. Plan: [wp36-plan.md](wp36-plan.md). Paths are absolute in the wp36 worktree; `artifacts/` is gitignored, so wave-2 game lanes copy from `<slug>/_admit/models/<typedKey>.glb` (admitted, hashed) or re-admit `opt/model.glb` into their own asset folder.

Rows: 697; done 4, active 6, pending 687, deferred 0, failed 0, blocked 0.

Columns: optimized GLB (`aura3d assets optimize --role <role>`), rights evidence, admission profile, triangles, embedded textures, local bounds in metres (x, y, z), clips, isolated admission result (`import-meshy --into <slug>/_admit`), ledger reservation ids and Meshy task ids.

## G01 top-tennis (prefix `tennis`)

0 done of 36 planned (24 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `tennisSegTorso` | text-to-3d | P1 | active |  |  | prop |  |  |  |  |  | preview:1793350743753-oh3gky refine:1793350782871-ykg8kt | preview:01a18c08-b8ed-7747-8be6-9bff9a89f1e6 refine:01a18c09-50fa-73b0-b0e0-eaf01c0be4e6 |

## G02 roadster-rush (prefix `apex`)

1 done of 17 planned (6 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `apexHeroCobalt` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/roadster-rush/apexHeroCobalt/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/roadster-rush/apexHeroCobalt/rights.json` | vehicle | 37512 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 0.833 x 0.522 x 2 |  | admitted (candidate) `roadster_rush_apexHeroCobalt`; 1 blocker(s): vehicle-parts:wheel-like geometry reaches only 0 corners; inspect wheel/body separation and collider plan / geometry changed | retexture:1793350389852-q9pla0 | retexture:01a18c03-589d-726b-b9af-eb07aba08989 |

## G03 heatsink (prefix `thermal`)

1 done of 33 planned (26 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `thermalArchIron` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/heatsink/thermalArchIron/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/heatsink/thermalArchIron/rights.json` | environment | 608 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 2 x 1.913 x 0.375 |  | admitted (candidate) `heatsink_thermalArchIron`; no blockers / geometry changed | retexture:1793350743756-0essht | retexture:01a18c08-b8f0-776e-8724-0b2f347bc012 |

## G04 teleoperator (prefix `dispatch`)

0 done of 31 planned (19 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `dispatchPodPearl` | retexture | P1 | active |  |  | vehicle |  |  |  |  |  | retexture:1793350743758-x3ud8c | retexture:01a18c08-b9fd-7093-9aba-9b772b1ff46c |

## G05 iron-crown (prefix `crown`)

1 done of 49 planned (38 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `crownBrazierPylon` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/iron-crown/crownBrazierPylon/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/iron-crown/crownBrazierPylon/rights.json` | prop | 31018 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 0.826 x 1.904 x 0.832 |  | admitted (candidate) `iron_crown_crownBrazierPylon`; no blockers | preview:1793350550033-c4v0za refine:1793350589798-v2a337 | preview:01a18c05-c3c6-72c8-bd63-3baf0d63a1e5 refine:01a18c06-5e71-711b-a4d5-a38803b76764 |

## G06 pips-big-leap (prefix `leap`)

0 done of 55 planned (36 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `leapTileMossDisc` | text-to-3d | P1 | active |  |  | prop |  |  |  |  |  | preview:1793350744824-fisgph refine:1793350783526-qbtije | preview:01a18c08-bc7a-708a-8605-296902109dad refine:01a18c09-53a3-7294-bcac-b3f8de55a680 |

## G07 aura-hoops-3d (prefix `blacktop`)

0 done of 44 planned (44 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `blacktopFloodlightRig` | retexture | P1 | active |  |  | prop |  |  |  |  |  | retexture:1793350744828-kba4cj | retexture:01a18c08-bf09-7258-ba76-dba7ee699e4b |

## G08 aura-diamond-3d (prefix `ballpark`)

0 done of 25 planned (22 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ballparkFanA` | text-to-3d | P1 | active |  |  | humanoid |  |  |  |  |  | preview:1793350745700-vym4jc refine:1793350783863-kxulgm | preview:01a18c08-bff1-715f-bd5c-3d58cd41e718 refine:01a18c09-54f2-75ac-a0c1-03d9511e9664 |

## G09 aura-fc-3d (prefix `pitch`)

0 done of 29 planned (9 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `pitchStandModule` | text-to-3d | P1 | active |  |  | environment |  |  |  |  |  | preview:1793350787746-t4brzq | preview:01a18c09-646f-7556-a52d-6074235ee1b7 |

## G10 aura-links-3d (prefix `golf`)

0 done of 40 planned (16 P1).

Not started.

## G11 bunker-zero (prefix `bz`)

1 done of 27 planned (26 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `bzBlastDoor` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzBlastDoor/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzBlastDoor/rights.json` | environment | 27516 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.901 x 1.902 x 0.721 |  | admitted (candidate) `bunker_zero_bzBlastDoor`; no blockers | preview:1793350529078-qr1v7i refine:1793350566923-gyxqss | preview:01a18c05-7143-7592-a544-8707d1529973 refine:01a18c06-05e9-7474-898c-bfb9bf5cb9a4 |

## G12 slingshot-siege (prefix `sling`)

0 done of 27 planned (21 P1).

Not started.

## G13 dot-dash-3d (prefix `dotdash`)

0 done of 16 planned (5 P1).

Not started.

## G14 cross-hop (prefix `xhop`)

0 done of 45 planned (30 P1).

Not started.

## G15 strange-orbit-port (prefix `crater`)

0 done of 17 planned (9 P1).

Not started.

## G16 splat-rush-port (prefix `chroma`)

0 done of 9 planned (5 P1).

Not started.

## G17 serpentine-sky-run-port (prefix `serp`)

0 done of 11 planned (11 P1).

Not started.

## G18 drift-and-deliver-port (prefix `gridlock`)

0 done of 22 planned (11 P1).

Not started.

## G19 heatsink-port (prefix `ion`)

0 done of 9 planned (2 P1).

Not started.

## G20 ninja-runner-port (prefix `ninja`)

0 done of 26 planned (26 P1).

Not started.

## G21 last-train-port (prefix `lamplight`)

0 done of 36 planned (36 P1).

Not started.

## G22 roadster-hours-port (prefix `saltwind`)

0 done of 33 planned (33 P1).

Not started.

## G23 where-the-wind-wanders-port (prefix `bell`)

0 done of 15 planned (12 P1).

Not started.

## G24 silt-and-signal-port (prefix `dune`)

0 done of 30 planned (16 P1).

Not started.

## G25 cloud-runner-port (prefix `cumulus`)

0 done of 15 planned (13 P1).

Not started.

## Impostor candidates (phase 2, needs a browser)

Background (`role: background`) rows are the impostor-bake candidates; baking runs in phase 2 on the remote runner:

- top-tennis: `tennisScoreboardFrame`, `tennisFloodMast`, `tennisStandArena`, `tennisStandGarden`, `tennisStandClay`, `tennisStandDesert`, `tennisStandBeach`, `tennisLunarDome`, `tennisLunarLander`, `tennisLifeguardTower`
- roadster-rush: `apexTowerA`, `apexTowerB`, `apexTowerC`, `apexDeckPylon`, `apexInterchangeSpan`, `apexBillboardFrame`
- heatsink: `thermalArchIron`, `thermalTowerLIron`, `thermalTowerTIron`, `thermalTowerXIron`, `thermalOverpassIron`, `thermalBarrierIron`, `thermalStatueIron`, `thermalGantrySteel`, `thermalTunnelSteel`, `thermalBillboardSteel`, `thermalRingSteel`, `thermalCanisterSteel`, `thermalBarrelSteel`, `thermalEmitterSteel`, `thermalLavaFallSteel`, `thermalFinWall`, `thermalCoolingTower`, `thermalSmokestacks`, `thermalLadleCrane`, `thermalPipeOverpass`, `thermalWaterTower`, `thermalAqueductArch`, `thermalCrystalSpire`, `thermalCausewayPylon`, `thermalReactorRing`
- teleoperator: `dispatchFacadeVictorian`, `dispatchFacadeMidrise`, `dispatchFacadeGlass`, `dispatchFacadeArtDeco`, `dispatchPyramidTower`, `dispatchGlassTower`, `dispatchBridgeTower`, `dispatchBridgeDeck`, `dispatchBuildingA`, `dispatchBuildingB`
- iron-crown: `crownHarbourCrane`, `crownFishingBoat`, `crownHangarPlane`, `crownTempleGate`, `crownShrine`, `crownHall`, `crownTowerA`, `crownTowerB`, `crownBackdropRidge`, `crownBackdropWall`, `crownSkylineBlockA`, `crownSkylineBlockB`, `crownSkylineBlockC`, `crownLightTruss`, `crownDais`
- pips-big-leap: `leapBaseGarden`, `leapBaseCanopy`, `leapBaseMillpond`, `leapBaseMeadow`, `leapBaseCellar`, `leapBaseHollow`, `leapLandmarkHollowOak`, `leapLandmarkMillWheel`, `leapLandmarkDandelion`, `leapLandmarkChimney`, `leapLandmarkThroneTree`, `leapLandmarkMoonTree`
- aura-hoops-3d: `blacktopBleacher`, `blacktopLightGantry`, `blacktopMuralWall`, `blacktopLifeguardTower`, `blacktopParapet`, `blacktopCorrugatedRoof`, `blacktopStationRib`, `blacktopMaglevStanchion`, `blacktopScaffold`, `blacktopContainer`
- aura-diamond-3d: `ballparkLighthouse`, `ballparkHoodoo`, `ballparkMesa`, `ballparkWaterTower`, `ballparkSignFrame`, `ballparkBrickFacade`, `ballparkManualScoreboard`, `ballparkRowhouseRoof`, `ballparkDomeTruss`, `ballparkHabitat`
- aura-fc-3d: `pitchStandModule`, `pitchPlayerTunnel`, `pitchHillHouses`, `pitchLifeguardTower`, `pitchShrineGate`, `pitchIceRidge`, `pitchDomeFrost`
- aura-links-3d: `golfLighthouse`, `golfClubhouse`, `golfBasaltColumns`, `golfCableCarStation`, `golfHarbourCrane`, `golfLander`, `golfDyke`, `golfCalderaRidge`, `golfSkylineBackdrop`, `golfEarthDisc`
- bunker-zero: `bzBlastDoor`, `bzFreightElevator`, `bzPushWallPanel`, `bzConcretePillar`
- slingshot-siege: `slingSeaStackIsland`, `slingLighthouseIslet`, `slingQuarryCrane`, `slingGreenhouseFrame`, `slingCurtainWall`, `slingCrystalCrater`
- strange-orbit-port: `craterLander`, `craterObservatory`, `craterGateArch`, `craterPaddockDome`, `craterGrandstand`
- splat-rush-port: `chromaPaintPotIsland`, `chromaPaletteIsland`, `chromaTubeBalloon`, `chromaCrayonSpire`, `chromaEaselIsland`
- serpentine-sky-run-port: `serpSerpentHead`, `serpPavilion`, `serpSpireA`, `serpSpireB`, `serpSpireC`, `serpStageGate`
- drift-and-deliver-port: `gridlockHarbourCranes`, `gridlockBoats`, `gridlockHotel`, `gridlockFunicular`, `gridlockMarketHall`
- heatsink-port: `ionRibcageArch`, `ionCliffDwelling`, `ionNeedleSpire`
- ninja-runner-port: `ninjaHouseADusk`, `ninjaHouseBDusk`, `ninjaHouseCDusk`, `ninjaHouseDDusk`, `ninjaTeahouseDusk`, `ninjaTowerDusk`, `ninjaGateDusk`, `ninjaWaterWheel`, `ninjaShrineGate`, `ninjaPagodaSilhouette`
- last-train-port: `lamplightUndersideA`, `lamplightUndersideB`, `lamplightUndersideC`, `lamplightHorizonIslandA`, `lamplightHorizonIslandB`
- roadster-hours-port: `saltwindLighthouseSalt`, `saltwindTownhouseSalt`, `saltwindVillaSalt`, `saltwindVilla2Salt`, `saltwindTurbineTower`, `saltwindSeaStack`, `saltwindCrane`, `saltwindSaltPan`, `saltwindMesa`, `saltwindArch`, `saltwindHoodoo`, `saltwindArcology`, `saltwindMaglevTube`, `saltwindGantrySign`, `saltwindRelayGantry`
- where-the-wind-wanders-port: `bellCottageGouache`, `bellBelltowerGouache`
- silt-and-signal-port: `duneAdobeA`, `duneAdobeB`, `duneAdobeC`, `duneSilhouetteMesa`, `duneSilhouetteArch`, `duneSluiceGate`, `duneSearchlightTower`, `duneRootArch`, `duneCoralSpires`, `dunePollenSail`, `duneCrownArch`, `duneHarbourBridge`, `duneWellHouse`
- cloud-runner-port: `cumulusTowerA`, `cumulusTowerB`, `cumulusTowerC`, `cumulusDeckA`, `cumulusDeckB`, `cumulusBridge`, `cumulusHut`, `cumulusArch`
