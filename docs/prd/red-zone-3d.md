# PRD — Red Zone 3D

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: American football (Madden-lite × Retro Bowl charm) — following the Aura Slam 3D pattern
- Engine surface: character rigs + play-call sim + open-field tackle AI, `game.evidence`
- Route: `/apps/showcase-red-zone-3d/`

## TL;DR

Football at its purest: call the play, drop back, read the route, throw
between the zones — then hit-stick on defense. Seven-on-seven arcade rules,
six stadiums from Friday-night lights to a blizzard dome, a Route Lab, and a
32-team Gridiron Series bracket.

## Why this title

- Retro Bowl proved football's biggest audience wants fast, readable arcade
  football — and nobody has shipped a credible 3D browser version.
- Play-calling + QB reads is a distinctive decision-layer no other roster
  game has; it shows off AI systems, not just physics.
- The tennis pattern maps well: drives = games, stadiums = venues,
  Route Lab = Smash Lab, Gridiron Series = World Tour.

## Fantasy & core loop

Fourth and goal, lights on, season on the line — audible to the slant, drop,
read flat-vs-corner, let it rip.

Loop: call play → snap → execute (QB or carrier) → whistle → next down →
drive for six → defend → climb the Gridiron Series.

## Mode structure (shared shell)

| Shell slot | Red Zone mapping |
| --- | --- |
| Quick Play | 4-quarter arcade game (shortened clock) vs. CPU |
| Skill Lab | **Route Lab** — timing throws vs. coverage; **Tackle Lab** — open-field pursuit drills |
| Modes & Tour | **Gridiron Series** — 32-team playoff bracket; **Player Studio** (jersey, pads, visor) |
| Venue switcher | Stadium select (below) |

## Mechanics & controls

- Pre-snap: pick play from a 3-card sheet (run/short/deep); audible with Q.
- Offense: WASD carrier; QB drop auto, aim receiver with mouse/WASD, throw
  Space (power by hold); juke J, truck K, dive/first-down reach L.
- Defense: WASD pursuit; tackle Space on contact; hit-stick Shift+Space;
  ball-hawk pick attempt E on thrown ball.
- Rules: 7v7, 4 downs/10 yards, TD 6 + auto-PAT-or-go-for-2, 4×60s quarters,
  OT = first score wins.

## Content roster

**Stadiums (5 + 1 exotic):** Friday Night Lights (high school) · Rust Belt
Field (snow flurry) · Desert Dome · Bayfront Stadium · Neon Metro Dome ·
**Altitude Bowl** (exotic: mile-high thin-air long ball festival).

**Clubs (8):** identities — smashmouth, air-raid, option, blitz-heavy.

## Engine surface

- `character-controller` for the ball carrier/defender; AI movers for others.
- Play engine: scripted route stems + assignment defense (zone/man shells).
- Ball sim: spiral flight + catch windows + interception contests.
- `effects.*`: turf kick-up, tackle flash, crowd wave, pyro on TD.
- `looks` per stadium; weather variants (snow, rain, clear).

## Asset plan

- Athletes: shared sport-rig pipeline; pads/helmet variant retextures.
- Stadiums: kit geometry + catalog props; Altitude dome via Meshy.
- Ball/trophy: catalog; Lombardi-style cup via Meshy.

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

Prime-time broadcast: hard stadium whites on grass, painted turf, breath fog
in cold venues, confetti-grade on scores. Altitude Bowl = crisp thin-air
clarity.

## Success metrics

- Play sheet readable in 10 seconds (3 cards, icon routes).
- First drive completable by a new player; first TD in ≤ 3 possessions.
- 60fps with 14 athletes + ball flight + crowd.

## Out of scope

- 11v11, kicking game (FG/punts), franchise/season management, online play.

## Open questions

- Defense play-calling or auto-call? (Auto-call keeps pace arcade.)
- 60s quarters vs. 90s?

## Detailed tasklist

**Phase 0 — Spike:**
- [ ] Copy Aura Slam shell → stadium data.
- [ ] Play engine: route stems on a diagram grid; snap → route run → catch window.
- [ ] Ball flight: spiral + lead + contest.

**Phase 1 — Play loop:**
- [ ] Play-call sheet + audible; snap/whistle/down chain.
- [ ] Carrier controls (juke/truck/dive); pursuit AI + tackle resolve.
- [ ] TD/PAT/2pt, downs, quarters, OT.

**Phase 2 — Defense & clubs:**
- [ ] Zone/man shells, ball-hawk pick windows, blitz packages.
- [ ] 8 clubs + playbooks; CPU game-planning difficulty.

**Phase 3 — Stadiums & athletes:**
- [ ] 6 stadiums; weather variants; Altitude ball-physics tweak.
- [ ] Rig clips: stance/route/throw/catch/tackle/celebrate; validate.

**Phase 4 — Shell, polish, evidence:**
- [ ] Route Lab, Tackle Lab, Gridiron Series, Player Studio.
- [ ] HUD: down&distance, score, clock, play cards.
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`; card + timeline.

## Ship checklist

- [ ] Full game playable: downs/TD/PAT/OT correct.
- [ ] 3-card play sheet + audible works; routes run on time.
- [ ] Defense shells + hit-stick + interceptions live.
- [ ] 6 stadiums; 8 clubs; Gridiron Series completable.
- [ ] `validate --release` clean; `check-deploy` green.
- [ ] Preview + capture timeline shipped.
