# Ninja Runner port - notes

Phase C exit for the three.js parity PRD (R-20), plus the art-fidelity pass. Reference: Crayon "Ninja Runner" (three r184 bundle).

## What is exact

- `course.ts` / `sim.ts` are line-for-line transcriptions of the original's seeded xorshift course (seed 17) and fixed-step simulation (`1/120`). The art pass did not touch them.
- Course digest `ce4c2fda` (entities + FNV-1a) matches the original.
- The recorded reference run (12,759 steps / 106.325 s / 102 kills / score 39,735 / win) replays event-for-event; max trace delta 0 against a 1e-9 tolerance floor. The idle run loses at 604.49 in both.
- Four independent capture sessions were bit-identical (`evidence/crayon-capture/ninja-runner-reference.json`).

## What the art pass added (rendering, UI and audio only)

- **Lighting.** Outdoor HDRI image-based light, a directional sun matching the original's rig (warm key, hemisphere fill, cool rim), exponential haze at the original's range, bloom, grade, vignette and FXAA. Measured targets are in `evidence/look-specs/ninja-runner.json`: ACES, exposure 1.02, key `#ffe3b1` x3, hemisphere `#d3ebf3`/`#80715b`, fog `#b5c8c4`. **Cast shadows are off.** Remote probes (`tests/browser/ninja-runner-budget-*.spec.ts`, run `nr-art-c*`/`nr-art-d*`) showed that with the cascaded sun shadow enabled the engine's shadow lookup marks every receiver as fully shadowed in this scene (diagnostics still report the map as sampled): with the HDRI removed the scene goes black; one cascade, 4096 map, zero normal bias, a 600 m camera far and plain `shadow: true` all behave the same, and with shadows off the sun shades by direction. The cause is in the engine's shadow path, not found yet. Actors keep blob shadows; ambient occlusion is dropped by the engine (missing normals input) and contact shadows were removed to save a depth pass.
- **Ground.** One lit PBR mesh per distinct surface and tint (nine in all, merged across biomes) with painted, tiling cobble, packed-earth, scale-tile, plank and grass textures plus normal maps derived from the same height fields (`textures.ts`, painted at boot, no files).
- **Scenery** (`scenery.ts`, `shapes.ts`): about eleven thousand instanced PBR pieces in fifteen draw layers: plastered houses and round towers with gable and conical tiled roofs, timber bands, shuttered windows, doors, chimneys, paper lanterns and lamp posts, market stalls, low walls, gates, rooftop tile ribs and neighbouring roofs over a lower street, the river crossing's planks, rails and pylons, a pine forest with leafy and bark textures, riverbank and valley rocks, grass tufts, and distant hills and mountains. Layout follows the course's biome table.
- **Characters.** One `cloneSkinned` call still builds all twelve actors (independent skeletons and mixers, shared textures), now from a rigged CC0 humanoid (`assets/ninja-rig.glb`, 65 joints, catalog `auraClashPlayerRig`, see `assets/ATTRIBUTION.md`) instead of the soldier fixture. The sim state picks the clip per actor: sprint, jump, slide (crouch), spiral-orb punch, gale-star cast, hit reaction, death; enemies idle, run and play their windup/release/recover as sword, jab, block or punch poses. Forms are tints and emissive plus an aura shell and rising embers; enemy types differ by tint, scale and attached props (blade, kunai, club, spirit orb) that follow the hand bones. Blob shadows ground every actor.
- **Effects.** Spiral orb and sparks in the hero's hand bone, gale-star shuriken, shadow-clone ghosts, dust at the feet, hit/kill/break/dash/form bursts, camera shake and a screen flash on damage, a wider field of view while dashing.
- **UI and audio.** Title card with controls, 3-2-1 countdown for player-initiated starts, pause, results, district banner, progress bar with form markers, ability cooldowns and affordability, combo counter, mute. Procedural Web Audio (`audio.ts`): an effect for every sim event, a wind bed and a pentatonic score whose layers follow the form and speed. All copy is generic (`labels.ts`).

## What is still approximate

- The original's character and enemy models, textures, portraits and audio are not redistributed; every look here is independently built, so no pixel parity is claimed.
- The ported shaders (sky, river, falls, orb, sparks, chakra flames, particles) are the original's seven factories as `material.custom` GLSL 300 es (linked under glslang in `tests/unit/ninja-runner-port/shaders-compile.test.ts`).
- Enemy variety is tint, scale and props on one rig; the original has distinct enemy models.
- Fog colour is one value; the original blends towards a greener fog in the forest.
- The original's attack code path for approaching enemies (`rS`) is transcribed but was never fired in any capture, so it is unverified.
- The route's far verge is pulled in on the inside of bends (`foldFree`) to avoid self-overlap; that changes only unreachable terrain.

## Running

- Unit: `pnpm exec vitest run tests/unit/ninja-runner-port tests/unit/tooling/crayon-capture-ninja-runner.test.ts`
- Browser (remote only): `SPECS=tests/browser/ninja-runner-port.spec.ts tools/remote-acr/run.sh` (behaviour and replay), `SPECS=tests/browser/ninja-runner-art.spec.ts tools/remote-acr/run.sh` (art frames, then `tsx tools/crayon-capture/ninja-runner-art-frames.ts <acr-run.log> <tag>`).
- Blind judge (model, not human): `tsx tools/crayon-capture/ninja-runner-judge.ts --port-prefix evidence/ninja-runner-port/art-<tag> --label <label>`.
- Re-capture the original: `tools/crayon-capture/ninja-runner.ts` (remote ACR recipe in `evidence/crayon-capture/README.md`), then `ninja-runner-assemble.ts`.

## Budget and gates

- Draw calls at the village frame: 1,249 before the budget pass (cascaded shadow passes over 13-mesh skinned actors, 22 ground meshes, three cascades) -> 133 now (`NINJA_RUNNER_BUDGET`, 960x540, high quality). Actors and small props no longer cast shadows, ground meshes are merged by surface, sun shadows and contact shadows are off.
- `tests/browser/ninja-runner-port.spec.ts` now runs at 480x270 / `quality=low`, advances the sim without per-chunk renders (`advanceTo`), and every page call has a 240 s hard timeout; it passes remotely in about 11 minutes under software GL (run `nr-art-beh3`), including the step-exact replay of the original's 12,759-step run.
