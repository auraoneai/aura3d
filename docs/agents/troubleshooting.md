# Troubleshooting

- Missing canvas: ensure the selector passed to `createAuraApp("#app", ...)`
  exists or pass a real canvas element.
- Missing asset: run `assets add` and import the generated `assets` object.
- Failed GLB/glTF load: run `assets validate` and check file paths.
- Unsupported texture: use png, jpg, jpeg, webp, or ktx2.
- Deployment missing files: run `check-deploy` and upload hashed assets.
- Particle prompt shows zero particles: replace symbolic emitter geometry with
  `effects.particles(...)` or `prefabs.particleFountain(...)` and recapture.
- Material lab looks like identical spheres: use `material.metal()`,
  `material.glass()`, `material.rubber()`, `material.emissive()`, and
  `material.clearcoat()` in the same scene.
- Empty data-viz screenshot: use `prefabs.dataBars3D({ grid: 6 })`, keep the
  3D bars, caps, axes, labels, callout, trend ribbon, and bloom in frame, and
  do not recreate the Aura app every animation frame.
- Neon tunnel looks like a flat portal: use `prefabs.neonTunnel({ rings: 18 })`
  with the dolly camera so octagonal rings, braces, rails, floor reflections,
  sparks, fog, bloom, and particles create visible depth.
- Dev server never exits in an agent run: run the build/test commands needed for
  verification, then stop the server or rely on the benchmark harness to launch
  preview. Do not leave `npm run dev` as the final command.
