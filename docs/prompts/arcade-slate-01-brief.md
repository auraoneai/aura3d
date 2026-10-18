# ARCADE SLATE 01 — Build Brief

**Type:** build brief for a coding agent working inside the `aura3d` repo
**Goal:** ship three playable browser games on Aura3D 4.0.x that take the *mechanics* of three reference games and re-express them as originals.

---

## 1. Mission

Build three games. Each takes one proven mechanic from a reference title below and rebuilds it from scratch as an original game — new name, new vehicle/character, new world, new art direction, new tuning. The mechanics are the brief; the expression is ours.

The slate is also a platform demonstration. Together the three games must exercise the full Aura3D stack — typed asset pipeline, look presets, effects, physics, game kits, game feel, audio, CLI capture/lint tooling — not one narrow slice of it three times.

Reference titles (for mechanic study only):

| # | Reference | Genre to borrow |
|---|---|---|
| 01 | `aymeric.dev/roadster` — *Roadster Stunt Arena* | 3D stunt-driving arena: thrusters, air rotation, wall riding, time attack |
| 02 | `roadster.rocks` — *Roadster Flip* | One-button trick chainer: tap / tap-in-air / hold, perfect-landing timing, escalating multiplier |
| 03 | `miaai-lab.github.io/.../049-brick-party.html` — *Brick Party* | Neon brick-breaker: paddle, ball, destructible grid, power-ups |

## 2. Non-negotiable: expression must be original

Mechanics are not ownable. Expression is. Do **not** reproduce, trace, port, or approximate any reference game's:

- name, logo, wordmark, UI copy, menu structure, or HUD layout;
- vehicle silhouette, livery, paint names, or product photography;
- art assets, textures, models, audio, music, sound effects, or code;
- brand associations, real-world product names, or "fan-made / not affiliated" framing.

Specifically for the two roadster references: no Tesla name or mark, no Roadster name, no Roadster silhouette, no real-world photography, no reference to any real reveal event or spec sheet. Design an original vehicle and an original world. If a shape reads as "that car," change the shape.

Every asset comes from the Aura3D catalog, is generated bespoke via Meshy, or is authored in-repo. No scraped files.

## 3. The three games

Names below are proposals — keep them unless instructed otherwise. Each entry lists what is **borrowed** (the mechanic) and what is **original** (the expression and the twist that makes it ours).

### 01 — VECTOR NINE
*3D stunt-driving arena*

- **Borrowed:** thruster-assisted stunt driving — jump, hover, boost, drift; air pitch/spin/roll; driving up walls; time-attack with checkpoints and medals.
- **Original:** an original open-wheel hover coupe on a decommissioned tidal barrage at golden hour. Three events, single-player only: **Time Attack** (3 circuits, medal tiers), **Free Ride**, **Score Attack** (chain stunts in a fixed window).
- **The twist — Flux Grip:** one shared energy pool feeds both boost and wall grip. Grip is charge-based: riding a wall drains it, and so does speed. You cannot have both at once. Every wall ride is a decision about speed, which the reference never asks of you.
- **Stack slice:** vehicle physics + rigid bodies, `game.racing`, `game.feel` (camera trauma, speed lines, landing dust), `effects.trail`, `effects.contactShadows`, chase + cockpit + showroom-orbit cameras.
- **Look:** `golden-hour` preset, chase camera fov 60, fog 30–180 m.
- **Cut:** no multiplayer, no 20-player league, no netcode. Not in scope.

### 02 — BACKSPIN
*One-button trick chainer, 2.5D*

- **Borrowed:** the input grammar — tap to launch a trick, tap again mid-air to extend the combo, hold to hover on a limited air tank; land inside a timing window for a bonus; a multiplier that climbs with clean landings and decays if you stall.
- **Original:** a hoverbike instead of a car, chaining tricks across a rooftop canyon at night. Score expression is a **Link** chain, not a flow meter.
- **The twist — tightening cone:** you must land within an angle cone, and the cone *narrows* as the multiplier climbs. The better you are, the tighter the margin. Difficulty scales with skill instead of with time, which neither reference does.
- **Stack slice:** timing and animation state, `game.feel` (`hitStop`, `slowMo`, `speedLines`, `landingDust`), `effects.trail`, `effects.neonBloom`, procedural or catalog audio.
- **Look:** `night-city`, side-on camera fov 45, neon accents against sodium haze.
- **Cut:** no global leaderboard service. Local best-run table only.

### 03 — PRISM BREAK
*Circular brick-breaker*

