# Live Identity — aura3d.auraone.ai (Phase 0, 4.0LiveFixPlan)

Measured 2026-10-13 by read-only HTTP probes + repo inspection (wave-1
live-identity agent). No Vercel auth/API commands were run.

## Verified

- `https://aura3d.auraone.ai` returns 200 from Vercel (`x-vercel-cache: HIT`,
  `last-modified 2026-10-13T10:07:46Z`), bundles `main-Cc9vcjOC.js` /
  `main-Drdc2eUK.css`.
- Turbo + Blockfall live HTML (10:07:47Z) share chunk hashes
  (`contracts-Bb9NZsG7`, `flags-CNtqBjR1`, `preload-BXl3LOEh`) — one shared
  `marketing/scripts/build-showcase-routes.mjs` Rollup build. That pipeline
  builds 25 showcase + 9 evidence routes from `apps/<route>/index.html`,
  aliasing `@aura3d/engine` to `packages/engine/src/agent-api/index.ts`
  SOURCE with sourcemaps, and copies GLBs verbatim.
- Neon Corridor Strike is the separate marketing Vite build (live
  11:08:24Z, `index-BX7srHfd.js`).
- CI cannot be the publisher: `.github/workflows/lead-site-build.yml:3-4` is
  `workflow_dispatch` only and :62-67 only uploads an artifact — no deploy
  step exists in CI.
- Local `marketing/dist` (Sep 22) is NOT what is live (turbo chunk
  `C1-k9JB6` local vs `BoT2e1Ip` live).
- Repo HEAD at probe time `e0b25a55a` (2026-10-13 09:21Z) predates the live
  build timestamp (10:07Z), so live was built from something at-or-after
  that morning's tree — exact commit unknown (below).

## Unverified (needs the Vercel deployment record; not attempted)

- Exact commit SHA the live build came from (no SHA marker in HTML/headers).
- Deploy mechanism: Git integration vs manual `--prebuilt` vs local
  `vercel deploy` are all still consistent with observations.
- `AURA3D_SHOWCASE_ASSET_BASE_URL` baked at build time (local `/aura-assets/`
  vs jsDelivr-pinned `@aura3d/showcase-assets-web@1.4.0` in lazy chunks).
- Why neon (11:08Z) postdates the showcase build (10:07Z) when the pipeline
  runs Vite before build-showcase-routes.

## Consequences for the plan

- Every shipped showcase route builds engine SOURCE at site-build time, so
  engine fixes reach production only through a fresh site build + deploy
  (Phase 5), never through an npm publish alone.
- Symptom attribution: owner screenshots postdate the 10:07Z build, and all
  dispatchers boot `src/legacy/**` (`DEFAULT_ON=false`) in that tree, so the
  bright/shiny/blurry reports are attributable to legacy scenes on the
  current engine lanes — consistent with the parity audit. Whether the
  safe-basic fallback renderer specifically was hit live remains unproven
  (no live diagnostics captured); Phase 4 Gate B requires proving the
  backend per game after rebuild.
