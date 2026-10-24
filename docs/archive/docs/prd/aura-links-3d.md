# PRD — Aura Links 3D

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Golf (Everybody's Golf accessibility × PGA course drama) — following the Aura Slam 3D pattern
- Engine surface: ball-flight sim + terrain + wind, `game.evidence`
- Route: `/apps/showcase-aura-links-3d/`

## TL;DR

Golf without the patience requirement: three-click swing (power, accuracy,
spin), six storybook courses from Scottish dunes to a volcanic rim, a Range
Lab, and a 32-player Pro Circuit. Wind, lies, and shot-shaping — the
slow-burn strategy title of the sports set.

## Why this title

- Golf is the evergreen "one more round" genre; arcade golf (Everybody's Golf,
  Golden Tee) has massive casual appeal and almost zero browser presence.
- Ball flight + terrain + wind is a beautiful physics showcase with near-zero
  AI surface — the cheapest big-feeling sports sim we can build.
- Siege-golf (retired) proved appetite for a golf title; this is the real one.

## Fantasy & core loop

Morning dew on the first tee at St. Auroras. Pick your line, shape the shot,
chase the flag through dunes, cliffs, and crater rims — one card under par
at a time.

Loop: read wind/lie → club choice → three-click swing → ball flight → next
shot → card the hole → next course.

## Mode structure (shared shell)

| Shell slot | Links mapping |
| --- | --- |
| Quick Play | 9-hole round at St. Auroras |
| Skill Lab | **Range Lab** — distance/spin drills; **Putting Lab** — green-read practice |
| Modes & Tour | **Pro Circuit** — 32-player medal bracket; **Player Studio** (polo, cap, ball trail) |
| Venue switcher | Course select (below) |

## Mechanics & controls

- Aim: WASD shot direction + club cycle Q/E (driver/wood/iron/wedge/putter).
- Swing: Space × 3 — start power, stop accuracy, set spin.
- Lie/wind: displayed pre-shot; rough/sand modify contact quality.
- Ball sim: launch/spin/wind curve → bounce/roll on terrain → cup detection.
- Scoring: stroke play, 9 holes; skins mode for tiebreaks.

## Content roster

**Courses (5 + 1 exotic):** St. Auroras Links (dunes) · Maple Hollow
(parkland) · Cinder Rim (volcanic) · Cloud Terrace (mountain) · Neon Bay
(night city) · **Mare Course** (exotic: lunar sea-of-tranquility crater,
1/6 gravity drives).

9 holes per course, handicap-rated.

## Engine surface

- Ball sim + terrain sampler (heightfield + material zones: fairway/rough/
  sand/green).
- Golfer rig: address/swing/follow-through/celebrate; camera follow-ball rig.
- `effects.*`: divot spray, sand burst, ball trail, cup rattle.
- `looks` per course; morning/dusk/night moods.

## Asset plan

- Golfer: shared sport-rig pipeline.
- Courses: heightfield terrain + kit/catalog dressing (clubhouse, carts,
  flags); Mare dome via Meshy.
- Clubs/ball/trophy: catalog + Meshy hero cup.

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

Postcard golf: soft morning keys, long grass shadows, water sparkle, flag
flutter. Cinder Rim goes amber-and-ash; Neon Bay goes saturated night;
Mare goes hard-shadow lunar.

## Success metrics

- First-time player pars a hole in their first round.
- Three-click swing learned in ≤ 5 shots.
- 60fps over full-course terrain with wind flags + water.

## Out of scope

- 18 holes per course, multiplayer, swing-stick analog input, caddie sim.

## Open questions

- 9 vs. 18 holes in v1 (9 keeps session ~10 min).
- Grid greens vs. visual-break only for putting reads.

## Detailed tasklist

**Phase 0 — Spike:**
- [ ] Copy Aura Slam shell → course data.
- [ ] Ball sim: launch/spin/wind → terrain bounce/roll → cup.
- [ ] Heightfield terrain + material zones on a test hole.

**Phase 1 — Swing & clubs:**
- [ ] Three-click swing + club cycle + lie/wind effects.
- [ ] Shot-shaping (draw/fade via spin input).
- [ ] Scoring: stroke play, card, skins tiebreak.

**Phase 2 — Courses:**
- [ ] 6 courses × 9 holes authored + certified terrain.
- [ ] Per-course looks + hazards (water, bunkers, OOB).
- [ ] Mare low-gravity variant.

**Phase 3 — Labs & shell:**
- [ ] Range Lab, Putting Lab, Pro Circuit, Player Studio.
- [ ] HUD: hole/par/score, wind, club, lie, swing meter.
- [ ] Rig clips + follow-ball camera polish.

**Phase 4 — Evidence:**
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`; card + timeline.

## Ship checklist

- [ ] 54 holes shippable across 6 courses.
- [ ] Three-click swing + shaping + lie/wind all live.
- [ ] Range/Putting labs; Pro Circuit completable.
- [ ] `validate --release` clean; `check-deploy` green.
- [ ] Preview + capture timeline shipped.
