# Troubleshooting

- Missing canvas: ensure the selector passed to `createAuraApp("#app", ...)`
  exists or pass a real canvas element.
- Missing asset: run `assets add` and import the generated `assets` object.
- Failed GLB/glTF load: run `assets validate` and check file paths.
- Unsupported texture: use png, jpg, jpeg, webp, or ktx2.
- Deployment missing files: run `check-deploy` and upload hashed assets.
- Particle prompt shows zero particles: replace symbolic emitter geometry with
  `effects.particles(...)` or `prefabs.particleFountain(...)`; use a real
  `ui.range`/`ui.onInput` emission control instead of a text-only button.
- Material lab looks like identical spheres: use `material.metal()`,
  `material.glass()`, `material.rubber()`, `material.emissive()`, and
  `material.clearcoat()` in the same scene.
- Empty data-viz screenshot: use `prefabs.dataBars3D({ grid: 6 })`, keep the
  3D bars, caps, axes, labels, grounded legend, hover callout, and bloom in
  frame, and add DOM title, axis labels, numeric ticks, and hover/readout text.
  Do not recreate the Aura app every animation frame.
- Neon tunnel looks like a flat portal: use `prefabs.neonTunnel({ rings: 24 })`
  with an inside-the-tube dolly camera so receding rings, wall chords, rails,
  floor reflections, sparks, fog, bloom, and particles create visible depth.
- City day/night toggle only changes button text: rebuild or update the Aura
  scene on click so sky, lighting, window emissive state, street lights, and the
  foreground state marker visibly change.
- Dev server never exits in an agent run: run the build/test commands needed for
  verification, then stop the server or rely on the benchmark harness to launch
  preview. Do not leave `npm run dev` as the final command.
