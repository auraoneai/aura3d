# Apex Overdrive: previous build vs native-sim build

- `previous/` - build at 2302b45c6 (original `/roadster-rush/engine.js` simulation, Aura3D as renderer).
- `native/` - build at origin/main after 5e62056d8 (native fixed-step TypeScript sim, same Aura3D render sync).
- `compare-previous-vs-native.jpg` - side-by-side sheet (previous left, native right).
- `metrics.json` - per-frame luma/RGB histogram JSD, edge density, mean luma.

Capture: `tests/browser/apex-overdrive-frames.spec.ts` on the remote runner (software GL, 1280x720, `?seed=42`, manual stepping, identical scripted steps per build). Frames are 01 start grid, 02 cruise, 03 barrel roll, 04 thrust flight, 05 ramp launch, 06 sky lane, 07 high traffic, 08 dusk, 09 night, 10 crash.

Both builds run the same simulation (verified sample-for-sample against the original), so differences are HUD, boot overlay, and render-sync only.
