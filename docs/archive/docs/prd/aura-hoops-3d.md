# PRD — Aura Hoops 3D

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Street basketball (NBA Jam pace × 2K playground) — following the Aura Slam 3D tennis pattern
- Engine surface: `character-controller` + ball-flight sim + IK athletes, `packs/game-sfx-core`, `game.evidence`
- Route: `/apps/showcase-aura-hoops-3d/`

## TL;DR

Streetball, Aura3D style: 3v3 half-court basketball with ankle-breaker jukes,
alley-oops off the glass, and a shot meter that rewards release timing. Six
street courts worldwide, a Dunk Lab practice mode, and a 32-team Street Tour —
the direct basketball sibling of Aura Slam 3D.

## Why this title

- Basketball is the #2 sport game audience after soccer and the closest fit to
  our proven tennis structure (small playing area, few bodies, skill-shot
  mechanic, venue variety).
- Aura Slam proved the formula: articulated athletes + venue quick-switch +
  skill lab + world tour. Hoops reuses every layer.
- Rooftop-buckets (retired) proved appetite; this is its grown-up flagship.

## Fantasy & core loop

Rucker Park to Tokyo rooftops: run point, break ankles, call the oop, poster
the rim. Win by 11 or first to 21 — street rules.

Loop: check ball → isolation/pick → create a look → time the release →
defend/rebound → bucket chain builds Jam Meter → dunk packages unlock in
Tour.

## Mode structure (shared shell)

| Shell slot | Hoops mapping |
| --- | --- |
| Quick Play | 3v3 first-to-11 vs. CPU squad |
| Skill Lab | **Dunk Lab** — free-run rim attack + shot-meter drills; **Handles Lab** dribble cones |
| Modes & Tour | **Street Tour** — 32-team bracket; **Player Studio** (jersey, kicks, skin/hair); **Blacktop** casual |
| Venue switcher | Court select (below) |

## Mechanics & controls

- Move: WASD. Sprint: Shift. Cross/hesitation: J/K timing taps. Pass: E
  (cycle receivers). Shoot: Space — press-hold-release on the meter.
  Rebound/block attempt: Space on defense near rim. Steal poke: K on defense.
- Shot meter: green window scales with distance/contest; perfect = swish
  bonus + Jam Meter.
- Jam Meter: fills on scores/stops; full = dunk-package trigger (lob oop
  prompt, windmill, 360).
- Street rules: half-court, check-ball, 1s and 2s, first-to-11/21, winner's
  ball.
- Teammate AI: cuts, screens, spacing; CPU defense: on-ball + help rotations.

## Content roster

**Courts (5 + 1 exotic):** Rucker Harlem asphalt · Venice Beach sunset ·
Athens rooftop · Manila covered court · Shanghai riverside · **Orbit Court**
(exotic: dome court over Earth).

**Squads (8):** house crews with distinct stat identities (shooters,
slashers, bigs) for tour variety.

## Engine surface

- `character-controller` for ball-handler; AI movers for others.
- Ball sim: parabolic flight + rim/backboard collision + swish detection.
- IK athletes: reuse tennis's 2-bone IK approach for dribble/shoot/dunk poses.
- `effects.*`: net ripple, rim shake, crowd pop-up, Jam Meter aura.
- `looks` per court; street-grade palettes (asphalt/warm dusk/neon).

## Asset plan

- Athletes: reuse/adapt the tennis humanoid pipeline (Meshy or catalog,
  `validate-game --profile fighting-character`-style certification for
  sport rigs); ~8 body/kit variants.
- Hoops/courts: catalog + kit geometry; Meshy for hero hoops (Orbit dome).
- Crowd: low-poly instanced silhouettes or flipbook crowd strips.

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

Golden-hour asphalt drama: hard key light, long shadows, saturated court
paint, crowd as living edge. Orbit Court = clean sci-fi dome contrast.

## Success metrics

- Shot meter learnable in 3 shots; swish chain feels earnable.
- Oop trigger discoverable in first session.
- 60fps with 6 athletes + crowd + ball sim live.

## Out of scope

- Full 5v5/full-court rules, season/franchise modes, online multiplayer,
  fouls/free throws (street rules by design).

## Open questions

- 1v1/2v2 modes alongside 3v3? (Cheap to add via squad size param.)
- Dunk packages as unlockables in Tour only, or also Blacktop?

## Detailed tasklist

**Phase 0 — Spike:**
- [ ] Copy Aura Slam shell; swap venue data for courts.
- [ ] Ball flight sim: arc + rim/backboard collision + swish detection on a static hoop.
- [ ] One athlete: dribble idle + shot release animation.

**Phase 1 — Core ball mechanics:**
- [ ] Shot meter (press-hold-release, distance/contest scaling).
- [ ] Dribble/cross/hesitation input layer; sprint.
- [ ] Pass/cut cycle; rebound + block/steal attempts.
- [ ] Check-ball, 1s/2s scoring, first-to-11/21, winner's ball.

**Phase 2 — Squads & AI:**
- [ ] Teammate AI: cuts/screens/spacing; CPU on-ball + help defense; 3 difficulties.
- [ ] Jam Meter + dunk packages (oop prompt, windmill, 360).
- [ ] 8 squads with stat identities.

**Phase 3 — Courts & athletes:**
- [ ] 6 courts built + certified; per-court looks.
- [ ] Athlete rigs: dribble/shoot/dunk/block/steal/celebration clips; validate.
- [ ] Crowd strips, net/rim physics dressing.

**Phase 4 — Shell, polish, evidence:**
- [ ] Dunk Lab, Handles Lab, Street Tour bracket, Player Studio.
- [ ] HUD: score, meter, Jam Meter, possession arrow.
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`; card + timeline.

## Ship checklist

- [ ] 3v3 playable start-to-finish vs. CPU; 11/21 win conditions work.
- [ ] Shot meter + swish bonus + Jam Meter + 3 dunk packages live.
- [ ] 6 courts; 8 squads; 32-team Street Tour completable.
- [ ] Athletes animated through full clip set; `validate --release` clean.
- [ ] `check-deploy` green; preview + capture timeline shipped.
