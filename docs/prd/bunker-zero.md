# PRD — Bunker Zero

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Wolfenstein 3D (grid-maze corridor FPS)
- Engine surface: `mini-game` template, grid raycast/maze world, sprite-billboard enemies, `effects.*` muzzle/impact, `game.evidence`
- Route: `/apps/showcase-bunker-zero/`

## TL;DR

A fast retro corridor FPS in the Wolfenstein mold: grid-maze levels, secret
push-walls, treasure pickups, three enemy archetypes, a boss, and an arsenal
that grows floor by floor. Six floors down to Bunker Zero, shoot everything
that breathes, grab the gold, find the exit.

## Why this title

- Wolfenstein invented the FPS; "boomer shooter" is a thriving nostalgia genre
  with near-zero competition in browser 3D.
- Grid mazes are cheap, readable, and let the engine show off atmosphere
  (darkness, muzzle flash, fog) without heavy asset spend.
- It diversifies the roster: we have racing, driving, tennis — no shooter.

## Fantasy & core loop

You're the last saboteur descending a fallen citadel. Each floor: find the
elevator key, survive the halls, loot what glitters. Floor 6 is Bunker Zero —
and something is waiting.

Loop: spawn on floor → sweep corridors → key door → elevator down → bigger
enemies, better guns, darker halls → floor 6 boss → crown of brass.

## Mode structure (shared shell)

| Shell slot | Bunker Zero mapping |
| --- | --- |
| Quick Play | Floor 1 run with pistol |
| Skill Lab | **Kill House** — timed shooting gallery with dummy soldiers |
| Modes & Tour | **Descent Map** — floor select (unlocked by progress) + **Player Studio** (dogtag + camo tint) |
| Venue switcher | Floor select (below) |

## Mechanics & controls

- Move: WASD; strafe A/D; turn with mouse (pointer lock) or arrows.
- Fire: click / Space. Reload: R (magazine weapons). Interact/push wall: E.
- Switch: 1–4 or wheel (knife, pistol, machine gun, rocket "Panzerschreck"-
  style launcher on floor 4+).
- Systems: ammo economy, health packs, armor shards, treasure score,
  secret push-walls (cracked texture cue), enemy alert states, pain/kill
  frames, floor timer medal (par time per floor).

## Content roster

**Floors (5 + 1 exotic):** Stone Gatehouse · Flooded Cellars · Forge Halls ·
Officer's Vault · The Descent (gauntlet) · **Bunker Zero** (exotic: brass-lit
silo with the Iron Warden boss).

**Enemies:** guard (hitscan pistol), patrol dog (fast melee), heavy gunner
(suppression), Iron Warden boss (rocket volleys + summons).

**Pickups:** gold cups/crowns (score), health, armor, ammo, key, life-up.

## Engine surface

- `mini-game` template; world is a grid map → extruded wall boxes + billboard
  sprites or low-poly models for enemies/props.
- Raycast-free approach: real 3D corridors, grid-authored (easier than true
  raycasting and looks far better with our lighting).
- `effects.*`: muzzle flash flipbook, impact sparks/decals, blood-less
  hit flashes, rocket trail.
- `looks`: oppressive low-fog dark grade; muzzle flash = only bright light —
  dramatic proof of dynamic light handling.
- Doors/push-walls: sliding animated geometry on grid cells.

## Asset plan

- Weapons: catalog search FPS weapon GLBs; Meshy fallback for the launcher.
- Enemies: 3 low-poly humanoid/creature rigs — catalog-first, Meshy fallback,
  `validate-animation` (idle/walk/attack/hit/death).
- Set dressing: barrels, banners, crates, gold props — catalog + primitives.
- Audio: `packs/game-sfx-core` gunshots/impacts/UI/ambience.

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

Deliberate retro-modern: blocky corridors, flat-shaded walls, but modern fog,
volumetric-ish muzzle glow, film grain grade. "Doom 1993 as remembered in 2026."

## Success metrics

- Floor 1 clearable in ≤ 4 minutes; at least 2 secrets per floor.
- Enemy readability: silhouette distinct at 20m in fog.
- 60fps capture with 12+ live enemies.

## Out of scope

- True software raycaster, multiplayer/co-op, level editor, more than 6
  floors, gore systems, regenerating-health modernism.

## Open questions

- Pointer-lock mouse aim vs. classic keyboard-turn-only? (Mouse default,
  keyboard fallback.)
- Sprite-billboard enemies (authentic) vs. low-poly models (prettier)? Decide
  after first screenshot — leaning low-poly with billboard hit-flash.

## Detailed tasklist

**Phase 0 — Spike:**
- [ ] Scaffold `mini-game`; grid-map loader → wall geometry + door cells.
- [ ] Pointer-lock controller: WASD/strafe/mouse turn; collision on grid.

**Phase 1 — Combat:**
- [ ] Hitscan pistol + muzzle flipbook + damage pipeline.
- [ ] Enemy AI: idle/patrol → alert → chase → attack → death; dog melee lunge, gunner burst.
- [ ] Weapon inventory + switching + ammo; knife/pistol/MG/launcher.
- [ ] Health/armor/pickups/score; death + respawn.

**Phase 2 — Floors & secrets:**
- [ ] Author 6 floor maps (ASCII-grid → builder); key + exit + secrets each.
- [ ] Push-wall mechanic + cracked-texture cue.
- [ ] Boss: Iron Warden pattern (volley → summon → vulnerable window).

**Phase 3 — Shell & polish:**
- [ ] Shell wiring: Kill House, Descent Map, Player Studio.
- [ ] HUD: health/armor/ammo/score/floor + damage vignette.
- [ ] Look: fog, grain, dynamic muzzle light; audio mix.

**Phase 4 — Evidence:**
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`.
- [ ] Showcase-index card + capture timeline (scripted clear of floor 1).

## Ship checklist

- [ ] 6 floors authored; each has key, exit, ≥2 secrets, par-time medal.
- [ ] 4 weapons functional; ammo economy balanced.
- [ ] 3 enemy types + boss with distinct readable patterns.
- [ ] Pointer-lock + keyboard fallback both playable.
- [ ] All assets `model(assets.x)`; `validate --release` clean.
- [ ] `check-deploy` green; preview + capture timeline shipped.