- **Borrowed:** paddle, ball, destructible brick grid, escalating speed, power-ups.
- **Original:** the arena is a **circle**. The paddle orbits the rim, bricks fill concentric rings, and the ball never leaves play. Neon-on-black, light-refraction art direction.
- **The twist — shard split:** the ball can split into up to three independently scoring shards, and each split *shrinks* your paddle arc. More scoring surface, less defense. Risk and reward on the same button.
- **Stack slice:** `game.fallingBlocks` as the brick-grid base, `effects.neonBloom`, `effects.meshParticles` on break, contact shadows on the ring, audio-reactive rim.
- **Look:** `space` or `night-city` base with a hard neon grade, top-down camera fov 40.
- **Scope:** 12 authored waves, then endless with escalating speed.

## 4. Shared technical contract

Follow the Aura3D agent guide (`llms.txt`) and its mandatory game guardrails. Non-negotiables:

1. **Real geometry.** No character, vehicle, prop, or landmark assembled from `primitives.*`. Every hero object mounts a typed GLB via `model(assets.<name>, { targetMaxDimension })` — `targetHeight` only for upright humanoids. Primitives are for ground planes, lane markings, reticles, and invisible colliders only.
2. **Look first.** Every scene opens with a `looks.preset(...)` and spreads `...looks.appOptions(id)`. No hand-wired ambient-only lighting, no `pixelRatio` / `qualityProfile` / `replaceTextures` overrides, no solid-void background.
3. **Boot gate.** Frame 1 waits on `await app.ready()`, then fades `#boot-gate` and starts the loop. No pop-in.
4. **Manual control by default.** `autopilot = false` on Frame 1. Autoplay only behind `?autoplay=1` or an explicit HUD toggle, and it yields to any real input.
5. **Assets through the pipeline.** `npx @aura3d/cli@latest assets search "<phrase>"` → `assets resolve "<phrase>" --name <key>` → typed `assets.<key>` with a valid 64-char `sha256-` hash. Bespoke models go through Meshy, then decimate to ≤ 20,000 vertices and ≤ 2 MB with textures ≤ 1024², then `aura3d assets import-meshy`. No raw URLs, no `GLTFLoader`, no `three` imports.
6. **Restart by mutation.** Reset rounds, waves, and runs through runtime node handles (`app.nodes.require(...)`). Never call `app.setScene()` to restart on the same stage.
7. **Frame the world.** `100vw × 100vh` fixed canvas, ground apron deep enough that the bottom third of the viewport is never clear-color black.
8. **Fast-action exposure.** Pass `{ fogDensityScale: 0, exposureEv: -0.1 }` to `looks.preset(...)` plus `qualityRebuild: { flags: ["game", "-compiler", "-post", "-vfxFog"] }` unless distance haze is deliberately wanted.
9. **Input parity.** Keyboard and touch both work, both remappable in a controls panel. Blur buttons after click so `Space`/`Enter` never re-trigger focused HUD.
10. **Audio.** Ships with each game — music plus at least six distinct effects. Catalog, Meshy-generated, or procedurally synthesized. Nothing ripped.

## 5. Build order

1. **Contract pass.** Scaffold all three from `create-aura3d`, resolve the asset sets, lock the three look briefs (3 lines each: reference frames, palette, atmosphere). No gameplay yet.
2. **One vertical slice at a time**, in order 03 → 02 → 01. Prism Break proves the loop and the tooling fastest; Vector Nine is the heavy one and benefits from everything learned.
3. **Look-dev loop per game:** build → `aura3d look capture --route / --shots opening,mid,action` → judge against the rubric → `aura3d look lint` → fix the single highest-leverage issue → repeat until every category reads 7+ or the loop goes flat.
4. **Slate shell.** A single index page linking all three, consistent chrome, shared type and color tokens.

## 6. Definition of done — per game

All of these, or it is not done:

- [ ] Route renders a readable frame on load: no black void, no fog whitewash, no blown-out emissives
- [ ] `aura3d look capture` produces three distinct frames (opening / mid / action) that a stranger can identify as this game
- [ ] `aura3d look lint` clean
- [ ] Zero primitives in any hero silhouette
- [ ] 60 fps sustained at 1080p on the reference machine, measured not assumed
- [ ] Full loop playable start to finish: boot → play → fail/win → restart → play, with no scene teardown
- [ ] Keyboard and touch both verified
- [ ] Audio present and mixed, with a volume control
- [ ] `pnpm typecheck` and `pnpm lint` clean
- [ ] No asset with missing provenance; `aura.assets.json` complete

## 7. Out of scope

No multiplayer or netcode. No backend, accounts, or hosted leaderboard service. No app-store packaging. No monetization. No analytics. If a reference game has a system in this list, drop it and say so.

## 8. Reporting

After each game, report: the look brief, the frames captured, the single biggest thing that was cut from the reference and why, and anything the platform could not do without a workaround. The last one matters most — it is the input to the next engine release.
