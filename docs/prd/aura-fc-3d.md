# PRD — Aura FC 3D

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Soccer (FIFA-style open play, arcade pace) — following the Aura Slam 3D pattern
- Engine surface: character rigs + ball sim + 5v5 team AI, `game.evidence`
- Route: `/apps/showcase-aura-fc-3d/`

## TL;DR

The world's game: 5v5 street-and-stadium soccer with skill moves, driven
shots, curling finishers, and a shootout lab. Six pitches from favela
courts to a glacier arena and a 32-team World Circuit. The biggest audience
of any title in the slate.

## Why this title

- Soccer is the #1 sport on earth; a credible 3D browser football game is the
  single largest audience unlock in the slate.
- Team AI (formations, off-ball runs, marking) is a legitimately hard systems
  showcase — exactly the "engine does heavy lifting" story.
- The tennis pattern ports cleanly: halves = sets, pitches = venues,
  Shootout Lab = Smash Lab, World Circuit = World Tour.

## Fantasy & core loop

From cage courts to cup finals: dribble through traffic, split lines with a
driven pass, bend one into the top corner. Win the group, survive the
knockouts, lift the circuit cup.

Loop: kickoff → build through passes → create a lane → finish → defend your
box → tournament climb.

## Mode structure (shared shell)

| Shell slot | Aura FC mapping |
| --- | --- |
| Quick Play | 5v5, two 90-second halves vs. CPU |
| Skill Lab | **Shootout Lab** — penalties vs. keeper; **Touch Lab** — first-touch/skill-move drills |
| Modes & Tour | **World Circuit** — 32-team group+knockout; **Player Studio** (kit, boots, celebration) |
| Venue switcher | Pitch select (below) |

## Mechanics & controls

- Move: WASD; sprint Shift. Pass: E (short) / R (driven). Shoot: Space —
  power by hold, curl by direction at release. Skill move: J/K flicks.
  Slide: K on defense. Switch player: Q. Keeper rush: hold Shift off-ball.
- Ball sim: dribble-stick, pass leading, driven/curl flight, bounce physics.
- Team AI: 4-4-2-ish shape, off-ball runs, mark/track defense, difficulty
  scales press aggression.
- Match: 2 × 90s halves, golden-goal extra, shootout tiebreak in tour.

## Content roster

**Pitches (5 + 1 exotic):** Favela Cage (walled) · Munich Floodlight ·
Lagos Beach · Kyoto Night · Uyuni Salt Flat · **Glacier Arena** (exotic:
aurora sky, ice sheen).

**Clubs (8):** identities from tiki-press to long-ball counter.

## Engine surface

- `character-controller` for the on-ball player; AI movers for 9 others.
- Ball sim + possession state machine (dribble/loose/controlled/flight).
- Sport-rig animation pipeline: run/dribble/kick/slide/celebrate/keeper dive.
- `effects.*`: boot spray, net ripple, confetti, crowd pop-ups.
- `looks` per pitch.

## Asset plan

- Athletes: shared sport-rig pipeline; 8 kit variants via retexture.
- Pitches: kit geometry + catalog props; Glacier dome via Meshy.
- Ball + boots: catalog; hero trophy via Meshy.

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

Broadcast night-match drama: floodlit grass, hard rim on players, pitch
patterns readable from broadcast cam. Street pitches go warm/dusty; Glacier
goes cool aurora.

## Success metrics

- First-time player scores within 2 minutes of kickoff.
- Off-ball AI produces visible runs/lanes without input.
- 60fps with 10 athletes + ball sim + crowd.

## Out of scope

- Full 11v11, offsides, fouls/cards, career mode, online play.

## Open questions

- Match length: 2×90s arcade or adjustable?
- Offsides: omit entirely (arcade) — confirm.

## Detailed tasklist

**Phase 0 — Spike:**
- [ ] Copy Aura Slam shell → pitch data.
- [ ] Ball sim: dribble-stick, pass flight, curl, bounce, goal detection.
- [ ] One athlete: run/dribble/kick clips on test pitch.

**Phase 1 — 5v5 core:**
- [ ] Possession state machine + player switching (Q).
- [ ] Pass types, shot power/curl, skill flicks, slide.
- [ ] Team AI: shape, off-ball runs, marking, press difficulty.
- [ ] Match flow: halves, extra time, shootout tiebreak.

**Phase 2 — Content:**
- [ ] 6 pitches certified; per-pitch looks.
- [ ] 8 clubs + kit retextures; keeper dive clips; celebrations.
- [ ] Shootout Lab + Touch Lab.

**Phase 3 — Shell, polish, evidence:**
- [ ] World Circuit bracket + Player Studio.
- [ ] HUD: score, clock, possession, stamina-lite.
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`; card + timeline.

## Ship checklist

- [ ] 5v5 match playable end-to-end; halves/extra/shootout all work.
- [ ] Skill moves + curl shots + keeper AI live.
- [ ] 6 pitches; 8 clubs; World Circuit completable.
- [ ] Athlete clips validated; `validate --release` clean.
- [ ] `check-deploy` green; preview + capture timeline shipped.
