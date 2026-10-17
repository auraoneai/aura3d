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
- Characters, athletes, enemies, vehicles, aircraft, trees, or landmarks look
  like stick-figure humans or box cars: never assemble primary subjects out of
  `primitives.box`, `primitives.sphere`, or `primitives.cylinder`. Mount a real
  3D GLB via `model(assets.<name>, { targetMaxDimension, role })` from
  `src/aura-assets.ts` so every silhouette, look, lighting, and shadow reads
  cleanly (or generate a bespoke PBR 3D model with `meshy` and admit it via
  `aura3d assets import-meshy`). Reserve `primitives.plane`, `primitives.box`,
  `primitives.cylinder`, and `primitives.torus` strictly for ground/court
  surfaces, field lines, UI rings/reticles, laser beams, and invisible physics
  colliders.
- Game route boots into a static menu, frozen canvas, or requires query params
  to animate: never hide the 3D canvas, camera framing, or atmosphere behind an
  opaque full-screen HTML start menu, character select modal, or briefing
  overlay on initial page load, and never require `?autoplay=1`, `?demo=1`, or
  `?play=1`. Start in active 60 FPS gameplay on Frame 1 with an intelligent AI
  autopilot/demo controller that plays autonomously and yields instant manual
  control on the first `keydown`, pointer, touch, or gamepad input. Keep mode,
  stage, camera, and roster selectors in a compact, non-blocking top HUD bar,
  and always call `button.blur()` after button clicks so `Space` or `Enter`
  gameplay keys never re-trigger focused HUD buttons.
- Meshy GLB stalls main-thread glTF parsing or exhausts GPU memory: raw Meshy
  exports often contain `200,000–1,750,000` vertices and `20–65 MB` of
  uncompressed 4K PNG textures. Before admission into `public/aura-assets/`,
  simplify every generated Meshy GLB (`MeshoptSimplifier` to `<= 20,000`
  vertices for props/vehicles, 16-bit `Uint16Array` indices, de-interleaved
  `byteStride === 0` buffers) and compress textures to `<= 1024x1024`
  (`~0.5–2.0 MB` per GLB) so PBR palette, contrast, and reflection load fast.
- Custom `defineAssets(...)` model is dropped by the production glTF bridge or
  collides across routes: the production glTF bridge requires
  `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`,
  which requires a valid 64-character `sha256-...` `hash` and
  `public/aura-assets/...` provenance from `aura.assets.json` /
  `src/aura-assets.ts` so the rendered look and silhouette load cleanly. Never
  omit `hash` in custom `defineAssets(...)` declarations and never place
  unhashed duplicate GLBs in route-local `apps/<route>/public/aura-assets/` that
  collide with root `public/aura-assets/`.
- Restarting a round, hole, or bout flashes, drops textures, or aborts in-flight
  GLB loads: do not call `app.setScene()` when restarting on the same
  stage/world (`stageId` / `worldId`); tearing down and remounting the scene
  disposes live GPU resources and breaks lighting and postprocess continuity.
  Track a scene signature (`stageId` / `worldId`) and reset positions,
  visibility, and animations through runtime node handles
  (`app.nodes.require(...)`).
