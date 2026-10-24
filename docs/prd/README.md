# Game PRD Index — Aura3D Showcase Slate

Status: Draft for review
Date: 2026-10-16
Context: Aura3D 4.0.1 (`@aura3d/engine@4.0.1`). Flagship roster today: Aura Slam 3D, Apex Overdrive, Thermal Drift, Grid Dispatch.

Each PRD below defines a new showcase game modeled on a mainstream title or a sport
discipline, built on the shared Aura3D shell pattern established by Aura Slam 3D.

## Shared shell pattern (inherited by every PRD)

Every game reuses the Aura Slam 3D page shell:

- Top bar: `AURA3D ENGINE` badge · **Quick Play** (jump into a live session) · **Skill Lab**
  (isolated mechanics practice) · **Modes & Tour** (full menu) · venue quick-switcher.
- Controls hint bar, hidden under 760px.
- Branded HUD (score/status in the game's own idiom), `render-error` WebGL2 fallback.
- **Player Studio** — character/color customization before a run.
- 4–6 venues — mostly grounded real-world locations plus one signature exotic venue
  (the pattern's "Moon court" slot).
- A bracket/tour mode (Aura Slam's is a 32-player World Tour).
- Route-health.json + game.evidence capture contract, same as the current four.

## Meshy access (applies to every PRD)

All Meshy API calls go through the **Prism proxy** — pooled keys are injected
server-side; no raw `msy_...` key ever enters the repo, logs, or transcripts.

- **Endpoint:** `https://prism.auraone.ai/v1/meshy/openapi/v2/<op>` (e.g.
  `text-to-3d`, `openapi/v2/text-to-3d/{id}` for task status)
- **Auth:** `-H "X-Prism-Key: $(cat .prism_key.txt)"` — key file is gitignored;
  `x-api-key` and `Authorization: Bearer` are also accepted.
- **Rotation:** Prism rotates pooled keys on 401/402/403/429/5xx and pins task
  affinity — GET status and refine/remesh/rig calls route back to the owning
  key automatically.
- **Balance check:** `curl https://prism.auraone.ai/admin/meshy -H "X-Prism-Key: $(cat .prism_key.txt)"`
  → masked key ids + live monthly/permanent credits.
- **Raw keys (only if a call must run outside Prism):**
  `~/.local/bin/aws ssm get-parameter --name /kiro/prism/meshy-keys --with-decryption --region us-west-2 --query Parameter.Value --output text`
  via the default `auraone-production-operator` chain, or
  `/opt/prism/secrets/meshy-keys.json` on the host. Never write them anywhere else.
- **Repo admission path (per `meshy-cli` skill):** generate → download to
  `artifacts/meshy/<asset>/` →
  `aura3d assets import-meshy <dir> --name <n> --profile humanoid|vehicle|prop|environment --rights-evidence <json> --quality candidate`
  → `assets inspect --animation` → `validate-animation` → `assets typegen`.

## The slate

| # | PRD | Working title | Modeled on | Genre kit / primary API |
| --- | --- | --- | --- | --- |
| 1 | [Iron Crown](../archive/docs/prd/iron-crown.md) | **Iron Crown** | Street Fighter II | `fighting-game` template, `FightingCharacterController`, `HitboxWorld` |
| 2 | [Pip's Big Leap](../archive/docs/prd/pips-big-leap.md) | **Pip's Big Leap** | Super Mario Bros | `game.platformer`, `character-controller` template |
| 3 | [Bunker Zero](../archive/docs/prd/bunker-zero.md) | **Bunker Zero** | Wolfenstein 3D | `mini-game` template, raycast-maze grid, sprite enemies |
| 4 | [Slingshot Siege](../archive/docs/prd/slingshot-siege.md) | **Slingshot Siege** | Angry Birds | `physics.*` (rapier), destruction stacks |
| 5 | [Dot Dash 3D](../archive/docs/prd/dot-dash-3d.md) | **Dot Dash 3D** | Pac-Man | `mini-game`, grid pathing AI |
| 6 | [Cross Hop](../archive/docs/prd/cross-hop.md) | **Cross Hop** | Frogger / Crossy Road | `game.platformer` lane variant |
| 7 | [Aura Hoops 3D](../archive/docs/prd/aura-hoops-3d.md) | **Aura Hoops 3D** | Basketball (NBA Jam / 2K streetball) | `character-controller` + custom sport sim |
| 8 | [Aura Diamond 3D](../archive/docs/prd/aura-diamond-3d.md) | **Aura Diamond 3D** | Baseball (MLB / Home Run Derby) | character + projectile sim |
| 9 | [Aura FC 3D](../archive/docs/prd/aura-fc-3d.md) | **Aura FC 3D** | Soccer (FIFA / Rocket League minus cars) | character + ball sim |
| 10 | [Red Zone 3D](../archive/docs/prd/red-zone-3d.md) | **Red Zone 3D** | American football (Madden / Retro Bowl) | character + play-call sim |
| 11 | [Aura Links 3D](../archive/docs/prd/aura-links-3d.md) | **Aura Links 3D** | Golf (PGA / Everybody's Golf) | ball-flight sim, terrain |

## Recommended build order

1. **Iron Crown** — the `fighting-game` template already exists and melee is the
   roster's biggest genre gap.
2. **Aura Hoops 3D** — nearest to the tennis pattern (small court, few bodies,
   skill shot mechanic). Fastest sports win.
3. **Pip's Big Leap** — `game.platformer` kit + platformer geometry certification
   already exist; the work is level design and a mascot (Meshy).
4. **Slingshot Siege** — smallest scope: one camera, one slingshot, stack collapse.
5. **Aura FC 3D** — biggest audience of the sports set; schedule once one sports
   title has validated the shared sim layer.
6. Remaining titles in any order; **Bunker Zero**, **Dot Dash 3D**, and
   **Cross Hop** are each small-scope and good filler between large builds.
