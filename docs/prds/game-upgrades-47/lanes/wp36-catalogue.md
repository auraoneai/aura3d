# WP-36 asset catalogue (GU47)

Generated 2026-10-30T11:16:34.539Z by `wp36-pipeline.mjs --catalogue` from `artifacts/gu47-meshy/_state/rows/`. Plan: [wp36-plan.md](wp36-plan.md). Paths are absolute in the wp36 worktree; `artifacts/` is gitignored, so wave-2 game lanes copy from `<slug>/_admit/models/<typedKey>.glb` (admitted, hashed) or re-admit `opt/model.glb` into their own asset folder.

Rows: 697; done 28, active 0, pending 669, deferred 0, failed 0, blocked 0.

Columns: optimized GLB (`aura3d assets optimize --role <role>`), rights evidence, admission profile, triangles, embedded textures, local bounds in metres (x, y, z), clips, isolated admission result (`import-meshy --into <slug>/_admit`), ledger reservation ids and Meshy task ids.

## G01 top-tennis (prefix `tennis`)

1 done of 36 planned (24 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `tennisSegTorso` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/top-tennis/tennisSegTorso/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/top-tennis/tennisSegTorso/rights.json` | prop | 12194 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.163 x 1.903 x 0.561 |  | admitted (candidate) `top_tennis_tennisSegTorso`; no blockers | preview:1793350743753-oh3gky refine:1793350782871-ykg8kt | preview:01a18c08-b8ed-7747-8be6-9bff9a89f1e6 refine:01a18c09-50fa-73b0-b0e0-eaf01c0be4e6 |
| `tennisSegPelvis` | text-to-3d | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | prop |  |  |  |  |  |  |  |

## G02 roadster-rush (prefix `apex`)

1 done of 17 planned (6 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `apexHeroCobalt` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/roadster-rush/apexHeroCobalt/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/roadster-rush/apexHeroCobalt/rights.json` | vehicle | 37512 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 0.833 x 0.522 x 2 |  | admitted (candidate) `roadster_rush_apexHeroCobalt`; 1 blocker(s): vehicle-parts:wheel-like geometry reaches only 0 corners; inspect wheel/body separation and collider plan / geometry changed | retexture:1793350389852-q9pla0 | retexture:01a18c03-589d-726b-b9af-eb07aba08989 |
| `apexRivalInterceptor` | text-to-3d | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | vehicle |  |  |  |  |  |  |  |

## G03 heatsink (prefix `thermal`)

1 done of 33 planned (26 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `thermalArchIron` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/heatsink/thermalArchIron/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/heatsink/thermalArchIron/rights.json` | environment | 608 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 2 x 1.913 x 0.375 |  | admitted (candidate) `heatsink_thermalArchIron`; no blockers / geometry changed | retexture:1793350743756-0essht | retexture:01a18c08-b8f0-776e-8724-0b2f347bc012 |
| `thermalTowerLIron` | retexture | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | environment |  |  |  |  |  |  |  |

## G04 teleoperator (prefix `dispatch`)

1 done of 31 planned (19 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `dispatchPodPearl` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/teleoperator/dispatchPodPearl/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/teleoperator/dispatchPodPearl/rights.json` | vehicle | 29479 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 0.938 x 1.486 x 2 |  | admitted (candidate) `teleoperator_dispatchPodPearl`; 1 blocker(s): vehicle-parts:wheel-like geometry reaches only 0 corners; inspect wheel/body separation and collider plan / geometry changed | retexture:1793350743758-x3ud8c | retexture:01a18c08-b9fd-7093-9aba-9b772b1ff46c |
| `dispatchFacadeVictorian` | retexture | P1 | pending: pool exhausted: retry after keys reset |  |  | environment |  |  |  |  |  |  |  |

## G05 iron-crown (prefix `crown`)

1 done of 49 planned (38 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `crownBrazierPylon` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/iron-crown/crownBrazierPylon/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/iron-crown/crownBrazierPylon/rights.json` | prop | 31018 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 0.826 x 1.904 x 0.832 |  | admitted (candidate) `iron_crown_crownBrazierPylon`; no blockers | preview:1793350550033-c4v0za refine:1793350589798-v2a337 | preview:01a18c05-c3c6-72c8-bd63-3baf0d63a1e5 refine:01a18c06-5e71-711b-a4d5-a38803b76764 |
| `crownForgeAnvil` | text-to-3d | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | prop |  |  |  |  |  |  |  |
| `crownTauntF1` | animate | P2 | pending: stopped before a new paid call |  |  | humanoid |  |  |  |  |  |  |  |
| `crownTauntF2` | animate | P2 | pending: stopped before a new paid call |  |  | humanoid |  |  |  |  |  |  |  |
| `crownTauntF3` | animate | P2 | pending: stopped before a new paid call |  |  | humanoid |  |  |  |  |  |  |  |
| `crownTauntF4` | animate | P2 | pending: stopped before a new paid call |  |  | humanoid |  |  |  |  |  |  |  |
| `crownTauntF5` | animate | P2 | pending: stopped before a new paid call |  |  | humanoid |  |  |  |  |  |  |  |
| `crownTauntF6` | animate | P2 | pending: stopped before a new paid call |  |  | humanoid |  |  |  |  |  |  |  |

## G06 pips-big-leap (prefix `leap`)

1 done of 55 planned (36 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `leapTileMossDisc` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/pips-big-leap/leapTileMossDisc/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/pips-big-leap/leapTileMossDisc/rights.json` | prop | 21164 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.901 x 0.323 x 1.894 |  | admitted (candidate) `pips_big_leap_leapTileMossDisc`; no blockers | preview:1793350744824-fisgph refine:1793350783526-qbtije | preview:01a18c08-bc7a-708a-8605-296902109dad refine:01a18c09-53a3-7294-bcac-b3f8de55a680 |
| `leapTileStump` | text-to-3d | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | prop |  |  |  |  |  |  |  |
| `leapPipRig` | rig | P2 | pending: transient: rig create exit 1: error: meshy api 503 on /rigging: {"detail":"busy"} meshy ap |  |  | humanoid |  |  |  |  |  |  |  |

## G07 aura-hoops-3d (prefix `blacktop`)

1 done of 44 planned (44 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `blacktopFloodlightRig` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/aura-hoops-3d/blacktopFloodlightRig/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/aura-hoops-3d/blacktopFloodlightRig/rights.json` | prop | 6064 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 0.695 x 2 x 0.687 |  | admitted (candidate) `aura_hoops_3d_blacktopFloodlightRig`; no blockers / geometry changed | retexture:1793350744828-kba4cj | retexture:01a18c08-bf09-7258-ba76-dba7ee699e4b |
| `blacktopHoopRig` | retexture | P1 | pending: pool exhausted: retry after keys reset |  |  | prop |  |  |  |  |  |  |  |

## G08 aura-diamond-3d (prefix `ballpark`)

1 done of 25 planned (22 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ballparkFanA` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/aura-diamond-3d/ballparkFanA/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/aura-diamond-3d/ballparkFanA/rights.json` | humanoid | 16874 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.062 x 1.903 x 1.242 |  | admitted (candidate) `aura_diamond_3d_ballparkFanA`; 1 blocker(s): humanoid-structure:No humanoid skeleton signals detected. | preview:1793350745700-vym4jc refine:1793350783863-kxulgm | preview:01a18c08-bff1-715f-bd5c-3d58cd41e718 refine:01a18c09-54f2-75ac-a0c1-03d9511e9664 |
| `ballparkFanB` | text-to-3d | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | humanoid |  |  |  |  |  |  |  |

## G09 aura-fc-3d (prefix `pitch`)

1 done of 29 planned (9 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `pitchStandModule` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/aura-fc-3d/pitchStandModule/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/aura-fc-3d/pitchStandModule/rights.json` | environment | 83822 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.903 x 0.847 x 0.563 |  | admitted (candidate) `aura_fc_3d_pitchStandModule`; no blockers | preview:1793350787746-t4brzq refine:1793350866634-5c7byd | preview:01a18c09-646f-7556-a52d-6074235ee1b7 refine:01a18c0a-997e-7103-9690-bfdbd94aebc1 |
| `pitchDugout` | text-to-3d | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | prop |  |  |  |  |  |  |  |

## G10 aura-links-3d (prefix `golf`)

1 done of 40 planned (16 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `golfMarram` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/aura-links-3d/golfMarram/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/aura-links-3d/golfMarram/rights.json` | prop | 159492 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.778 x 1.273 x 1.876 |  | admitted (candidate) `aura_links_3d_golfMarram`; 1 blocker(s): triangle-budget:159492 triangles exceed the prop candidate budget of 100000 | preview:1793350812121-pmqiw6 refine:1793350891454-cdtgbf | preview:01a18c09-c61e-7373-a611-1d786e321189 refine:01a18c0a-f96d-741c-8a26-ae2d142d62fb |
| `golfGorse` | text-to-3d | P1 | pending: pool exhausted: retry after keys reset |  |  | prop |  |  |  |  |  |  |  |

## G11 bunker-zero (prefix `bz`)

4 done of 27 planned (26 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `bzBlastDoor` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzBlastDoor/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzBlastDoor/rights.json` | environment | 27516 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.901 x 1.902 x 0.721 |  | admitted (candidate) `bunker_zero_bzBlastDoor`; no blockers | preview:1793350529078-qr1v7i refine:1793350566923-gyxqss | preview:01a18c05-7143-7592-a544-8707d1529973 refine:01a18c06-05e9-7474-898c-bfb9bf5cb9a4 |
| `bzFreightElevator` | text-to-3d | P1 | pending: pool exhausted: retry after keys reset |  |  | environment |  |  |  |  |  |  |  |
| `bzGuardRig` | rig | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzGuardRig/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzGuardRig/rights.json` | humanoid | 10059 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 0.958 x 1.8 x 0.77 | walk, run | admitted (candidate) `bunker_zero_bzGuardRig`; no blockers / anim fail | rig:1793351119198-c3m2th | rig:01a18c0e-7468-747b-b278-86d7b2914603 |
| `bzGunnerRig` | rig | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzGunnerRig/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzGunnerRig/rights.json` | humanoid | 9725 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.029 x 1.82 x 1.155 | walk, run | admitted (candidate) `bunker_zero_bzGunnerRig`; no blockers / anim fail | rig:1793351123670-7j82z4 | rig:01a18c0e-852d-7196-bfd9-4a769018c20e |
| `bzWardenRig` | rig | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzWardenRig/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/bunker-zero/bzWardenRig/rights.json` | humanoid | 9481 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.006 x 1.9 x 0.587 | walk, run | admitted (candidate) `bunker_zero_bzWardenRig`; no blockers / anim fail | rig:1793351137557-5al6tg | rig:01a18c0e-bb31-7624-8631-f87d0b3f39bd |
| `bzGuardAnim` | animate | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | humanoid |  |  |  |  |  |  |  |
| `bzGunnerAnim` | animate | P1 | pending: pool exhausted: retry after keys reset |  |  | humanoid |  |  |  |  |  |  |  |
| `bzWardenAnim` | animate | P1 | pending: pool exhausted: retry after keys reset |  |  | humanoid |  |  |  |  |  |  |  |

## G12 slingshot-siege (prefix `sling`)

1 done of 27 planned (21 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `slingSeaStackIsland` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/slingshot-siege/slingSeaStackIsland/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/slingshot-siege/slingSeaStackIsland/rights.json` | environment | 27778 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.903 x 1.506 x 1.903 |  | admitted (candidate) `slingshot_siege_slingSeaStackIsland`; no blockers | preview:1793350813074-5b5kv7 refine:1793350851949-4y6bly | preview:01a18c09-c7a4-754d-ba9a-dd88a1321272 refine:01a18c0a-601a-7067-b7cb-4d734dd52575 |
| `slingBlockWood` | text-to-3d | P1 | pending: pool exhausted: retry after keys reset |  |  | prop |  |  |  |  |  |  |  |

## G13 dot-dash-3d (prefix `dotdash`)

1 done of 16 planned (5 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `dotdashCourierPod` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/dot-dash-3d/dotdashCourierPod/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/dot-dash-3d/dotdashCourierPod/rights.json` | prop | 27550 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.327 x 1.902 x 0.758 |  | admitted (candidate) `dot_dash_3d_dotdashCourierPod`; no blockers | preview:1793350856158-5x1f9i refine:1793350894730-pcx653 | preview:01a18c0a-7039-7150-9413-c286511f58c6 refine:01a18c0b-0637-7752-8b7b-b16088c69507 |
| `dotdashSentryBeetle` | text-to-3d | P1 | pending: pool exhausted: retry after keys reset |  |  | prop |  |  |  |  |  |  |  |

## G14 cross-hop (prefix `xhop`)

1 done of 45 planned (30 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `xhopCoin` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/cross-hop/xhopCoin/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/cross-hop/xhopCoin/rights.json` | prop | 11268 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.902 x 1.902 x 0.319 |  | admitted (candidate) `cross_hop_xhopCoin`; no blockers | preview:1793350859091-twe9cx refine:1793350897689-2kisem | preview:01a18c0a-7b5a-7546-9a07-4908eb484aa2 refine:01a18c0b-1204-7242-83c1-d2b7a0d53389 |

## G15 strange-orbit-port (prefix `crater`)

1 done of 17 planned (9 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `craterBikeRider` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/strange-orbit-port/craterBikeRider/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/strange-orbit-port/craterBikeRider/rights.json` | vehicle | 50224 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 2 x 1.126 x 0.653 |  | admitted (candidate) `strange_orbit_port_craterBikeRider`; 1 blocker(s): vehicle-parts:wheel-like geometry reaches only 0 corners; inspect wheel/body separation and collider plan / geometry changed | retexture:1793350860227-0cnw05 | retexture:01a18c0a-835a-77ac-ae48-689d2f46b439 |

## G16 splat-rush-port (prefix `chroma`)

1 done of 9 planned (5 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `chromaPaintPotIsland` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/splat-rush-port/chromaPaintPotIsland/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/splat-rush-port/chromaPaintPotIsland/rights.json` | environment | 82460 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.715 x 1.428 x 1.901 |  | admitted (candidate) `splat_rush_port_chromaPaintPotIsland`; no blockers | preview:1793350928200-4tuxk1 refine:1793350987555-zile8q | preview:01a18c0b-8a18-7580-9e68-ed651c5bd04f refine:01a18c0c-7067-750d-8040-ff05010b3729 |

## G17 serpentine-sky-run-port (prefix `serp`)

1 done of 11 planned (11 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `serpSerpentHead` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/serpentine-sky-run-port/serpSerpentHead/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/serpentine-sky-run-port/serpSerpentHead/rights.json` | environment | 28202 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 0.618 x 1.042 x 1.891 |  | admitted (candidate) `serpentine_sky_run_port_serpSerpentHead`; no blockers | preview:1793350941621-83fnma refine:1793350979699-gughgw | preview:01a18c0b-bd3a-7120-a42d-c3750cfaa75d refine:01a18c0c-51ff-7131-9a79-6650c0a5a923 |

## G18 drift-and-deliver-port (prefix `gridlock`)

1 done of 22 planned (11 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `gridlockCourierTeal` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/drift-and-deliver-port/gridlockCourierTeal/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/drift-and-deliver-port/gridlockCourierTeal/rights.json` | vehicle | 37399 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 0.986 x 1.01 x 2 |  | admitted (candidate) `drift_and_deliver_port_gridlockCourierTeal`; 1 blocker(s): vehicle-parts:wheel-like geometry reaches only 0 corners; inspect wheel/body separation and collider plan / geometry changed | retexture:1793350963160-pwe7a6 | retexture:01a18c0c-12d0-748c-85fd-49bbbe58612b |

## G19 heatsink-port (prefix `ion`)

1 done of 9 planned (2 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ionSentryDrone` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/heatsink-port/ionSentryDrone/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/heatsink-port/ionSentryDrone/rights.json` | vehicle | 75644 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 1.715 x 1.259 x 1.903 |  | admitted (candidate) `heatsink_port_ionSentryDrone`; 1 blocker(s): vehicle-parts:wheel-like geometry reaches only 0 corners; inspect wheel/body separation and collider plan | preview:1793350983830-4ct0qd refine:1793351021851-078w65 | preview:01a18c0c-6259-753c-a441-30b03fbf18d2 refine:01a18c0c-f682-7213-86b2-e5932dbd101f |

## G20 ninja-runner-port (prefix `ninja`)

1 done of 26 planned (26 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ninjaHouseADusk` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/ninja-runner-port/ninjaHouseADusk/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/ninja-runner-port/ninjaHouseADusk/rights.json` | environment | 3764 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 2 x 1.679 x 1.04 |  | admitted (candidate) `ninja_runner_port_ninjaHouseADusk`; no blockers / geometry changed | retexture:1793351051270-vpy1ml | retexture:01a18c0d-6a8d-73d2-a4e8-ac9bbb3a9589 |

## G21 last-train-port (prefix `lamplight`)

1 done of 36 planned (36 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `lamplightTramEnamel` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/last-train-port/lamplightTramEnamel/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/last-train-port/lamplightTramEnamel/rights.json` | vehicle | 32917 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 2 x 1.223 x 0.703 |  | admitted (candidate) `last_train_port_lamplightTramEnamel`; 1 blocker(s): vehicle-parts:wheel-like geometry reaches only 0 corners; inspect wheel/body separation and collider plan / geometry changed | retexture:1793351031246-oz6rz9 | retexture:01a18c0d-2132-746a-8858-14d692c19fd1 |
| `lamplightRiderARig` | rig | P1 | pending: transient: rig create exit 1: error: meshy api 503 on /rigging: {"detail":"busy"} meshy ap |  |  | humanoid |  |  |  |  |  |  |  |
| `lamplightRiderBRig` | rig | P1 | pending: transient: rig create exit 1: error: meshy api 503 on /rigging: {"detail":"busy"} meshy ap |  |  | humanoid |  |  |  |  |  |  |  |
| `lamplightRiderCRig` | rig | P1 | pending: transient: rig create exit 1: error: meshy api 503 on /rigging: {"detail":"busy"} meshy ap |  |  | humanoid |  |  |  |  |  |  |  |
| `lamplightRiderDRig` | rig | P1 | pending: transient: rig create exit 1: error: meshy api 503 on /rigging: {"detail":"busy"} meshy ap |  |  | humanoid |  |  |  |  |  |  |  |

## G22 roadster-hours-port (prefix `saltwind`)

0 done of 33 planned (33 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `saltwindBusSalt` | retexture | P1 | pending: Prism refused while usable keys hold credits; retrying |  |  | vehicle |  |  |  |  |  |  |  |

## G23 where-the-wind-wanders-port (prefix `bell`)

1 done of 15 planned (12 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `bellKite` | text-to-3d | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/where-the-wind-wanders-port/bellKite/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/where-the-wind-wanders-port/bellKite/rights.json` | prop | 11096 | jpeg:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 1.033 x 1.893 x 0.094 |  | admitted (candidate) `where_the_wind_wanders_port_bellKite`; no blockers | preview:1793351054398-l8wvfc refine:1793351092387-jg96i7 | preview:01a18c0d-75b5-76df-a448-edb6254bcca4 refine:01a18c0e-0a3c-73ca-8cb3-7389ab2a19e7 |

## G24 silt-and-signal-port (prefix `dune`)

2 done of 30 planned (16 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `duneCourierOchre` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/silt-and-signal-port/duneCourierOchre/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/silt-and-signal-port/duneCourierOchre/rights.json` | humanoid | 12485 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 1.104 x 2 x 0.631 |  | admitted (candidate) `silt_and_signal_port_duneCourierOchre`; 1 blocker(s): humanoid-structure:No humanoid skeleton signals detected. / geometry changed | retexture:1793351055207-r0a5uq | retexture:01a18c0d-7a38-75c2-a7d1-390556fb11d8 |
| `duneCourierRig` | rig | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/silt-and-signal-port/duneCourierRig/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/silt-and-signal-port/duneCourierRig/rights.json` | humanoid | 12485 | png:1024x1024, jpeg:1024x1024, jpeg:1024x1024 | 0.966 x 1.75 x 0.553 | walk, run | admitted (candidate) `silt_and_signal_port_duneCourierRig`; no blockers / anim fail | rig:1793351114178-px0pyo | rig:01a18c0e-64a0-737b-8d58-77300a1d602c |
| `duneCourierAnim` | animate | P1 | pending: stopped before a new paid call |  |  | humanoid |  |  |  |  |  |  |  |

## G25 cloud-runner-port (prefix `cumulus`)

1 done of 15 planned (13 P1).

| Key | Op | Pri | Status | Optimized GLB | rights.json | Profile | Tris | Textures | Bounds | Clips | Admission | Ledger rids | Task ids |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `cumulusHeroTeal` | retexture | P1 | done | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/cloud-runner-port/cumulusHeroTeal/opt/model.glb` | `/Users/gurbakshchahal/platforms/aura3d-gu47/wp36/artifacts/gu47-meshy/cloud-runner-port/cumulusHeroTeal/rights.json` | humanoid | 12437 | jpeg:2048x2048, jpeg:2048x2048, jpeg:2048x2048 | 1.451 x 2 x 0.791 |  | admitted (candidate) `cloud_runner_port_cumulusHeroTeal`; 1 blocker(s): humanoid-structure:No humanoid skeleton signals detected. / geometry changed | retexture:1793351098218-yw8emc | retexture:01a18c0e-2636-717b-8d3c-f334be65ddb4 |

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
