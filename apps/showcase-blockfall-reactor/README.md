# Blockfall Reactor

Blockfall Reactor is a bounded Aura3D falling-block puzzle candidate. It is a
new game direction for the showcase slate and is intentionally separate from
pre-existing game work.

## Remediation Status

- Classification: release-ready candidate, bounded to current route-primary,
  source deploy, and gameplay evidence.
- Route health: `apps/showcase-blockfall-reactor/route-health.json`.
- Asset status: no typed GLB is used as the public primary subject. The route
  is a procedural Aura3D falling-block game driven by `game.fallingBlocks`; the
  previous cabinet/controller props were removed because they confused the game
  composition.
- Current blocker: none for the bounded public candidate claim. The retained
  route-primary probe now shows a readable, unclipped falling-block board
  composition, source deploy validation passes for the procedural route, and
  Playwright gameplay proof covers move, rotate, drop, score/game-loop, and reset.
  The deploy check is run with `--no-assets` because this route has no typed
  GLB primary asset.
- Primitive status: the board, tetromino cells, rails, glows, HUD anchors, and
  collision visuals are valid procedural geometry for an abstract falling-block
  game.
- Claim status: bounded to the public `game.fallingBlocks` kit, keyboard
  interaction proof, and retained Aura3D route evidence. It does not claim a
  production puzzle game beyond the documented showcase acceptance checks.

## Controls

- `ArrowLeft`/`ArrowRight` or `A`/`D`: move
- `ArrowUp`, `W`, `X`, or `Z`: rotate
- `ArrowDown` or `S`: soft drop
- `Space`: hard drop
- `C` or `Shift`: hold
- `Escape` or `P`: pause
- `R`: reset

Touch controls are exposed in the route for mobile smoke coverage.

## Evidence

The route publishes `window.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__` with status,
controls, systems, public falling-block kit state, HUD/accessibility evidence,
runtime-node evidence, line-clear proof, and replay checksum proof. The live
game state, replay proof, and line-clear proof are all driven by
`game.fallingBlocks`.

## Procedural Scene Workflow

Tetromino blocks, board cells, rails, glows, HUD, and collision visuals are
procedural Aura3D primitives. The route-primary evidence targets the falling
block board itself; no cabinet, pinball-machine, or controller support prop is
part of the live public composition.

## Claim Boundary

The candidate uses procedural Aura3D primitives and the public
`game.fallingBlocks` kit. It does not use raw GLB paths, string asset ids,
private renderer APIs, or a route-local reducer for live gameplay. It does not
claim production puzzle-game launch quality beyond the retained route-primary,
source deploy, and gameplay proof.
