# Aura3D Falling Blocks Starter

Keyboard-playable falling-block starter using only the public
`@aura3d/engine` API.

- The scene runs the `neon-arcade` look preset — night-city sky gradient,
  key light, fog and grade are supplied by the look (no ambient fill,
  no `.background` override).
- The arcade cabinet is a typed GLB asset in `src/aura-assets.ts`.
- Every cell renders as an instance of the typed `blockCell` bevelled-cube
  GLB: the settled board is a single `instances.model` mesh rebuilt on
  lock/line-clear/reset, while the four active cells, the board frame, the
  hold preview and the line-clear flash are runtime `model()` nodes of the
  same asset — glossy PBR in the neon-arcade palette.
- `game.fallingBlocks(...)` owns board state, movement, rotation, hold,
  gravity, hard drop, line clear, score, replay, and checksum behavior.
- `tests/playable.spec.ts` drives keyboard input and verifies move, rotate,
  hold, reset, and line clear behavior; `tests/route-health.spec.ts`
  asserts the ready hook, instanced-board evidence and the look id.

Run:

```bash
npm install
npm run dev
npm test
```
