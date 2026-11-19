# Game names

Status: 5.6.0 (2026-11-19). The site shows exactly 30 live games. The source of truth is `tools/site/games.catalog.json`; `node tools/site/gen-game-inventory.mjs` writes [`game-inventory.json`](game-inventory.json) (`--check` fails when it is stale), and no page may type a game count by hand. Every game supports `?autoplay=1` (the computer plays, shows the results and loops). Final screenshots live in `evidence/<evidenceFolder>/screens/final/`.

No title, page title, meta description, Open Graph or Twitter tag, HUD text, loading screen or index card uses "Aura3D port", "port", "reconstruction" or another game's name. The renamed ports are mapped in `tools/showcase-port-pages/names.json`; `node tools/showcase-port-pages/rename.mjs` applies it (idempotent) and `node tools/showcase-port-pages/sync.mjs` recomposes the app pages. New games add a row to the catalog and to this table.

## The 30 live games

| Public name | App folder | Play URL | Guide page | Genre | Final screens | One-line pitch |
|---|---|---|---|---|---|---|
| Aura Slam 3D | `apps/showcase-top-tennis` | `/apps/showcase-top-tennis/` | `/games/top-tennis/` | Sports | `evidence/aura-slam/screens/final/` | Serve on grass, rally on clay, then take your game to the Moon. |
| Apex Overdrive | `apps/showcase-roadster-rush` | `/apps/showcase-roadster-rush/` | `/games/roadster-rush/` | Racing | `evidence/apex-overdrive/screens/final/` | Thread sunset traffic, hit a ramp and take the race above the freeway. |
| Thermal Drift | `apps/showcase-heatsink` | `/apps/showcase-heatsink/` | `/games/heatsink/` | Racing | `evidence/thermal-drift/screens/final/` | Push an anti-gravity drone through a rain-lit city. Stay on the throttle and watch the heat rise. |
| Grid Dispatch | `apps/showcase-teleoperator` | `/apps/showcase-teleoperator/` | `/games/teleoperator/` | Racing | `evidence/teleoperator/screens/final/` | Take the wheel of a San Francisco robotaxi and bring each fare to the right curb. |
| Iron Crown | `apps/showcase-iron-crown` | `/apps/showcase-iron-crown/` | `/games/iron-crown/` | Action | `evidence/iron-crown/screens/final/` | Step into a best-of-three arena fight. Read the guard, close the gap and spend your meter at the right moment. |
| Pip's Big Leap | `apps/showcase-pips-big-leap` | `/apps/showcase-pips-big-leap/` | `/games/pips-big-leap/` | Platformer | `evidence/pips-big-leap/screens/final/` | Double-jump, dive and glide across six worlds in search of sun-seeds. |
| Aura Hoops 3D | `apps/showcase-aura-hoops-3d` | `/apps/showcase-aura-hoops-3d/` | `/games/aura-hoops-3d/` | Sports | `evidence/aura-hoops-3d/screens/final/` | Call for the ball, cross over a defender and release your shot on a street court. |
| Aura Diamond 3D | `apps/showcase-aura-diamond-3d` | `/apps/showcase-aura-diamond-3d/` | `/games/aura-diamond-3d/` | Sports | `evidence/aura-diamond-3d/screens/final/` | Read the pitch and find the sweet spot. Take a three-inning game from a sandlot to a lunar ballpark. |
| Aura FC 3D | `apps/showcase-aura-fc-3d` | `/apps/showcase-aura-fc-3d/` | `/games/aura-fc-3d/` | Sports | `evidence/aura-fc-3d/screens/final/` | Play five-a-side from a neighborhood cage to an ice-lit arena. Curl a finisher past the keeper. |
| Aura Links 3D | `apps/showcase-aura-links-3d` | `/apps/showcase-aura-links-3d/` | `/games/aura-links-3d/` | Sports | `evidence/aura-links-3d/screens/final/` | Pick a club, read the wind and time a three-click swing across six courses. |
| Bunker Zero | `apps/showcase-bunker-zero` | `/apps/showcase-bunker-zero/` | `/games/bunker-zero/` | Action | `evidence/showcase-bunker-zero/screens/final/` | Find the key, spot the false wall and fight your way through six floors of a retro bunker. |
| Slingshot Siege | `apps/showcase-slingshot-siege` | `/apps/showcase-slingshot-siege/` | `/games/slingshot-siege/` | Action | `evidence/slingshot-siege/screens/final/` | Pull back, let go and watch the tower come apart. Choose your ammunition across 30 stages. |
| Glint Courier | `apps/showcase-dot-dash-3d` | `/apps/showcase-dot-dash-3d/` | `/games/dot-dash-3d/` | Arcade | `evidence/dot-dash-3d/screens/final/` | Sweep six glowing circuit boards for data shards while four sentries close in. |
| Cross Hop | `apps/showcase-cross-hop` | `/apps/showcase-cross-hop/` | `/games/cross-hop/` | Platformer | `evidence/cross-hop/screens/final/` | Time a hop between cars, balance on a river log and keep moving before the hawk arrives. |
| Craterline GP | `apps/showcase-strange-orbit-port` | `/apps/craterline-gp/` | `/games/craterline-gp/` | Racing | `evidence/strange-orbit-port/screens/final/` | Race a bike around a lunar rim. Split off the main line and find your way back to the surface. |
| Splat | `apps/showcase-splat-rush-port` | `/apps/chroma-roll/` | `/games/chroma-roll/` | Platformer | `evidence/splat-rush-port/screens/final/` | Guide a rolling ball through matching color gates and leave a splash on the course. |
| Serpentine Sky Run | `apps/showcase-serpentine-sky-run-port` | `/apps/serpentine-sky-run/` | `/games/serpentine-sky-run/` | Platformer | `evidence/saiyan-snake-way-port/screens/final/` | Follow a twisting road through the sky. Boost through the straights and keep your footing as the track rolls. |
| Gridlock Courier | `apps/showcase-drift-and-deliver-port` | `/apps/gridlock-courier/` | `/games/gridlock-courier/` | Racing | `evidence/drift-and-deliver-port/screens/final/` | Slide around city blocks, scoop up coins and weave between lines of traffic. |
| Ion Circuit | `apps/showcase-heatsink-port` | `/apps/ion-circuit/` | `/games/ion-circuit/` | Racing | `evidence/heatsink-port/screens/final/` | Chase a better solo time through the Vesper canyon. Trade heat for speed and leave room to cool down. |
| Shadowstep Gauntlet | `apps/showcase-ninja-runner-port` | `/apps/shadowstep-gauntlet/` | `/games/shadowstep-gauntlet/` | Action | `evidence/ninja-runner-port/screens/final/` | Dodge rooftop hazards and gather a line of clones for the fight at the end of the course. |
| Lamplight Line | `apps/showcase-last-train-port` | `/apps/lamplight-line/` | `/games/lamplight-line/` | Racing | `evidence/last-train-port/screens/final/` | Drive a tram through a changing day, picking up passengers and bringing them home. |
| Saltwind Highway | `apps/showcase-roadster-hours-port` | `/apps/saltwind-highway/` | `/games/saltwind-highway/` | Racing | `evidence/roadster-hours-port/screens/final/` | Follow a coastal highway over jumps, around traffic and through relay gates. |
| The Bellkeeper's Walk | `apps/showcase-where-the-wind-wanders-port` | `/apps/the-bellkeepers-walk/` | `/games/the-bellkeepers-walk/` | Arcade | `evidence/where-the-wind-wanders-port/screens/final/` | Walk the meadow, collect three letters and ring the bell above the valley. |
| Duneglide | `apps/showcase-silt-and-signal-port` | `/apps/duneglide/` | `/games/duneglide/` | Arcade | `evidence/silt-and-signal-port/screens/final/` | Bank a glider over the dunes and pick a line between ring beacons and ruins. |
| Cumulus Dash | `apps/showcase-cloud-runner-port` | `/apps/cumulus-dash/` | `/games/cumulus-dash/` | Platformer | `evidence/kid-goku-beyond-the-clouds-port/screens/final/` | Ride a cloud through a sky course of creatures and boulders, then face the duel ahead. |
| Shape Shift Sprint | `apps/showcase-shape-shift-sprint` | `/apps/showcase-shape-shift-sprint/` | `/games/shape-shift-sprint/` | Platformer | `evidence/shape-shift-sprint/screens/final/` | Thread a sphere, cube or cone through its matching cutout. A morph pickup changes the next decision. |
| Number Surge | `apps/showcase-number-surge` | `/apps/showcase-number-surge/` | `/games/number-surge/` | Platformer | `evidence/number-surge/screens/final/` | Take the better arithmetic gate, build your number and break through the boss wall. |
| Splat Turf | `apps/showcase-splat-turf` | `/apps/showcase-splat-turf/` | `/games/splat-turf/` | Arcade | `evidence/splat-turf/screens/final/` | Paint your way along six lanes. Keep the tank topped up and protect your trail from eraser bots. |
| Polarity Orbs | `apps/showcase-polarity-orbs` | `/apps/showcase-polarity-orbs/` | `/games/polarity-orbs/` | Arcade | `evidence/polarity-orbs/screens/final/` | Flip between red and blue to collect matching orbs. Time the switch as the opposite charge approaches. |
| Beat Hopper | `apps/showcase-beat-hopper` | `/apps/showcase-beat-hopper/` | `/games/beat-hopper/` | Platformer | `evidence/beat-hopper/screens/final/` | Jump, duck and change lanes to a 132 BPM pulse. Clear the next crate on the beat. |

