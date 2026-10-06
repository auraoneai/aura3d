# Aura3D Racing Starter

Keyboard-playable racing starter using only the public `@aura3d/engine` API.

Status: source-level prototype starter, not a public-quality racing game claim.
It proves input, route progress, checkpoints, lap/reset state, and deployable
source structure under the `golden-hour` look. It does not prove that an
arbitrary track GLB has certified road topology, car-to-road binding,
camera-safe race composition, or public visual quality.

- Typed vehicle and track assets are defined in `src/aura-assets.ts`; both GLBs
  are authored at real scale (car 3.455 m, circuit 24.651 m — scale 1).
- `game.racing(...)` owns route progress, throttle, steering, drift, checkpoint,
  lap, and reset state; the chase rig + per-frame `setPose` owns the camera.
- `tests/playable.spec.ts` drives keyboard input and verifies checkpoint/lap
  progression plus the committed `tests/geometry-certification.json` screen
  output (`aura3d assets certify-game-geometry --category racing`).

Run:

```bash
npm install
npm run dev
npm test
```

Before presenting a generated racing route as a public example, add retained
racing topology evidence, prove the car is visibly bound to the road surface,
capture a readable public screenshot, and pass visual review.
