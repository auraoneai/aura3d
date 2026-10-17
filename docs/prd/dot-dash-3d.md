# PRD — Dot Dash 3D

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Pac-Man (maze chase arcade)
- Engine surface: `mini-game` template, grid-maze world, pathing AI, `effects.*` trails/alerts, `game.evidence`
- Route: `/apps/showcase-dot-dash-3d/`

## TL;DR

The arcade legend reborn in 3D: dash through neon-lit mazes gobbling light-dots
while four Specters hunt you with distinct AI personalities. Grab a Power Orb,
flip the hunt. Clear every dot, master the maze, chase the fruit bonus.
Fifth-gen AI personalities in a glowing third-person maze.

## Why this title

- Pac-Man is arguably the most recognizable game mechanic ever made — everyone
  alive knows the rules before touching it.
- Grid AI (chase/scatter/frightened personalities) is a clean, demonstrable
  systems flex that costs little content.
- Third-person 3D maze = inherently prettier than top-down; trails and glow
  show off `effects.*` and looks.

## Fantasy & core loop

A little spark-orb named Byte wakes in the Grid — a maze-city of light-dots the
Specters patrol. Eat the circuit clean, dodge the hunt, and escape deeper into
the machine.

Loop: enter maze → eat dots, dodge Specters → Power Orb flips the hunt → clear
maze → faster/harder maze → fruit bonus → high score.

## Mode structure (shared shell)

| Shell slot | Dot Dash mapping |
| --- | --- |
| Quick Play | Maze 1 with 3 lives |
| Skill Lab | **Ghost School** — slow-mo practice maze showing each Specter's target tile live |
| Modes & Tour | **Circuit Map** — maze select + high scores; **Player Studio** (orb + trail color) |
| Venue switcher | Maze select (below) |

## Mechanics & controls

- Move: WASD/arrows — grid-snapped with buffered turns (the classic feel).
- Dash: Space — short burst, cooldown.
- Camera: third-person follow (slightly top-down, tilts with speed); optional
  overhead toggle.
- Specter AI — four personalities, ported faithfully:
  - **Red/Blitz**: targets your tile directly.
  - **Pink/Sly**: targets 4 tiles ahead of your heading.
  - **Cyan/Flick**: mirrors Red's position against your tile.
  - **Orange/Dim**: chases until close, then scatters to corner.
- States: chase/scatter wave timer, frightened on Power Orb (slow, edible,
  eyes-flee-home), eaten eyes return to spawn.
- Score: dots 10, orb 50, ghost chain 200/400/800/1600, fruit bonus per maze.
- Lives 3; maze clear → next layout with faster Specters.

## Content roster

**Mazes (5 + 1 exotic):** Classic Grid · Spiral Circuit · Twin-Tower Loop ·
Garden Overgrown (hedge walls) · Night Foundry (industrial) · **Zero-Core**
(exotic: wraparound-edge sphere-maze illusion inside a reactor ring).

Fruit schedule: cherry → strawberry → orange → apple → melon → star.

## Engine surface

- `mini-game` template; maze = grid-authored walls + instanced dot meshes.
- Specter pathing on grid (BFS to dynamic target tile each junction).
- `effects.*`: player trail ribbon, ghost fright-flash, power-orb pulse,
  eaten-eyes "walk home" path line.
- `looks`: dark base + emissive maze edges — neon readability is the whole
  look; one preset per maze.

## Asset plan

- Byte + 4 Specters: tiny characters — primitives-to-Meshy, ~3 clips each
  (idle, move, frightened/eyes).
- Mazes: procedurally generated from ASCII grids; wall kit + emissive trim.
- Audio: `packs/game-sfx-core` (chomp loop via short repeat, ghost siren via
  ambience loop, fright mode, fruit chime).

## Meshy access

All Meshy API calls go through the **Prism proxy** — pooled keys are injected
server-side; no raw `msy_...` key ever enters the repo, logs, or transcripts.

- **Endpoint:** `https://prism.auraone.ai/v1/meshy/openapi/v2/<op>` (e.g. `text-to-3d`, `openapi/v2/text-to-3d/{id}` for task status)
- **Auth:** `-H "X-Prism-Key: $(cat .prism_key.txt)"` — key file is gitignored; `x-api-key` and `Authorization: Bearer` are also accepted.
- **Rotation:** Prism rotates pooled keys on 401/402/403/429/5xx and pins task affinity — GET status and refine/remesh/rig calls route back to the owning key automatically.
- **Balance check:** `curl https://prism.auraone.ai/admin/meshy -H "X-Prism-Key: $(cat .prism_key.txt)"` → masked key ids + live monthly/permanent credits.
- **Raw keys (only if a call must run outside Prism):** `~/.local/bin/aws ssm get-parameter --name /kiro/prism/meshy-keys --with-decryption --region us-west-2 --query Parameter.Value --output text` via the default `auraone-production-operator` chain, or `/opt/prism/secrets/meshy-keys.json` on the host. Never write them anywhere else.
- **Repo admission path (per `meshy-cli` skill):** generate → download to `artifacts/meshy/<asset>/` → `aura3d assets import-meshy <dir> --name <n> --profile humanoid|vehicle|prop|environment --rights-evidence <json> --quality candidate` → `assets inspect --animation` → `validate-animation` → `assets typegen`.

## Look direction

"Tron garden": near-black world, emissive wall edges, warm dot glow, colored
Specters that read at 30m. Each maze recolors the emissive palette.

## Success metrics

- Specter personalities verifiably distinct (Ghost School visualizes targets).
- Buffered-turn movement feels arcade-tight at 60fps.
- Chase→frightened→chain-eat loop works every Power Orb.

## Out of scope

- Multiplayer/racing Pac-Versus modes, procedural infinite mazes, Ms.-branded
  content.

## Open questions

- Third-person tilt vs. pure overhead? (Ship both, default tilt.)
- Dash button: keep? It changes the classic risk/reward — optional toggle.

## Detailed tasklist

**Phase 0 — Spike:**
- [x] Scaffold `mini-game`; ASCII-grid maze → walls + dots + spawn points.
- [x] Grid movement: snap + buffered turns; no wall clipping at speed.

**Phase 1 — The hunt:**
- [x] Specter pathing: per-junction target-tile BFS; chase/scatter wave timer.
- [x] Four personalities implemented + Ghost School target-tile overlay.
- [x] Power Orb: frightened state, chain-eat scoring, eyes-return-home.

**Phase 2 — Mazes & systems:**
- [x] 6 maze layouts authored; fruit schedule; lives/respawn; maze progression.
- [x] Score/high-score persistence; dash mechanic + toggle.

**Phase 3 — Shell & polish:**
- [x] Shell wiring; HUD: score/lives/orb timer.
- [x] Trails, fright-flash, orb pulse VFX; per-maze looks; audio loop mix.

**Phase 4 — Evidence:**
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`.
- [ ] Showcase-index card + capture timeline (scripted maze-1 clear).

## Ship checklist

- [x] 6 mazes; classic + 5 variants + Zero-Core exotic.
- [x] All 4 Specter personalities live + demonstrable in Ghost School.
- [x] Power Orb chain-eat scoring works; fruit bonuses spawn.
- [x] Movement buffered-tight; dash optional.
- [ ] `validate --release` clean; `check-deploy` green.
- [ ] Preview + capture timeline shipped.
