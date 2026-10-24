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
  uncompressed 4K PNG textures. Before admission, run
  `assets optimize --file in.glb --out out.glb --role <role>` (prop 6,000,
  background 15,000, character 30,000, hero or vehicle 40,000 vertices; textures
  capped at 1024 to 2048 px) and admit with `assets import-meshy --into <dir>
  --prefix <game> --name <role>`.
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
- Scene looks foggy, washed-out, or characters/floors blow out to pure white:
  pass `{ fogDensityScale: 0, exposureEv: -0.1 }` to `looks.preset(...)` for that
  route (`looks.preset` emits `density: 24 / far`, which under `A3D_QR_VFX_FOG`
  can create an `exp2` haze wall at 20–30m). Never pin post-processing or the
  compiler off for every player with a `qualityRebuild.flags` list; install the
  safety net instead. Do not stack
  duplicate high-intensity `lights.directional`, `lights.ambient`, or
  `lights.hemisphere` nodes on top of `looks.preset(...)`. Never set
  `emissive: "#ffffff"` with high `emissiveIntensity` on an instanced pool
  material (`instances.box` / `primitives.box({ instances })`) because
  `instanceColors` multiply `u_baseColor`, not `u_emissiveColor`. Always pass an
  explicit `material: material.pbr({ color })` on untextured Meshy preview GLBs.
- Character or vehicle sinks halfway into logs, pads, or road lanes, or custom
  terrain renders dark/unlit: `model(asset, { targetHeight })` normalizes the
  GLB with `minY = 0` (feet at `position[1]`), whereas `primitives.box` and
  `primitives.cylinder` (`instances.box` / `instances.cylinder`) are centered on
  `[-0.5..+0.5]` so a platform at `(y, sy)` has its top surface at
  `y + sy / 2`. Always place grounded characters and vehicles at
  `platform.y + platform.sy / 2`. Wind custom procedural `primitives.mesh`
  triangles counter-clockwise (CCW) when viewed from `+Y` so `gl_FrontFacing`
  is true and vertex normals receive direct sunlight.
- Bottom or half of the viewport is solid black, or fighters overlap at round
  start: size `html, body, #app, canvas` to `100vw × 100vh` (`position: fixed;
  inset: 0; overflow: hidden`) and extend the 3D ground/stage apron deep enough
  in `+Z`/`-Z` under the camera frustum so the bottom third of the frame never
  exposes the clear-color void. Disable `collision: true` on
  `camera.rigs.shoulder` when the target character has attached child runtime
  nodes at the same position. In fighting and sports games, enforce a minimum
  horizontal pushbox separation (`>= 1.4m`) every frame and spawn fighters at
  `|x| >= 1.8m`.
- Page is black or objects are missing on a real GPU but fine in CI: software GL
  is not real-GPU proof. Open the route with `?diag=1` (GPU, limits, draw calls,
  shader failures, last errors), try `?post=0`, `?shadow=0`, `?env=0`, `?sky=0`,
  `?quality=low` one at a time, and check custom shaders for NaN sources (`pow`
  of a negative base, `normalize` of zero, divide by zero) via the `a3d_math`
  chunk helpers. See `packages/aura3d-cli/skills/aura3d-core/references/pitfalls.md`.
- Textured model drawn through `instances.mesh` or `batched.mesh` is white: fixed
  in 4.1; upgrade, and give the texture `colorSpace: "srgb"`.
- Whole canvas goes blank when an instance list is empty: fixed in 4.1 (empty
  instance arrays are a no-op with an `INSTANCES_EMPTY` diagnostic).
