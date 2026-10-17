# PRD — Iron Crown

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Street Fighter II (2.5D one-on-one fighter)
- Engine surface: `fighting-game` template, `FightingCharacterController`, `HitboxWorld`, `assets certify-game-geometry`, `game.evidence`
- Route: `/apps/showcase-iron-crown/`

## TL;DR

A 2.5D arena fighter: two stylized martial-arts combatants, best-of-three rounds,
directional blocks, a throw, a signature special per fighter, and a tournament
ladder. It fills the roster's biggest genre hole — nothing melee exists in the
4.0.1 lineup — and exercises the fighting kit the engine already ships but no
public showcase demonstrates.

## Why this title

- Street Fighter is the most recognizable fighting game on earth; "browser
  Street Fighter" has proven search/portal demand for decades.
- The `fighting-game` template, `FightingCharacterController`, `HitboxWorld`,
  and `assets validate-game --profile fighting-character` exist today but are
  invisible to the public. This game is their demo.
- Fighting games screenshot exceptionally well at any asset budget — two
  characters, one stage, dramatic key light.

## Fantasy & core loop

You are a challenger climbing the Iron Crown tournament: eight fighters, eight
stages, one crown. Walk in, read the opponent, poke, anti-air, land the special,
take the round. Two rounds wins the bout; eight bouts wins the crown.

Loop: enter bout → feel out with pokes → build meter by landing hits → spend
meter on special → close out round → next fighter, new stage.

## Mode structure (shared shell)

| Shell slot | Iron Crown mapping |
| --- | --- |
| Quick Play | Single bout vs. CPU, random stage |
| Skill Lab | **Combo Lab** — hit-confirm dummy, input display, frame-data overlay toggle |
| Modes & Tour | **Crown Ladder** — 8-fighter bracket; **Versus** — pick fighter + stage; **Player Studio** |
| Venue switcher | Stage select (below) |

## Mechanics & controls

- Move: A/D (or arrows) — walk, with auto-facing flip on cross-up.
- Crouch: S. Jump: W or Space.
- Attacks: J = light, K = heavy, L = special (meter), U = throw.
- Block: hold away from attacker; crouch-block lows.
- Systems: walk speed variance per fighter, jump arcs, hit-stun/block-stun,
  3-hit cancel windows (light → heavy → special), throw tech on same-frame
  input, chip damage on specials, round timer 60s, best-of-3.
- Meter: builds on landed hits and taken damage; one stock per special.

## Content roster

**Fighters (6 launch):** a balanced karateka archetype, a fast rushdown boxer, a
heavy grappler, a zoning spear/staff fighter, a slippery trickster, and the
final boss "Iron Crown" champion. Each fighter needs: idle, walk f/b, jump,
crouch, 2 strikes, block, hit-react, knockdown, throw, special, KO/win pose.

**Stages (5 + 1 exotic):** Neo-Tokyo rooftop at night · Bangkok dock market ·
Roman colosseum ruins · Nevada desert airbase · Himalayan monastery · **The
Crown Arena** (final, golden arena with crowd).

## Engine surface

- `fighting-game` template as scaffold.
- `FightingCharacterController` per fighter; `HitboxWorld` for strike/hurt
  volumes and hit resolution.
- `assets validate-game --profile fighting-character` per rigged fighter;
  `assets certify-game-geometry --category fighting` for stage floors.
- `AnimationController` state machine: locomotion blend + move layer overrides.
- Camera: fixed-side cinematic dolly, subtle punch-in on specials.
- `looks.*` per stage + hit VFX via `effects.*` (impact flash, after-image,
  screen shake, hit sparks).

## Asset plan

- Characters are the hard part. Path: `assets search` humanoid/martial-arts
  first; where the catalog is thin, Meshy text-to-3D → `retexture` → `rig` →
  `import-meshy --profile humanoid` → `validate-animation` with the required
  clip map. Budget: 6 fighters.
- Stages: kit-composed (sceneKits/prefabs) + catalog set-dressing; Meshy only
  for hero props (arena crown, monastery gate).
- Audio: `packs/game-sfx-core` covers impacts, whooshes, UI, announcer stingers.

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

Two grounded fighters under a hard key with strong rim — read silhouettes, not
noise. Each stage gets its own `looks` preset + fog + grade. Hit effects are
additive sprite-flipbook flashes, never neon soup.

## Success metrics

- Route passes `route-health.json`, `game.evidence` capture, and
  `check-deploy`.
- A first-time player wins a round in ≤ 3 attempts; Combo Lab teaches a
  3-hit cancel in one session.
- Desktop 1080p capture holds target FPS with both fighters animating.

## Out of scope

- Online multiplayer, rollback netcode, ranked.
- More than 6 fighters / 6 stages.
- Command-input motions (quarter-circles) — specials are single-button in v1.

## Open questions

- Keyboard-only, or add local two-player same-keyboard? (Versus is CPU in v1
  unless flagged.)
- Boss fighter: playable on unlock, or CPU-only?

## Detailed tasklist

**Phase 0 — Spike (prove the kit):**
- [ ] Scaffold `apps/showcase-iron-crown` from `fighting-game` template; `npm run build` green.
- [ ] Spawn two `FightingCharacterController`s on a flat stage; verify HitboxWorld hit/hurt events fire with debug overlay.
- [ ] Confirm input map (J/K/L/U + WASD) reads through `@aura3d/input` deterministically.

**Phase 1 — Combat core:**
- [ ] Implement state machine: idle/walk/jump/crouch/block/hit-stun/knockdown/throw/special/KO.
- [ ] Implement facing flip, push-box separation, corner clamp.
- [ ] Implement 3-hit cancel windows + meter accrual/spend.
- [ ] Round flow: timer, best-of-3, round/KO/win banners, reset.
- [ ] CPU AI v1: approach, poke, block chance, anti-air reaction; 3 difficulties.

**Phase 2 — Fighters:**
- [ ] Source/rig 6 fighters (catalog-first → Meshy fallback); `inspect --animation` each.
- [ ] Clip-map + retime each fighter; `validate-animation` + `validate-game --profile fighting-character` green.
- [ ] Per-fighter stats table (walk speed, jump arc, damage, health, special).

**Phase 3 — Stages & shell:**
- [ ] Build 6 stages; per-stage `looks` preset, floor certified via `certify-game-geometry`.
- [ ] Wire shell: Quick Play / Combo Lab / Crown Ladder / Versus / Player Studio.
- [ ] HUD: health bars, meter, round pips, timer, combo counter.
- [ ] Hit VFX + camera punch-in + screen shake; KO slow-mo beat.

**Phase 4 — Polish & evidence:**
- [ ] `look capture` loop until rubric ≥7 all categories; fix lint codes first.
- [ ] Mobile controls check (touch buttons) or scope desktop-only + hint.
- [ ] route-health.json, previews webp, `game.evidence`, `check-deploy`.
- [ ] Add to `apps/showcase-index` roster + `tools/quality-rebuild-capture/games.json` timeline.

## Ship checklist

- [ ] All 6 fighters animated: idle/walk/jump/crouch/2 strikes/block/react/knockdown/throw/special/KO.
- [ ] All 6 stages: typed or kit geometry, look applied, floor certified.
- [ ] Win a bout in Quick Play; full Crown Ladder completable.
- [ ] No `three`/`GLTFLoader`/raw URL imports; all assets via `model(assets.x)`.
- [ ] `assets validate --release` clean; `check-deploy` green.
- [ ] Capture harness plays the game end-to-end with scripted input.
- [ ] Preview webp + showcase-index card shipped.
