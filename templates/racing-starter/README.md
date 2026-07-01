# Aura3D Racing Starter

Keyboard-playable racing starter using only the public `@aura3d/engine` API.

Status: source-level prototype starter, not a public-quality racing game claim.
It proves input, route progress, checkpoints, lap/reset state, and deployable
source structure. It does not prove that an arbitrary track GLB has certified
road topology, car-to-road binding, camera-safe race composition, or public
visual quality.

- Typed vehicle and track assets are defined in `src/aura-assets.ts`.
- `game.racing(...)` owns route progress, throttle, steering, drift, checkpoint,
  lap, reset, and camera proof state.
- `tests/playable.spec.ts` drives keyboard input and verifies checkpoint/lap
  progression.

Run:

```bash
npm install
npm run dev
npm test
```

Before presenting a generated racing route as a public example, add retained
racing topology evidence, prove the car is visibly bound to the road surface,
capture a readable public screenshot, and pass visual review.
