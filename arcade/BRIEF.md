# Aura3D Arcade — build brief and working conventions

Three original games built on Aura3D 4.0.x, living in `arcade/` inside the aura3d monorepo.

They are **re-expressions**, not clones. Mechanics are borrowed from reference titles; names,
vehicles, worlds, art, audio and code are ours. Read the originality rules before writing anything.

---

## The slate

| # | Game | Genre | Reference (mechanics only) | Status |
|---|---|---|---|---|
| 01 | **Vector Nine** | 3D stunt-driving arena | `aymeric.dev/roadster` | to build |
| 02 | **Backspin** | One-button trick chainer, 2.5D | `roadster.rocks` | to build |
| 03 | **Prism Break** | Circular brick-breaker | `brick-party.html` | built, in polish |

### 01 — Vector Nine
Thruster-assisted stunt driving: jump, hover, boost, drift, air rotation, driving up walls,
time attack with checkpoints and medals. Original: an open-wheel hover coupe on a decommissioned
tidal barrage at golden hour. Events: Time Attack (3 circuits), Free Ride, Score Attack.
**The twist — Flux Grip:** one energy pool feeds both boost and wall grip, so speed and geometry
compete. You cannot have both. That decision is the game.
Look: `golden-hour`, chase camera fov 60, fog 30–180 m. No multiplayer, no netcode.

### 02 — Backspin
Tap to launch a trick, tap again mid-air to extend the combo, hold to hover on a limited air tank;
land inside a timing window for a bonus; a multiplier that climbs on clean landings and decays if
you stall. Original: a hoverbike chaining tricks across a rooftop canyon at night; the score
expression is a **Link** chain.
**The twist — tightening cone:** you must land within an angle cone, and the cone *narrows* as the
multiplier climbs. Difficulty scales with skill, not with time.
Look: `night-city`, side-on camera fov 45. Local best-run table only, no leaderboard service.

### 03 — Prism Break
Paddle orbits the rim, bricks fill concentric rings, ball never leaves play (the rim is a wall;
missing the paddle costs a strike, not a ball). **The twist — shard split:** up to 3 independently
scoring shards, each split shrinking the paddle arc. 12 waves then endless.
Look: `neon-arcade`. Built at `arcade/prism-break`.

---

## Originality rules (non-negotiable)

Do **not** reproduce any reference game's name, logo, UI copy, menu structure, HUD layout, vehicle
silhouette, livery, paint names, photography, art, textures, models, audio, music, SFX, or code.

For the two roadster references specifically: no Tesla name or mark, no Roadster name, no Roadster
silhouette, no real-world photography, no reference to any real reveal event or spec sheet.
If a shape reads as "that car," change the shape.

---

## Environment — read this before your first command

Everything below is a trap that has already cost time. Do not rediscover them.

**Run commands from the app directory.** `vite` and `tsc` live in the repo root's
`node_modules/.bin`, not in the app:

```bash
cd arcade/<app> && ../../node_modules/.bin/vite build
cd arcade/<app> && ../../node_modules/.bin/tsc --noEmit
```

**No install step.** The app aliases `@aura3d/engine` to the repo's prebuilt `dist/`, so it runs
against the working tree. `vite.config.ts` must keep `optimizeDeps.exclude` for the engine and
`server.fs.allow: [repoRoot]`, or the dev server returns 504 / refuses to read outside its root.

**Playwright capture: use `/opt/homebrew/bin/node`, not the managed node.** The managed binary
hits a broker IPC error mid-run (`Broker closed without a response`). Also launch Chromium with
`--use-angle=metal` — the software rasterizer (`--enable-unsafe-swiftshader`) gets SIGKILLed by
memory pressure on a scene of this size.

**Builds take 1.5–3 minutes.** Do not wrap them in `timeout 150`; you will SIGTERM your own build
and misread it as a crash. Build once, then serve with `vite preview` and iterate against that.

**Typecheck needs a capped heap** or the sandbox kills it (exit 137, no output, easily mistaken for
a code error):

```bash
cd arcade/<app> && NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/tsc --noEmit
```

