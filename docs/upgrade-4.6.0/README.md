# Upgrading to Aura3D 4.6.0

4.6.0 carries the fixes from the live-games and 4.5.0 audit (`docs/audits/live-games-4.5.0-audit-2026-10-29.md`). No public API is removed or renamed, so existing code builds and runs unchanged. Two changes alter pixels, and a few add diagnostics you may now see.

## Changes that alter pixels

- **Hemisphere lights next to an environment.** In 4.5.0 (and 4.3.7) a `lights.hemisphere` was dropped whenever the scene also had an `environments.*` node or a look with an HDRI. It now lights the scene, applied per normal: the sky colour on up-facing surfaces and the ground colour on down-facing ones. A scene that authored a hemisphere next to an environment reads brighter. To keep the 4.5.0 frame, lower the hemisphere intensity or remove it.
- **A look added at runtime next to an authored ambient light.** The look's fill now yields to the ambient, as it already did for looks in the scene at mount. A game that swaps looks at runtime with `app.nodes.add` (Cross Hop does) no longer lights the scene twice.
- **Instanced nodes and sun cascades.** An instanced node now picks its shadow cascade from where its instances are, not from the node centre. This shows only with the 4.3.0 shadow fit (`?shadowfit=current`).

Scenes that light only with their own lights and no environment are still lit by those lights only (the 4.5.0 behaviour). If a lights-only scene went darker in 4.5.0, add `environments.neutral({ intensity })` and calibrate it against a 4.3.7 capture taken at steady state; Craterline GP (0.9), Chroma Roll (0.8) and Serpentine Sky Run (0.9) did this.

## New diagnostics and APIs

- `?aura3d-render=` and `?aura3d-bloom-fusion=` URL values that are not valid are ignored with a warning instead of stopping the mount. Invalid values passed in code still throw.
- `renderer.quality` given as a string raises `RENDERER_QUALITY_STRING` (a fixed tier applies to phones too) or `RENDERER_QUALITY_INVALID`. Use `renderer: { quality: "auto" }` or `{ quality: { tier } }`.
- `app.screenshotAsync()` waits for pending `stepAsync()` calls and the frame in flight before reading. `app.screenshot()` warns `SCREENSHOT_DURING_ASYNC_FRAME` when called during an async frame.
- `diagnostics().fps` is the average over the frames presented in the last second, not a constant.
- `CONTACT_SHADOWS_WEAK_KEY` warns when contact shadows sit on a directional light too weak for them to show.
- `model()` and `instances.model` raise `OPTION_IGNORED` for keys they do not read, and `primitives.*` no longer drop `transforms` and `colors` silently.
- `playLayer` applies its weight once (a weight of 0.5 used to give 0.25) and a second call on the same layer takes the new clip and mask.
- `physics.bindNodes` keeps a rotated body's orientation on the first step.

## Tooling

- `create-aura3d` downloads template files of 256 KB or more on demand, checked by size and sha256.
- `aura3d check-deploy` warns when shipped JavaScript names `/aura-assets/` URLs the build does not carry.
- `node tools/game-checks/run.mjs` gains warnings for keyboard-only gameplay input, lighting rules, the shared asset catalogue, brand identifiers, stale screens and open upgrade-guide items.

The full list, with the per-game fixes, is in the 4.6.0 entry of `CHANGELOG.md`.

## 4.6.1

4.6.1 is a patch on 4.6.0 with no API removed or renamed. Three engine changes can matter to your code:

- `setScene` called from inside an `onFrame` callback no longer sends that frame to the renderer it just disposed, so a scene swap at the end of a level is safe there.
- With `resize: false`, the engine keeps the page's CSS size on the canvas instead of writing the measured size inline. A canvas that grows after load now fills its new size.
- A colour grade the scene authors next to a look now wins over the look's grade, field by field. A scene that set its own grade beside a look and saw no change will now see it.

`effects.bloom` also accepts `scatter` (the replacement for the deprecated `radius`, with the same value).

