# PRD — Aura Diamond 3D

- Status: Draft for review
- Date: 2026-10-16
- Modeled on: Baseball (MLB The Show hitting × Home Run Derby spectacle) — following the Aura Slam 3D pattern
- Engine surface: character rigs + pitch/hit ball sim + fielder AI, `game.evidence`
- Route: `/apps/showcase-aura-diamond-3d/`

## TL;DR

Baseball distilled to its two greatest feelings: the crack of a perfectly
timed swing and the roar of a ball clearing the fence. Three-inning quick
games with real at-bats, a Derby Lab, six ballparks from sandlot to skyline,
and a 32-team World Classic bracket.

## Why this title

- Baseball is the #2 US/#1 Japan-Korea-Caribbean sport game audience, and
  batting is the single most clip-able mechanic in sports games.
- The tennis pattern maps 1:1: at-bat = point, pitcher/batter duel = rally,
  innings = games, ballparks = venues.
- Ball-flight sim (pitch movement, hit physics) is a clean systems showcase
  with minimal AI surface vs. soccer.

## Fantasy & core loop

Step into the box at golden hour. Read the pitcher's release, sit on your
pitch, turn on it — and watch it rattle the skyline windows.

Loop: at-bat → read pitch type/location → time the swing → run the bases →
field your half-inning → chase the pennant across the World Classic.

## Mode structure (shared shell)

| Shell slot | Diamond mapping |
| --- | --- |
| Quick Play | 3-inning exhibition vs. CPU |
| Skill Lab | **Derby Lab** — 10-out home-run derby; **Bullpen Lab** — pitch recognition drills |
| Modes & Tour | **World Classic** — 32-team bracket; **Player Studio** (uniform, bat skin, walk-up flair) |
| Venue switcher | Ballpark select (below) |

## Mechanics & controls

- Batting: move PCI with WASD; swing Space — timing (early/good/late) × PCI
  contact zone → hit quality. Power swing: hold Space.
- Pitching (half-inning): pick pitch (1–4), aim location, release on meter.
- Base running: auto-advance with Space to push/retreat.
- Fielding: assist-mode catches (prompt → Space); throws automated v1.
- Pitch types: 4-seam, curve, slider, changeup — distinct movement profiles.
- Scoring: 3 outs/inning, 3 innings, extras tied, mercy at +10.

## Content roster

**Ballparks (5 + 1 exotic):** Harbor Sandlot · Midtown Skyline (rooftop
windows = targets) · Canyon Rim (deep alleys) · Ivy Classic (brick + vines) ·
Typhoon Dome (indoor) · **Lunar Park** (exotic: 1/6 gravity, 500-ft moonshots).

**Clubs (8):** squads with identity (power/small-ball/aces) + pitcher
repertoires.

## Engine surface

- Ball sim: pitch movement curves → bat contact → launch-angle/exit-velo
  flight → fence/field interaction.
- Character rigs: batting stance/swing, pitching windup, fielder crouch/catch
  via the sport-athlete pipeline.
- `effects.*`: bat crack flash, ball trail, fence-rattle, fireworks on HR,
  dust on slides.
- `looks` per park; dusk/night/storm moods.

## Asset plan

- Athletes: reuse sport-rig pipeline (Meshy/catalog); batting + pitching +
  fielding clip sets.
- Parks: kit geometry + catalog props; Lunar dome via Meshy.
- Crowd: instanced low-poly / flipbook strips.

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

Warm americana-meets-neon: deep dusk keys, stadium floods, chalk lines
glowing. Lunar Park = hard-shadow sci-fi contrast.

## Success metrics

- Pitch recognition learnable in one at-bat (readable seams/windup).
- Derby Lab: new player hits first HR in ≤ 8 swings.
- 60fps with 9 fielders + sim + crowd.

## Out of scope

- Full 9 innings, manual fielding/roster management, base-stealing sim,
  online play.

## Open questions

- Pitching depth: full control or simplified 2-step? (Leaning simplified.)
- Mercy rule threshold.

## Detailed tasklist

**Phase 0 — Spike:**
- [ ] Copy Aura Slam shell → ballpark data.
- [ ] Pitch sim: 4 pitch types with distinct movement; catch/net target test.
- [ ] Bat contact: PCI + timing → launch/exit-velo → flight.

**Phase 1 — At-bats:**
- [ ] PCI move + swing timing → contact quality → fair/foul/HR/Out.
- [ ] Pitch call + aim + release meter for the half-inning.
- [ ] 3-out/3-inning game flow; mercy; extras.

**Phase 2 — Fielding & teams:**
- [ ] Assist-mode fielding prompts + automated throws.
- [ ] Base running push/retreat.
- [ ] 8 clubs, pitcher repertoires, CPU approach AI.

**Phase 3 — Parks & athletes:**
- [ ] 6 ballparks; skyline target windows; Lunar gravity variant.
- [ ] Rig clips: stance/swing/windup/catch/slide/celebrate; validate.

**Phase 4 — Shell, polish, evidence:**
- [ ] Derby Lab, Bullpen Lab, World Classic bracket, Player Studio.
- [ ] HUD: count, outs, score, pitch read, PCI feedback.
- [ ] `look capture` ≥7; route-health; `game.evidence`; `check-deploy`; card + timeline.

## Ship checklist

- [ ] Full 3-inning game completable; extras + mercy work.
- [ ] 4 pitch types + PCI + timing feel skill-based.
- [ ] Derby Lab + Bullpen Lab live.
- [ ] 6 parks incl. Lunar gravity; 8 clubs; World Classic completable.
- [ ] `validate --release` clean; `check-deploy` green.
- [ ] Preview + capture timeline shipped.
