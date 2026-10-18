# Agent Quickstart

Aura3D Agent Quickstart: prompt to browser 3D with TypeScript, scene kits, typed GLB/glTF assets, Vite templates, diagnostics, screenshots, and static deploy checks.

Use this quickstart to build AI-generated browser 3D scenes, GLB product viewers, and Vite 3D apps with Codex, Claude Code, Cursor, Copilot-style agents, or any coding agent that writes TypeScript.

Read `llms.txt` first. Then read `docs/agents/claims-and-boundaries.md` for the hard rules that prevent primitive slop, raw asset IDs, Three.js loader code, CSS scene effects, and overclaimed root `createAuraApp` capabilities.

## Golden path

1. Scaffold with `npx create-aura3d@latest my-scene --template product-viewer`.
2. Search/resolve a catalog asset or add a user-approved local asset:

   ```bash
   npx @aura3d/cli@latest assets search "studio robot"
   npx @aura3d/cli@latest assets resolve "studio robot" --name robot
   npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
   ```

3. Import `assets` from `src/aura-assets.ts`.
4. Compose a scene with `scene()`, `model(assets.robot)`, `camera`, `lights`, `material`, `effects`, `timeline`, and `interactions`.
5. Run `npm run build`, `npm run test`, screenshot evidence, route-health or equivalent diagnostics, and `npx @aura3d/cli@latest check-deploy`.

## Mandatory 3D game & scene anti-failure guardrails

1. **No primitive-box characters, vehicles, or hero props ("no stick-figure humans or box cars") & prop normalization (`targetMaxDimension` vs `targetHeight`)**:
   - Never assemble characters, athletes, enemies, vehicles, aircraft, trees, or architectural landmarks out of `primitives.box`, `primitives.sphere`, or `primitives.cylinder` — keep every silhouette, look, lighting, and shadow readable with real 3D geometry.
   - Every character, vehicle, creature, weapon, and landmark must mount a real 3D GLB via `model(assets.<name>, { targetMaxDimension, role })` from `src/aura-assets.ts`. Use `targetHeight` only for upright humanoids and `targetMaxDimension` for horizontal vehicles, rackets, paddles, weapons, barriers, and wide props so aspect ratios never stretch vertically.
   - Drive rigged humanoid and creature GLBs (`skins > 0`) via `handle.setAnimation({ clip, loop: true, speed })` (or `AnimationController`) synchronized to locomotion (`idle`, `walk`, `run`, `attack`, `swing`) so limbs articulate under the key light and shadow instead of sliding rigid statues across the floor.
   - Primitives (`primitives.plane`, `primitives.box`, `primitives.cylinder`, `primitives.torus`) are reserved strictly for ground/court surfaces, field lines, UI rings/reticles, laser beams, and invisible physics colliders.
2. **Boot sequence gate (`await app.ready()`) & default manual control (`autopilot = false` on Frame 1)**:
   - Gate Frame 1 on `await app.ready()` before fading out `#boot-gate` (`opacity: 0; pointer-events: none` then remove) and starting the gameplay simulation loop so lighting, shadow, and GLB silhouettes never pop in mid-frame.
   - Default `autopilot` / AI demo mode to `false` (immediate manual control on Frame 1 once `#boot-gate` clears); enable AI autopilot only when `?autoplay=1` or `?demo=1` is present in the URL or when the user clicks the HUD `Auto` toggle button, and yield back to manual control on keyboard (`keydown`), pointer, touch, or gamepad input.
   - Keep mode, stage, camera, `Auto`, and roster selectors in a compact, non-blocking top HUD bar that preserves camera framing, and always call `button.blur()` after button clicks so `Space` or `Enter` gameplay keys never re-trigger focused HUD buttons.
3. **Always decimate & compress Meshy 3D GLBs before admission (`<= 20,000` vertices, `<= 2 MB`, 16-bit indices)**:
   - Every generated Meshy GLB must be simplified (`MeshoptSimplifier` to `<= 20,000` vertices for props/vehicles, 16-bit `Uint16Array` indices, de-interleaved `byteStride === 0` buffers) and have its textures compressed to `<= 1024x1024` (`~0.5–2.0 MB` per GLB) before being admitted into `public/aura-assets/` so PBR palette, contrast, and reflection stay responsive.
4. **Always use canonical typed asset manifest refs (`hash` required)**:
   - The production glTF bridge requires `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`, which requires a valid 64-character `sha256-...` `hash` and `public/aura-assets/...` provenance from `aura.assets.json` / `src/aura-assets.ts` so the rendered look and silhouette load cleanly.
5. **Mutate node handles instead of calling `app.setScene()` on every restart**:
   - Do not call `app.setScene()` when restarting a round, hole, or bout on the same stage/world; track a scene signature (`stageId` / `worldId`) and reset positions, visibility, and animations through runtime node handles (`app.nodes.require(...)`).
6. **Prevent fog whitewash, overexposure, and instanced emissive blowout (`qualityRebuild.flags`)**:
   - Pass `{ fogDensityScale: 0, exposureEv: -0.1 }` to `looks.preset(...)` and include `qualityRebuild: { flags: ["game", "-compiler", "-post", "-vfxFog"] }` alongside `...looks.appOptions(...)` on fast action/arcade routes unless distance haze is explicitly desired.
   - Never stack duplicate high-intensity `lights.directional`, `lights.ambient`, or `lights.hemisphere` nodes on top of `looks.preset(...)`, and never set `emissive: "#ffffff"` with high `emissiveIntensity` on an instanced pool material (`instances.box` / `primitives.box({ instances })`).
7. **Ground `model()` feet on platform top surfaces (`y + sy / 2`) & wind custom meshes CCW**:
   - `model(asset, { targetHeight })` normalizes the GLB with `minY = 0` so `position[1]` is the bottom (feet/tires) of the model, whereas `primitives.box` and `primitives.cylinder` (`instances.box` / `instances.cylinder`) are centered on `[-0.5..+0.5]` so a platform at `(y, sy)` has its top surface at `y + sy / 2`. Wind custom procedural `primitives.mesh` triangles CCW when viewed from `+Y`.
8. **Enforce full-viewport `100vw × 100vh` canvas, deep ground apron, and pushbox separation**:
   - Size `html, body, #app, canvas` to `100vw × 100vh` (`position: fixed; inset: 0; overflow: hidden`), extend the 3D ground/stage apron deep enough in `+Z`/`-Z`, disable `collision: true` on `camera.rigs.shoulder` when the target character has attached child runtime nodes, and enforce `>= 1.4m` fighter pushbox separation (`|x| >= 1.8m` at spawn).
