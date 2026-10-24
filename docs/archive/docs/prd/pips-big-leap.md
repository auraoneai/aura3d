# PRD — Pip's Big Leap

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Super Mario Bros / 3D mascot platformer (Mario 64 / A Hat in Time)
- Engine surface: `game.platformer`, `character-controller` template, `assets certify-game-geometry --category platformer`, `game.evidence`
- Route: `/apps/showcase-pips-big-leap/`

## TL;DR

A charming 3D mascot platformer: Pip, a small acorn-helmeted sprout, runs,
jumps, ground-pounds, and glides through five themed worlds rescuing scattered
sun-seeds. It is the roster's first true platformer — the retired skyline-runner
was a lane-runner, not real jump physics — and directly exercises
`game.platformer` and platformer geometry certification.

## Why this title

- Mario is the most famous game franchise on earth; 3D platformers are the most
  requested browser-game genre after FPS and racing.
- We have zero mascot/character-forward content. Everything current is vehicles
  or athletes. A mascot gives the brand a face.
- `game.platformer`, the `character-controller` template, and platformer
  geometry certification already exist — this is their flagship demo.

## Fantasy & core loop

The sun-seeds scattered across the Whispering Vale. Pip — part acorn, part
attitude — leaps, bounces, and glides through mushroom forests, cloud
wharves, and lava cellars to gather them all.

Loop: enter world → explore for seeds → chain jumps/dive/glide to reach
glimmers → grab seed → checkpoint → boss door at seed threshold → next world.

## Mode structure (shared shell)

| Shell slot | Pip mapping |
| --- | --- |
| Quick Play | Drop into World 1 with seeds tracked |
| Skill Lab | **Jump Academy** — isolated obstacle gauntlet: long-jump, dive, pound, glide |
| Modes & Tour | **Vale Atlas** — world map with seed counts; **Player Studio** (cap/cape colors); **Time Trial** per level |
| Venue switcher | World select (below) |

## Mechanics & controls

- Move: WASD/arrows, camera-relative; camera follows behind shoulder.
- Jump: Space (variable height); double-jump unlock in World 2.
- Dive/grapple: Shift mid-air lunge. Ground pound: Ctrl/C mid-air.
- Glide: hold Space after apex (cape).
- Systems: coyote time, jump buffering, slope handling, moving/timed
  platforms, springs, collectible acorns (health = 3 hearts), checkpoint
  flags, seed gates, swim pockets (World 4), boss arena (World 5).
- Time Trial medals: bronze/silver/gold par times per world.

## Content roster

**Worlds (5 + 1 exotic):** Whispering Forest (mushroom platforms) · Sunmill
Wharf (windmills, water wheels) · Cloudspan Wharf (sky docks, fans) · Ember
Cellar (lava, geysers) · Hollow Palace (final, vertical climb) · **Starfall
Garden** (exotic: low-gravity crystal meadow, post-game).

**Seed economy:** 6 seeds per world; 3 gated on optional challenge paths.
Boss: Brambleback, a rolling thorn-beast (pattern boss, 3 hits).

## Engine surface

- `character-controller` template + `game.platformer` kit for checkpoints,
  movers, springs, score, reset.
- Platformer geometry certification on every playable surface
  (`certify-game-geometry --category platformer`).
- `AnimationController`: idle/run/jump/apex/fall/glide/dive/pound/hurt.
- Camera: follow rig with look-ahead and gentle pitch clamp; never through
  walls (sphere-cast pull-in).
- `looks` preset per world; particle accents (spores, embers, starlight) via
  `effects.*`.

## Asset plan

- Pip: Meshy text-to-3D + rig + `import-meshy --profile humanoid` (or a
  catalog small-creature rig if clean). One hero rig, ~10 clips.
- Brambleback: Meshy creature + 3 clips (roll, wind-up, stagger).
- Worlds: platformer-kit geometry + catalog set dressing; Meshy for hero
  props only (Sunmill blades, Hollow Palace door).
- Collectibles: primitives/instanced meshes (seeds, acorns, stars) — cheap.

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

Storybook warmth: soft hemisphere light, long golden-hour key, saturated
accents per world (emerald / mill-blue / cloud-violet / ember / crown-gold /
starlight). Readable silhouettes, rounded shapes, bounce everywhere.

## Success metrics

- World 1 completable by a first-time player in ≤ 5 minutes, no tutorial text
  beyond the controls hint.
- All worlds pass platformer geometry certification.
- 60fps-class capture at 1080p with movers + particles live.

## Out of scope

- Multiplayer/co-op, level editor, swimming as a full moveset, more than 6
  worlds, voiced dialogue.

## Open questions

- Double-jump as pickup-unlock or innate? (Leaning unlock — gives W1–W2 arc.)
- Time-trial ghosts (recorded player path) — v1.1?

## Detailed tasklist

**Phase 0 — Spike:**
- [ ] Scaffold from `character-controller` template; run/jump/land on flat ground green.
- [ ] Verify coyote time, buffering, variable jump height feel on a test slope/mover.

**Phase 1 — Movement set:**
- [ ] Double-jump, dive-lunge, ground-pound, glide implemented + tuned.
- [ ] Camera rig: follow, look-ahead, wall pull-in; no clipping on test level.
- [ ] Checkpoint/respawn, heart/damage/knockback, seed counter + gates.

**Phase 2 — Worlds:**
- [ ] Block out all 6 worlds; each passes `certify-game-geometry --category platformer`.
- [ ] Movers/springs/fans/geysers scripted per world; swim pocket in W4.
- [ ] Per-world `looks` preset + ambient audio from `packs/game-sfx-core`.

**Phase 3 — Characters:**
- [ ] Pip rig + clip set; `validate-animation` green; velocity-gated locomotion.
- [ ] Brambleback boss: 3-phase pattern, arena, hit reactions.
- [ ] Seed/acorn pickup VFX + HUD.

**Phase 4 — Shell, polish, evidence:**
- [ ] Shell wiring: Jump Academy, Vale Atlas, Player Studio, Time Trial.
- [ ] HUD: hearts, seeds, acorns, timer.
- [ ] `look capture` loop ≥7; route-health, previews, `game.evidence`, `check-deploy`.
- [ ] Showcase-index card + capture timeline.

## Ship checklist

- [ ] 6 worlds shippable, each certified platformer geometry.
- [ ] Full moveset works: run/jump/double/dive/pound/glide/swim pocket.
- [ ] 36 seeds placed (6 per world, 3 on challenge paths).
- [ ] Boss beatable; Starfall Garden unlocks post-crown.
- [ ] Time Trial medals + fastest-time persistence (localStorage).
- [ ] All assets typed via `model(assets.x)`; `validate --release` clean.
- [ ] `check-deploy` green; preview + capture timeline shipped.
