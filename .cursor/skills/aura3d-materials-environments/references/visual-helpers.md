# Visual helpers: strata, caustics, god rays, light beams

Judge each in a real-GPU capture, not from the declaration.

- `material.strata({ bands, colors, heightRange, noise, noiseScale, seam, variation, slope, roughness, seed })`: height-banded
  rock lit by scene lights and the environment. `slope: { angle, blend, flatColor }` gives flat ground its own colour and bands only
  steep faces, so a canyon wall separates from its floor. Apply it to a `geometry.custom` heightfield (recipe 13) or any mesh. Static: it
  never forces redraws.
- `material.caustics({ color, causticColor, strength, scale, speed, surfaceY, depthFade, roughness })`: a lit floor with moving
  caustic light projected straight down in world X/Z. It reads `uTime`, so it animates only while the app draws frames: a
  scene with a `uTime` custom shader is a declared time consumer on builds that carry `timeConsumers`; elsewhere add
  `app.onFrame(() => {})` or a looping timeline.
- `effects.godRays({ source, intensity, decay, samples, color, density, medium })`: screen-space shafts (post stage S4, WebGL2
  v2 chain). `source` is `"sun"` (the strongest directional light), a world point or a light-like `{ position }` / `{ direction }`.
  Shafts need emitters: visible sky or a bright object near the light, and the light in front of the camera. `samples` is capped by the
  quality tier, and the stage is off on the Low tier. Where the backend cannot sample depth the depth-aware chain throws
  `DEPTH_POSTPROCESS_UNSUPPORTED`, as for every depth-aware post effect.
- `effects.volumetricBeam({ position, direction, length, endRadius, color, intensity, falloff, edgeSoftness, noise })`: an open
  additive cone mesh (a primitive node) with a soft silhouette and drifting dust noise; two beams make a lighthouse.
  `material.lightBeam(options)` is the same shader for your own cone.
