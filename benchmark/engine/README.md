# Engine Parity Benchmark

The prompt benchmark measures whether agents can build better 3D apps with Aura3D than with raw Three.js. This engine benchmark measures the library itself without the agent layer.

Aura3D is a Three.js competitor, so the engine must be measured directly.

## Reference Scenes

Build each scene twice:

1. Aura3D reference implementation.
2. Raw Three.js reference implementation.

The two implementations must aim for the same visual target. Do not simplify the Three.js version to make Aura3D look better. Do not use Aura3D templates or agent helpers in the Three.js version.

| Scene | What It Tests |
|---|---|
| `engine-01-material-grid` | PBR materials, glass, metal, clearcoat, emissive, studio lighting, environment reflections |
| `engine-02-city-block` | Procedural geometry scale, many objects, windows, streets, day/night lighting |
| `engine-03-particles-vfx` | Particles, bloom, fog/depth falloff, trails or sparks |
| `engine-04-physics-ramp` | Rigid bodies, contacts, constraints or collision behavior, runtime stability |
| `engine-05-sneaker-product` | glTF/GLB loading, auto-scale/framing, studio lights, orbit controls, turntable |

Scene 5 uses only `benchmark/assets/sneaker.glb`.

## Metrics

Record these for Aura3D and Three.js:

- screenshot
- route health
- first usable render time
- p50 FPS after warmup
- p95 frame time after warmup
- draw calls
- triangle count if available
- JS heap peak
- GPU memory if available
- build output gzip bytes
- source lines of code
- visual parity score from neutral reviewer, 1 to 5

## Pass Criteria

The engine benchmark passes only when:

- Visual parity is at least 4 of 5 for every scene.
- No scene drops below 30 FPS on the agreed local benchmark machine.
- Aura3D p50 FPS is no worse than 20% below Three.js in at least 4 of 5 scenes.
- Aura3D p50 FPS is no worse than 35% below Three.js in any scene.
- Aura3D JS heap peak is no worse than 25% above Three.js in at least 4 of 5 scenes.
- Aura3D JS heap peak is no worse than 50% above Three.js in any scene.
- Draw-call differences above 25% are explained in the result file.
- Bundle-size differences are reported. A scene fails if Aura3D adds more than 250 KB gzip over the Three.js reference without a written justification accepted by the user.

These thresholds are not permission to be slower by default. They are the maximum tolerated gap for a higher-level library that claims better authoring ergonomics.

## Result File

Write results to:

```text
benchmark/results/round-N-engine.md
```

The result must include the raw metrics table, screenshots, visual parity notes, scorer signature, user signature `gchahal1982`, date, and commit SHA.
