# PRD — Cross Hop

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Frogger / Crossy Road (lane-crossing hopper)
- Engine surface: `game.platformer` (lane variant), `mini-game` template, `game.evidence`
- Route: `/apps/showcase-cross-hop/`

## TL;DR

The eternal "why did the critter cross the road" — a 3D endless lane-hopper:
cars, trams, rivers, trains, and one brave little Hop crossing them all.
Procedural lanes scroll forever; every hop is one point; every world remixed
the hazards. High-score chase with collectible critters.

## Why this title

- Crossy Road proved the lane-hopper is a top-10 casual mechanic worldwide.
- Endless procedural content = near-zero authoring cost per level; the whole
  game is systems.
- One-button simplicity makes it the most accessible game in the slate and the
  best mobile/touch showcase.

## Fantasy & core loop

Hop the critter wants the far side. The far side is always one more hop.
Traffic, rivers, trains, lava — hop fast, hop smart, don't become road art.

Loop: hop forward lane by lane → dodge/route hazards → grab coins + friend
rescue pods → score climbs → world theme shifts every 25 hops → splat, retry,
beat your best.

## Mode structure (shared shell)

| Shell slot | Cross Hop mapping |
| --- | --- |
| Quick Play | Endless run, Meadow world start |
| Skill Lab | **Timing School** — fixed pattern drills: traffic gaps, log hops, train dodges |
| Modes & Tour | **Critterdex** — unlockable critters; **World Tour** — endless with theme shifts; **Player Studio** |
| Venue switcher | Starting world theme (below) |

## Mechanics & controls

- Hop: arrows/WASD (4-dir hop) or swipe; auto-camera trails behind.
- Idle too long → a hawk shadow descends (pressure mechanic).
- Lane types: road (vehicles at speed/dir), tram track (telegraphed sweep),
  river (logs/lilypads — standing on water = death), rail (train with horn
  warning), lava (moving safe stones), meadow (free rest).
- Scoring: +1 per forward hop, coin +10, rescue pod +50 & new critter unlock.
- Difficulty: lane speed/density ramps with distance; theme shift every 25.
- Death states: squashed / drowned / burned / hawk-snatched — each a beat.

## Content roster

**Worlds (5 + 1 exotic):** Meadow Roads · Downtown Trams · Riverbend ·
Emberline (lava + rail) · Neon District · **Critter Core** (exotic: candy/
arcade mashup lanes for post-100-hop players).

**Critters (12 launch):** Hop (frog), Chick, Turtle, Bun, Axolotl, Ducky,
Robo-Frog, Toast Cat, Mushroom Kid, Knight Toad, Astro-Frog, Golden Hop.

## Engine surface

- `mini-game` template + lane-streaming world generator (segment pool per
  theme, recycled ahead/behind camera).
- Vehicle/log/train movers: pooled kinematic bodies on splines; hazard volumes.
- `effects.*`: squash stretch on hop, coin sparkle, hawk shadow vignette,
  splat poof.
- `looks`: one preset per theme; day-night drift as score climbs.

## Asset plan

- Critters: Meshy small-creature batch (12 × ~2 clips) or catalog animals.
- Vehicles per theme: catalog vehicles (we already have car GLBs from the
  racing catalog!) reused as hazards — free cross-game asset.
- Terrain: flat lane strips + theme dressing; nearly free.

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

Chunky toy-world voxel-ish charm, saturated per-theme palettes, big readable
hazard silhouettes. Camera low-ish behind Hop for depth-of-lanes read.

## Success metrics

- 100-hop runs achievable within a 5-minute first session; deaths always feel
  earned.
- 60fps with 60+ live movers; zero allocation stutter on lane recycle.
- Every critter silhouette-recognizable.

## Out of scope

- Multiplayer race modes, level editor, vehicles-as-player, more than 12
  critters.

## Open questions

- Coin → critter unlock pricing curve (fast drip vs. grind).
- Daily seed (same world for everyone that day) — v1.1?

## Detailed tasklist

**Phase 0 — Spike:**
- [x] Scaffold `mini-game`; lane-streaming generator: segment pool, recycle, theme param.
- [x] 4-dir hop + auto camera + idle hawk pressure.

**Phase 1 — Hazards:**
- [x] Lane types: road, tram, river(logs), rail(train telegraph), lava stones.
- [x] Death states + score/coin/rescue economy.
- [x] Difficulty ramp + theme shift every 25 hops.

**Phase 2 — Content:**
- [x] 6 themes authored (palettes + hazard mixes + dressing).
- [x] 12 critters: rigs/clips; Critterdex + unlock economy.
- [x] Reuse catalog vehicle GLBs as traffic hazards.

**Phase 3 — Shell & polish:**
- [x] Shell wiring: Timing School, World Tour, Player Studio.
- [x] HUD: score/coins/best; critter select.
- [x] Squash-stretch, sparkle, hawk vignette, splat beats; audio.

**Phase 4 — Evidence:**
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`.
- [ ] Showcase-index card + capture timeline (scripted 30-hop run).

## Ship checklist

- [ ] Endless generator: 6 themes, seamless recycle, ramp works.
- [ ] 5 hazard lane types + 5 distinct death states.
- [ ] 12 critters unlocked via coins/rescue pods.
- [ ] High score persists; Timing School teaches all hazard types.
- [ ] `validate --release` clean; `check-deploy` green.
- [ ] Preview + capture timeline shipped.
