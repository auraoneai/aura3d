# Patrol Wing

Patrol Wing is a single-path `createGame` showcase rebuilt on the salvaged flight core: route-local authored arcade flight over an island arena, six ordered ring gates, three drone waves per patrol, hull pressure, graded pad landings across three escalating patrols, and a non-scoring input-replay ghost. Four original typed CC0 models (staged route-locally in `aura.assets.json`) provide the player aircraft, two drone silhouettes, and the landing-pad beacon; island terrain is triangulated fresh from the extracted course data in `src/gameplay/course-data.ts`.

## Controls

- `Shift` / `Ctrl`: throttle up / down (hold `Shift` on the pad to take off)
- `S` / `W`: pitch up / down (arrow keys alias pitch and roll)
- `A` / `D`: roll left / right; bank also contributes authored turning
- `Q` / `E`: yaw left / right
- `Space`: fire
- `P` or `Escape`: pause/resume
- `R`: reset to the pad (retry the current patrol)
- The `flight` touch preset exposes stick pitch/roll, throttle, fire, and pause.

## Ownership and claim boundary

- Flight position, orientation, throttle response, speed, stall, crash, bounce, and touchdown rules are deterministic route-local TypeScript (`src/gameplay/flight.ts`, stepped through its `terrainHeight` callback). They are intentionally arcade-authored and are not aerodynamic, rigid-body flight, or reusable flight-kit claims.
- Rapier owns only route-local ring, pad, player-proxy, and return-fire-orb sensor queries (`src/gameplay/arena-physics.ts`, extracted verbatim from the retired legacy sky). The authored terrain height function owns terrain/ocean contact truth; no heightfield-collider claim is made.
- Drone pursuit and seeded routes are route-local. Root `game.combatWorld()` owns cannon hit/health resolution. No reusable dogfight AI or combat kit is claimed.
- Rings progress once per sensor entry and in order; skipping a ring invalidates progress until it is re-flown. A patrol grades only when all rings are valid, all waves are cleared, and the pad touchdown bounds in `flight.ts` are met. Hull starts at 100, return-fire orbs and pad bounces reduce it, and hull failure or a crash ends the sortie.
- The ghost is a visual input replay of the best graded (or last) sortie only; it has no collision, combat, sensor, score, or landing effect.
- Direction audio events play through the shared sfx-pack cue mechanism; `wind-speed` is a continuous bed this rebuild does not cue discretely. Published audio evidence reports requested versus actually-played cues honestly.

## Evidence boundary

Machine evidence includes the salvaged flight/combat unit suites (17 + 6 cases, imports repointed to `src/gameplay/**`), the PRD-14 stall/rig/scene-builder unit pins, and the app playable/route-health plus PRD-14 dispatch browser specs against `window.__aura3dGameSnapshot`. These checks do not constitute independent human visual approval. The route remains `prototype-blocked` and `publicShowcase: false` until a separate reviewer approves the exact hash-bound desktop, mobile, and reduced-motion artifact family.
