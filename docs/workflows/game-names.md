# Game names

Status: 2026-10-24. Every playable game on the showcase index carries its own name. No title, page title, meta description, Open Graph or Twitter tag, HUD text, loading screen or index card uses "Aura3D port", "port", "reconstruction" or another game's name. The mapping lives in `tools/showcase-port-pages/names.json`; `node tools/showcase-port-pages/rename.mjs` applies it (idempotent) and `node tools/showcase-port-pages/sync.mjs` recomposes the app pages.

| App folder (unchanged) | Public name | Public URL | One-line pitch |
|---|---|---|---|
| `apps/showcase-strange-orbit-port` | Craterline GP | `/apps/craterline-gp/` | Moon-rim bike racing: a seven-lap cup against five rivals, with route splits, checkpoints and a rescue budget. |
| `apps/showcase-splat-rush-port` | Chroma Roll | `/apps/chroma-roll/` | Colour-gate ball runner: switch colour to pass gates, grab power-ups and avoid the splatter game over. |
| `apps/showcase-serpentine-sky-run-port` | Serpentine Sky Run | `/apps/serpentine-sky-run/` | Endless runner on a winding sky road: eight stages with boost rungs, roll sections and traffic hazards. |
| `apps/showcase-drift-and-deliver-port` | Gridlock Courier | `/apps/gridlock-courier/` | Arcade drift driving through a block city: coin pickups, 84 traffic cars, bloom and a chase camera. |
| `apps/showcase-heatsink-port` | Ion Circuit | `/apps/ion-circuit/` | Anti-gravity time trial with boost pads, pickups, barrels and heat management. |
| `apps/showcase-ninja-runner-port` | Shadowstep Gauntlet | `/apps/shadowstep-gauntlet/` | Lane-running combat with a dozen skinned clones, form changes and a full course finish. |
| `apps/showcase-last-train-port` | Lamplight Line | `/apps/lamplight-line/` | Tram-driving loop with day and night, passengers, fares and tips. |
| `apps/showcase-roadster-hours-port` | Saltwind Highway | `/apps/saltwind-highway/` | Coastal highway drive with jumps, traffic and relay gates: 33 to 35 vehicles per route in batched meshes, with sun shadows, sky and ocean. |
| `apps/showcase-where-the-wind-wanders-port` | The Bellkeeper's Walk | `/apps/the-bellkeepers-walk/` | Meadow walk: collect three letters and ring the bell. |
| `apps/showcase-silt-and-signal-port` | Duneglide | `/apps/duneglide/` | Free-ride flight over a silt world, through ring beacons. |
| `apps/showcase-cloud-runner-port` | Cumulus Dash | `/apps/cumulus-dash/` | Obstacle runner on a cloud: creatures, boulders, a duel and a finale. |

The other index games already have their own names (Aura Slam 3D, Apex Overdrive, Thermal Drift, Grid Dispatch and so on) and were not renamed in this pass; their titles still carry an "Aura3D Showcase" suffix.

## Index game renamed: Dot Dash 3D is now Glint Courier

| Old | New | App folder | Pitch |
|---|---|---|---|
| Dot Dash 3D | Glint Courier | `apps/showcase-dot-dash-3d` (slug unchanged) | Guide a courier drone across six circuit boards, collect data shards, trigger surge cells to overload four patrol sentries (hunter, ambusher, drifter, skittish) and cash in cache gems. |

Identity changes (art and wording only; the buffered grid movement and patrol routines are generic mechanics): new hero (faceted drone core with a spinning ring), four sentries with distinct silhouettes (cone, cube, ring, saucer), datachip pickups, surge cells, gem bonuses, new board layouts (Relay Grid, Smelter Rows and Overgrowth redrawn; Coil Loop, Twin Pylons and Zero-Core renamed), a graphite board with amber and cyan traces, and new mode, score and HUD wording. Not trademark clearance.

## Name check

Each name was screened through Kiro Prism's web search (`evidence/game-names/web-check.txt`): an exact-name query, then a query restricted to Steam, itch.io, the App Store, Google Play and CrazyGames. No exact-name game, app or brand turned up for any of the eleven. The search backend returns noisy, low-signal results for unusual phrases, so this is a screen and not trademark clearance; run a USPTO, EUIPO or TMview search before registering any name.

## Redirects

`vercel.json` rewrites each new slug to its existing app folder and 308-redirects the old `/apps/showcase-<slug>-port/` root to the new URL. Asset paths under the old folder keep serving directly, so cached pages do not break. Folder names, package names, test ids and `window.__AURA_*__` hooks keep their old identifiers.

## Credit line

Each game shows one neutral credit: "Built with Aura3D · independent game, not affiliated with any other game or studio", linking to the showcase index. The longer limits and replay-verification statements live on the index cards and in each app's `route-health.json`.
