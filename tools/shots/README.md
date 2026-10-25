# Group D screenshot retake tooling (2026-10-24)

What was used to produce `evidence/<game>/screens/2026-10-24/`:

1. Build all eight routes with `tools/shots/vite.shotsd.config.ts` (as used: copy it to the repo root and run `node_modules/.bin/vite build --config vite.shotsd.config.ts`; it builds `apps/showcase-{top-tennis,iron-crown,pips-big-leap,bunker-zero,dot-dash-3d,cross-hop,teleoperator,heatsink}` into `tests/browser/shotsd-dist`, with a hard-coded `/private/tmp/aura3d-shotsd` root that must be edited).
2. Put the per-route payloads next to the build: `marketing/public/fonts` to `dist/fonts`, each app's `public/aura-assets` (iron-crown, pips-big-leap, dot-dash-3d, cross-hop) to `dist/aura-assets`, the 43 shared assets that Teleoperator and Thermal Drift reference from `public/aura-assets`, `public/aura-decoders`, `public/aura-environments`, and each route's non-asset `public/` entries.
3. Run `tests/browser/shotsd-<game>.spec.ts` with `tools/remote-acr/run.sh` (one run per game, `AURA3D_REPORTER=list`). Files missing from the build are fetched by the capture server from production (`/aura-assets`, `/hdri`, `/fonts`, ...).
4. Decode: `node tools/shots/decode-shotsd.mjs <acr-run.log> <outDir>`.

Software WebGL2 only. The dist directory (`tests/browser/shotsd-dist`) is a local build artifact and is not committed.
