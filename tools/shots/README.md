# Group D screenshot retake tooling (2026-10-24)

What was used to produce `evidence/<game>/screens/2026-10-24/`:

1. Build all eight routes with `tools/shots/vite.shotsd.config.ts` (as used: copy it to the repo root and run `node_modules/.bin/vite build --config vite.shotsd.config.ts`; it builds `apps/showcase-{top-tennis,iron-crown,pips-big-leap,bunker-zero,dot-dash-3d,cross-hop,teleoperator,heatsink}` into `tests/browser/shotsd-dist`, with a hard-coded `/private/tmp/aura3d-shotsd` root that must be edited).
2. Put the per-route payloads next to the build: `marketing/public/fonts` to `dist/fonts`, each app's `public/aura-assets` (iron-crown, pips-big-leap, dot-dash-3d, cross-hop) to `dist/aura-assets`, the 43 shared assets that Teleoperator and Thermal Drift reference from `public/aura-assets`, `public/aura-decoders`, `public/aura-environments`, and each route's non-asset `public/` entries.
3. Run `tests/browser/shotsd-<game>.spec.ts` with `tools/remote-acr/run.sh` (one run per game, `AURA3D_REPORTER=list`). Files missing from the build are fetched by the capture server from production (`/aura-assets`, `/hdri`, `/fonts`, ...).
4. Decode: `node tools/shots/decode-shotsd.mjs <acr-run.log> <outDir>`.

Software WebGL2 only. The dist directory (`tests/browser/shotsd-dist`) is a local build artifact and is not committed.

## Final recapture, group C (2026-10-24, after the UI and render fixes)

Frames in `evidence/<game>/screens/final/` for Duneglide, The Bellkeeper's Walk, Cumulus Dash, Saltwind Highway, Lamplight Line and Apex Overdrive.

- Specs: `tests/browser/finc-lib.ts` (shared capture, texture settle, luma stats, visible-text dump, canvas sizes), `finc-games.ts` (per-game configs), and one wrapper spec per remote run (`finc-<game>*.spec.ts`; Apex has its own `finc-apex*.spec.ts`).
- Run: build once (`RUN_ID=... SPECS=... EXTRA_DIRS="apps/showcase-roadster-rush apps/showcase-port-shared" PUBLIC_ASSETS="roadsterRushSkyCar.295dcba7.glb roadsterRushPlayerCar.c7f9617d.glb showcaseModernBuildingOne.d3216bb2.glb" tools/remote-acr/run.sh`), then reuse the image with `BUILD=0 IMAGE_TAG=run-<first-run-id>` for the other specs (a new spec file needs a rebuild).
- Decode: `node tools/shots/decode-finc.mjs <acr-run.log> evidence` (slug map in `tools/shots/finc-slugmap.json`; frames land in `<folder>/screens/final/`, numbers in `metrics.jsonl`).
- Saltwind Highway needs 15 to 27 minutes of software-GL time per page for its textures to settle; the specs wait for `textures()` to report 0 pending before capturing.
