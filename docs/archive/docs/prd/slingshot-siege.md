# PRD — Slingshot Siege

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Angry Birds (slingshot physics destruction)
- Engine surface: `physics.*` (rapier rigid bodies, joints, impulses), `mini-game` template, `effects.*` debris/dust, `game.evidence`
- Route: `/apps/showcase-slingshot-siege/`

## TL;DR

The classic slingshot puzzler in real 3D physics: pull, arc, release — topple
precarious fortresses of wood, stone, and glass to squash the Greedy Gulls
roosting inside. Limited birds per level, scored on destruction. It is the
roster's purest physics flex and its most viral clip generator.

## Why this title

- Angry Birds is the most downloaded mobile game franchise ever; the mechanic
  is instantly legible to every human with a thumb.
- A rigid-body destruction showcase is the most direct possible demo of
  `physics.*` — collapsing towers are inherently spectacular.
- Tiny scope per level, huge level count possible — content scales cheaply.

## Fantasy & core loop

The Greedy Gulls stole every egg in the rookery. Pip (crossover with Pip's Big
Leap) mans the siege sling: lob egg-bombs, battering stones, and the mighty
Anchor Squid into gull fortresses until nothing roosts.

Loop: survey the tower → pick ammo → pull, aim arc, release → chain-collapse →
star rating (1–3) → next level → new material/ammo every ~10 levels.

## Mode structure (shared shell)

| Shell slot | Slingshot Siege mapping |
| --- | --- |
| Quick Play | Level 1 sling |
| Skill Lab | **Trajectory Range** — infinite ammo target practice with arc preview toggle |
| Modes & Tour | **Siege Map** — level select with star ratings; **Player Studio** (sling + flag color) |
| Venue switcher | Chapter select (below) |

## Mechanics & controls

- Pull: click/touch-drag backward on the sling pouch; release to fire.
- Mid-air ability: tap/click to trigger ammo power.
- Camera: orbit/zoom around the fortress before the shot; auto-return to sling.
- Ammo powers: Egg-Bomb (drops payload), Stone (heavy smash), Triple-Chick
  (splits into 3), Anchor Squid (pierces then yanks), Fire-Egg (splash burn).
- Scoring: gulls squashed × destruction value × ammo bonus; 3-star thresholds.
- Physics: rigid-body stacks with mass/fragility per material (wood splinters,
  stone crumbles under impulse, glass shatters), joint-breaking, debris
  settling detection → end-of-shot resolution.

## Content roster

**Chapters (5 + 1 exotic):** Driftwood Cove (wood) · Quarry Rise (stone) ·
Greenhouse Perch (glass) · Windmill Gap (moving parts) · Gull Keep (mixed,
boss fortress) · **Moon Roost** (exotic: low-gravity slow-motion collapses).

30 levels at launch (5 per chapter), star-gated unlocks.

## Engine surface

- `mini-game` template; world = static terrain + dynamic rigid-body stack +
  one kinematic slingshot.
- `physics.*` rapier: box/cylinder bodies, impulse on release, joint break
  thresholds, sleep detection for shot resolution.
- `effects.*`: dust puffs, splinter chips, glass shards (flipbook or debris
  meshes), score popups.
- `looks` per chapter; dramatic slow-mo on last-gull-kill.

## Asset plan

- Gulls: one creature rig w/ idle/squawk/squash — catalog or Meshy.
- Ammo types: primitive + simple Meshy props.
- Towers: procedurally assembled from typed material GLBs (planks, blocks,
  panes) — `certify-game-geometry` not needed; physics does the work.
- Environments: chapter backdrops from kit + catalog.

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

Bright Saturday-morning-cartoon: chunky shapes, saturated materials, squash-
and-stretch feel via scale tweens on impact. Slow-mo collapse = the money shot.

## Success metrics

- Level 1 three-starrable within 3 shots by a new player.
- A 50-piece tower collapses at target FPS; settling resolves in < 2s.
- Every chapter visually distinct at thumbnail size.

## Out of scope

- User-built levels, real-time multiplayer, more ammo types, narrative
  campaign.

## Open questions

- Slingshot fixed-position (classic) or player-movable (fresh)?
- Camera orbit pre-shot: free or 3 fixed angles?

## Detailed tasklist

**Phase 0 — Spike:**
- [ ] Scaffold `mini-game`; spawn a 30-body tower; one impulse → collapses + settles.
- [ ] Slingshot: drag-pouch input → parabolic launch impulse → projectile.

**Phase 1 — Destruction core:**
- [ ] Material table: wood/stone/glass masses, break impulses, joint strengths.
- [ ] Damage pipeline: gull squash detection (impulse/contact or crush volume).
- [ ] Score + star thresholds + settle-detection end-of-shot.

**Phase 2 — Ammo & levels:**
- [ ] 5 ammo types with mid-air powers.
- [ ] Author 30 levels across 6 chapters; difficulty curve + star-gates.
- [ ] Level select with star persistence (localStorage).

**Phase 3 — Shell & polish:**
- [ ] Shell wiring: Trajectory Range, Siege Map, Player Studio.
- [ ] Camera: pre-shot orbit, shot-follow, result pan.
- [ ] Dust/splinter/glass VFX; kill slow-mo; audio.

**Phase 4 — Evidence:**
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`.
- [ ] Showcase-index card + capture timeline (scripted 3-star level 1).

## Ship checklist

- [ ] 30 levels across 6 chapters; each 3-starrable.
- [ ] 5 ammo types work with mid-air powers.
- [ ] 3 materials behave distinctly (splinter/crumble/shatter).
- [ ] Slingshot drag-arc-release feels right on mouse + touch.
- [ ] `validate --release` clean; `check-deploy` green.
- [ ] Preview + capture timeline shipped.
