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
   already exist; the work is level design and a mascot.
4. **Slingshot Siege** — smallest scope: one camera, one slingshot, stack collapse.
5. **Aura FC 3D** — biggest audience of the sports set; schedule once one sports
   title has validated the shared sim layer.
6. Remaining titles in any order; **Bunker Zero**, **Dot Dash 3D**, and
   **Cross Hop** are each small-scope and good filler between large builds.