**Ports are assigned per app. Do not use another app's port.**
`prism-break` 5273/5274 · `backspin` 5281/5282 · `vector-nine` 5291/5292.

**Stay in your own directory.** Do not edit `arcade/prism-break` or another app's folder.

---

## Meshy assets

The account is authenticated via the macOS keychain. Load the key into the environment — never
print it, never write it to a file:

```bash
export MESHY_API_KEY=$(security find-generic-password -s "aura3d-meshy-mcp" -w)
meshy balance
```

Cost is **30 credits per asset** (20 preview + 10 refine). Balance as of this writing: ~1,440.
Budget your assets; 3–5 hero assets per game is right. Plan first:

```bash
meshy make "<prompt>" --dry-run
```

Then generate. Output directories must not already exist:

```bash
meshy make "<prompt>" --max-credits 30 -o artifacts/meshy/<game>/<asset>/
```

### Shrink before admitting — this is mandatory

Raw Meshy refine output is 15–75 MB (200k–1.7M verts, 4K PNGs). The engine guardrails cap admitted
assets at 20,000 vertices and ~2 MB. Use `arcade/tools/shrink-glb.mjs`:

```bash
node arcade/tools/shrink-glb.mjs \
  artifacts/meshy/<game>/<asset>/model.glb \
  artifacts/meshy/<game>/<asset>/admitted/model.glb
```

It welds, iteratively simplifies to the vertex ceiling, resizes textures to 1024 and re-encodes,
then writes a `.report.json`. It must report `withinVertexCeiling: true` and
`withinSizeCeiling: true`. A single simplify pass undershoots — the tool loops for that reason.

### Admit through the pipeline

Copy the shrunk GLB to `.../admitted/model.glb`, copy `meta.json` and `thumbnail.png` alongside it,
and write a `rights.json`:

```json
{
  "schema": "aura3d.meshy-rights/1.0",
  "provider": "meshy",
  "providerResource": "text-to-3d",
  "taskId": "<from meta.json>",
  "prompt": "<the prompt>",
  "generatedAt": "2026-10-17",
  "rightsBasis": "Generated with Meshy text-to-3D on an AuraOne-held account. Output rights governed by the Meshy terms of service. Generated content, not CC0, not third-party catalog material.",
  "termsUrl": "https://www.meshy.ai/terms",
  "quality": "candidate"
}
```

Then, **from the app directory**:

```bash
node ../../node_modules/@aura3d/cli/dist/cli.js assets import-meshy \
  "$PWD/../../artifacts/meshy/<game>/<asset>/admitted" \
  --name <typedKey> \
  --rights-evidence "$PWD/../../artifacts/meshy/<game>/<asset>/admitted/rights.json" \
  --profile prop --role prop \
  --allowed-root "$PWD/../../artifacts/meshy" \
  --quality candidate
```

This writes `public/aura-assets/`, `aura.assets.json`, `src/aura-assets.ts` and
`aura-evidence/meshy/`. Game code imports `assets.<typedKey>` — never a raw URL.

Note: `license` will be empty. That is honest — Meshy output is not CC0. Do not invent an SPDX id.

---

## Engine conventions (from `llms.txt`)

1. **Real geometry for hero objects.** No character, vehicle, prop or landmark assembled from
   `primitives.*`. Every hero object mounts a typed GLB via `model(assets.<key>, { targetMaxDimension })`
   — `targetHeight` only for upright humanoids. Primitives are for ground planes, lane markings,
   reticles, UI rings and invisible colliders only.
2. **Look first.** `looks.preset(id, { fogDensityScale: 0, exposureEv: -0.1 })` and spread
   `...looks.appOptions(id)`. No ambient-only lighting, no `pixelRatio` / `qualityProfile` /
   `replaceTextures` overrides, never a solid-void background.
3. **Boot gate.** Frame 1 waits on `await app.ready()`, then clears `#boot-gate`. No pop-in.
4. **Manual control by default.** No autopilot on Frame 1.
5. **Mutate node handles, never `app.setScene()`.** Restart by resetting positions, visibility and
   scale through `app.nodes.require(id)`. `setInstances()` lets you update instanced pools in place.