Folder names, package names, test ids and `window.__AURA_*__` hooks keep their old identifiers. The guide path is derived by `tools/site/game-guide.mjs` (last URL segment, `showcase-` prefix dropped).

## Index game renamed: Dot Dash 3D is now Glint Courier

| Old | New | App folder | Pitch |
|---|---|---|---|
| Dot Dash 3D | Glint Courier | `apps/showcase-dot-dash-3d` (slug unchanged) | Guide a courier drone across six circuit boards, collect data shards, trigger surge cells to overload four patrol sentries (hunter, ambusher, drifter, skittish) and cash in cache gems. |

Identity changes (art and wording only; the buffered grid movement and patrol routines are generic mechanics): new hero, four sentries with distinct silhouettes, datachip pickups, surge cells, gem bonuses, new board layouts and new mode, score and HUD wording. 5.6.0 redesigned the look as a top-down arcade board (flat, saturated emissive characters on a dark board). Not trademark clearance.

## Name check

The eleven renamed ports were screened through Kiro Prism's web search (`evidence/game-names/web-check.txt`): an exact-name query, then a query restricted to Steam, itch.io, the App Store, Google Play and CrazyGames. No exact-name game, app or brand turned up. The search backend returns noisy, low-signal results for unusual phrases, so this is a screen and not trademark clearance; run a USPTO, EUIPO or TMview search before registering any name.

## Redirects

Production is Cloudflare Pages. `marketing/public/_redirects` sends each old `/apps/showcase-<slug>-port/` root to the new public URL (301); `vercel.json` keeps the same rewrites for the legacy host. Asset paths under the old folder keep serving directly, so cached pages do not break.

## Credit line

Each game shows one neutral credit: "Built with Aura3D · independent game, not affiliated with any other game or studio", linking to the showcase index. The longer limits and replay-verification statements live on the index cards and in each app's `route-health.json`.
