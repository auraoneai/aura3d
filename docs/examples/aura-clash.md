# Aura Clash in Aura3D 2.0

Status: development-showcase documentation; human visual approval pending

Aura Clash is a playable 2.5D arena-fighter showcase built from typed GLB
fighters, Aura3D animation/rendering packages, deterministic input/combat state,
and route-owned game rules. It demonstrates a bounded application workflow; it
does not establish a reusable production fighting-game kit or commercial-game
parity.

## Current implementation

- Route: `/showcase/aura-clash/playable/`
- Source: `apps/aura-clash-showcase/`
- Player fighter: `auraClashPlayerRig`, a 13-mesh, 12-clip, 65-joint typed GLB
  with an exposed face and silver hair.
- Rival fighter: `auraClashRivalRig`, a 9-mesh, 10-clip, 65-joint typed GLB
  with a hooded silhouette.
- Primary environment: typed neon-downtown/rooftop arena assets with
  provenance recorded in `aura.assets.json`.
- Controls cover movement, jump/down input, dash, guard, light, heavy, special,
  pause, reset, and accessibility settings.
- Combat state covers hit detection, damage, stun, knockback, guard, AI spacing
  and attacks, KO, and round reset.

The route uses real fighter rigs rather than primitive primary characters. UI
remains DOM-based UI; it is not counted as renderer evidence. Debug hit volumes
are disabled in normal play.

## Evidence contract

The app's 2.0 evidence must prove:

- production build and route boot without console or network failures;
- two typed fighter runtime nodes and advancing rendered frames;
- distinct visible poses for movement, guard, jump, light, heavy, special, hit,
  down, KO, and reset states;
- player input changes runtime state and scene pixels;
- attacks reduce health and HUD values reflect real game state;
- KO suppresses repeat-hit loops and reset produces a playable round;
- asset provenance, mesh/clip/joint thresholds, and browser-safe package use;
- desktop/mobile accessibility and exact screenshot hashes.

Canonical machine outputs live in
`apps/aura-clash-showcase/launch-evidence/`. The launch manifest and review
package identify their producer commands and exact artifacts. Generated files
are evidence, not source documentation.

## Current verification

The 2.0 candidate has passing production build, 22-state playable coverage,
12-state visual regression, asset-quality, provenance, deterministic replay,
camera/combat feedback, performance-budget, audio, accessibility, screenshot,
and flagship-readiness gates. Those machine checks do not grant aesthetic
approval.

## Claim boundary

The canonical vocabulary and proof rules are defined in
[`docs/agents/claims-and-boundaries.md`](../agents/claims-and-boundaries.md).

Safe wording: "playable Aura3D arena-fighter development showcase with typed
rigged characters and deterministic combat evidence."

Do not call it a production fighting-game framework, Mortal Kombat/Street
Fighter parity, photorealistic, launch-approved, or proof of arbitrary fighter
asset compatibility. Promotion remains blocked until a named human reviewer
approves the exact final screenshots and interaction build.