6. **Full viewport.** `100vw × 100vh` fixed canvas, and a ground apron deep enough that the floor
   edge never crosses the frame.
7. **Audio.** Music plus at least six distinct cues. `sfxUrl("...")` from `@aura3d/engine/game`
   works out of the box; known-good names include `ui.toggle.00`, `ui.toggle.01`,
   `impact.wood.medium.00`, `pickup.coin.00`, `stinger.lose.00`.

### Gotchas already found the hard way

- **A tilted perspective camera silently deletes everything beyond its target plane.** With
  `camera.perspective({ position: [0, 7.4, 5], target: [0,0,0] })`, every render item whose world
  bounds sat past the target was clipped — the entire far half of the arena, bricks and paddle
  both. Primitives with large bounds survived, which makes it look like a geometry bug rather than
  a camera bug. **Use a straight-down `camera.orthographic` for arena-style games**, or keep the
  target beyond the far edge of the content. Diagnosed by moving one object through z and
  screenshotting each step; that is the fastest way to find this class of problem.
- **`primitives.torus` is authored in the XY plane.** Rotate `[-Math.PI/2, 0, 0]` to lay it flat in
  XZ, or a top-down camera sees it edge-on as a bar.
- **`primitives.torus` is authored at radius 0.43** and scaled by `size`. For a rim of radius R,
  pass `size: R / 0.43`. The tube scales with it, so the ring is thicker than you expect.
- **`primitives.plane` is XY**; rotate `[-Math.PI/2, 0, 0]` to lay it in XZ. `size` is a scalar.
- **`model()` normalises a GLB into a unit cube before node scale applies.** Node scale is therefore
  a world-space extent, not a ratio against the asset's raw bounds. Dividing by
  `assets.x.bounds[n]` produces objects a fraction of the intended size — and if you divide on only
  some axes you get a plate standing edge-on to the camera, which reads as "the model doesn't
  render". Use `targetHeight` / `targetMaxDimension` for uniform sizing, or pass true world units.
- **`createGame` invokes the scene factory immediately.** Any state the scene builder reads must be
  declared *above* the `createGame` call, or you get `Cannot access 'x' before initialization`.
- **`app.camera.use()` takes a rig, not a spec.** Use `camera.rigs.static({ position, target, up, fov, near, far })`.
- **`app.pause()` does not stop the frame loop** — the app keeps rewriting node state, so runtime
  probes get overwritten before they render. Use `__AURA3D_LIVE_APPS__.pauseAll()`, and neutralise
  the node's own setter (`node.setInstances = () => node`) if you need to hold a value.
- **Instance colors multiply base color, not emissive.** Per-instance glow is not available; keep
  one emissive on the material and tint via instance color. A pink instance color under a blue
  emissive reads as dark purple.

---

## Verification — definition of done

Every game must pass all of these before it is called finished:

- [ ] `tsc --noEmit` clean, `vite build` clean
- [ ] Route renders a readable frame on load: no black canvas, no floor edge crossing frame,
      no fog whitewash, no blown-out emissives
- [ ] Three captured frames (opening / mid / action) that a stranger can identify as this game
- [ ] Zero primitives in any hero silhouette
- [ ] Full loop playable: boot → play → fail/win → restart → play, with no scene teardown
- [ ] Keyboard and touch both work
- [ ] Audio present with a volume control
- [ ] No asset with missing provenance; `aura.assets.json` complete

Capture with `arcade/tools/capture.mjs`:

```bash
/opt/homebrew/bin/node arcade/tools/capture.mjs http://127.0.0.1:<port>/ arcade/<app>/captures
```

It writes `opening.png`, `mid.png`, `action.png` and prints runtime state, draw calls, node
snapshots and console errors. **Read the PNGs.** A compiling route with a black canvas is a
failure, not a result.

The tool is game-agnostic: publish a runtime state object on
`window.__AURA3D_ARCADE_STATE__` (score, wave/level, entity counts, `gameOver`, look id, asset ids)
and the capture will surface it. Keep your own namespaced global too if you like, but the shared
one is what makes the tool reusable across the slate.

