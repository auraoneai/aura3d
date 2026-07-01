# Aura3D Falling Blocks Starter

Keyboard-playable falling-block starter using only the public
`@aura3d/engine` API.

- The arcade cabinet is a typed GLB asset in `src/aura-assets.ts`.
- `game.fallingBlocks(...)` owns board state, movement, rotation, hold,
  gravity, hard drop, line clear, score, replay, and checksum behavior.
- `tests/playable.spec.ts` drives keyboard input and verifies move, rotate,
  hold, reset, and line clear behavior.

Run:

```bash
npm install
npm run dev
npm test
```
