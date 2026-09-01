# CONTINUATION PROMPT — finish the Aura3D 2.0.3 release (handoff from crashed session)

You are resuming a finished audit + in-progress release in `/Users/gurbakshchahal/platforms/aura3d` (git branch `main`). The previous session completed the entire public-example audit and made 6 verified fixes that are **uncommitted in the working tree**. Your job is ONLY the release mechanics: version bump → gates → commit → push → npm publish → deploy. Do NOT redo the audit.

Read first: `AGENTS.md`, `llms.txt`, `docs/agents/claims-and-boundaries.md`, `docs/agents/no-hackjob-rules.md`, `docs/project/release-process.md`, `docs/project/release/release-checklist.md`, and `docs/project/aura3d-202-release-notes.md` (the model for the 2.0.3 notes).

## Current working tree (uncommitted — DO NOT revert or stash-pop again; stash is already popped)

```
 M apps/advanced-examples-gallery/src/smartCityEvidence.ts   # smart-city density fix (see below)
 M apps/geometry-drawrange/src/main.ts                       # new draw-range control
 M apps/geometry-drawrange/index.html                        # icon link + mobile media query
 M apps/showcase-index/src/styles.css                        # mobile nav overflow fix
 M apps/showcase-index/index.html                            # icon link
 M tests/browser/advanced-examples-gallery.spec.ts           # ANSI strip fix in waitForViteReady
 M tests/browser/wow-showcase-screenshots.spec.ts            # ANSI strip fix in waitForViteReady
 M apps/{showcase-product-configurator,showcase-smart-city-control,showcase-cinematic-architecture,
      showcase-digital-twin-ops,showcase-blockfall-reactor,loader-gltf-variants,loader-obj,
      texture-anisotropy,postprocessing-depth-outline,controls-trackball,interactive-picking,
      camera-multiple-views,webxr-interactions}/index.html   # one added <link rel="icon" href="/favicon.svg">
 ?? docs/agents/full-public-example-audit-prompt.md          # the original audit prompt (keep)
```

## The 6 fixes already made and verified (do not redo)

1. **ANSI test-harness fix** — Vite 7 colorizes its port in the ready line; both specs' `waitForViteReady` now call `stripAnsi()` on output before matching. This unblocked 11 gallery tests (11/11 pass) and the wow spec.
2. **Smart-city gallery density** — `apps/advanced-examples-gallery/src/smartCityEvidence.ts`: traffic lanes `max(10, columns*0.75)`, `perLane = 9`, sensors `max(96, columns*5)`, facade bands `(row+col)%3`. Medium level = 328 instances (gate requires ≥300; was 254). Keepout + Tokyo-only hero untouched. Test `smart-city renders as a complex animated A3D demo` passes.
3. **geometry-drawrange control** — ↑/↓/Space/click cycles indexed range 12↔24 and array 6↔12 (always partial: parity invariant `count < total` must hold; never add a full-range step). HUD hint added. Verified live.
4. **Catalog mobile overflow** — `apps/showcase-index/src/styles.css` ≤760px now hides `.nav-version` and `.nav-actions .btn-ghost` (mirrors homepage `marketing/src/styles.css` @900px pattern). 390px viewport no longer overflows.
5. **geometry-drawrange mobile** — route-local `@media (max-width: 860px)` collapses its grid to 1 column (its 780px floor defeated the shared sheet's collapse).
6. **Favicon links** — 15 route `index.html` files got `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` (kills local-dev 404 console noise; production already serves `/favicon.ico` 200).

## Audit verification already done (do not redo; cite in release notes)

- All 36 public routes loaded headless (system Chrome + WebGPU flags): zero console/page errors, no blank/washed scenes (pixel stats within bounds), all canvases full-size.
- All controls operated with pixel-diff + state evidence: configurator (variants/finishes/focus/explode/turntable), smart-city (day/night 45% pixel swing, districts, cameras, alerts, traffic), architecture (moods/paths), twin-ops (modes/zones/alerts/isolate/pause/advance), gallery shell + all 10 hash scenes (switching, no stacked HUDs, water ripples, galaxy formation/particles 7.2% pixel change, car variant/lighting/focus, physics spawn).
- Games played end-to-end: Turbo 4-lap race finished (~40s pace-multiplied), passed rival on asphalt at t=2.0s, opponent on-road honest, off-line slowdown + recovery + KeyR reset; Blockfall all controls + pause-freeze verified + game-over reached + reset; Skyline Level 1 finished in 86.9s (window 70–115s), 34 coins, 6 checkpoints, 3 respawns, ember volleys; Clash 18 hits → KO at 61.7s, reset restores round.
- Production verified: all 36 routes + `/favicon.ico` + `/assets/draco/draco_decoder.wasm` + all 39 catalog images + `/showcase/aura-clash/playable/` return 200, zero console errors on homepage/configurator/catalog/clash.
- Locked 2.0.2 fixes verified intact: poster files and favicon unchanged since release commits (64a554e6 posters, ad16ee46 favicon), Tokyo-only stress test + keepout intact, exposure levels fine (robot 46.8 lum, helmet 56.1), Turbo asphalt pass works, Skyline window works.
- Gates already passed this session: `pnpm typecheck` ✅, `pnpm check:agent-docs` ✅, `pnpm check:docs-codeblocks` ✅, `pnpm check:docs-site` 4/4 ✅, gallery browser spec 11/11 ✅, the 3 flaky browser specs pass solo (11/11) — combined-run failures were dev-server contention.
- **Known pre-existing failures on clean main (NOT caused by these changes — verified by stashing):** unit files `tests/unit/tools/evidence-freshness.test.ts`, `tests/unit/tools/deletion-safety.test.ts` (+ ~17 more listed in `tests/reports/unit.json` under CLI/spec-compiler/package-dist/rendering/tools). Do not block the release on them; do not try to fix them in this release.

## Remaining tasks — execute in order

### 1. Version bump 2.0.2 → 2.0.3
Replicate what commit `0668f0f8` did for 2.0.2 (inspect with `git show 0668f0f8 --stat`):
- All 29 public `packages/*/package.json` versions + root `package.json`.
- Template pins: `packages/create-aura3d/templates/*/package.json` and `templates/*/package.json` (they pin `@aura3d/*@2.0.2`).
- Versioned docs: grep `2.0.2` across `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `BUNDLE_SIZES.md`, `docs/**`, `apps/**/README.md`, `marketing/**` and update where it denotes the CURRENT version (leave historical `2.0.0`/`2.0.1` notes labeled historical). ~56 package.json files reference it; also `docs/project/release-process.md` header, `apps/showcase-index/index.html` nav (`v2.0.2` chip + "Built with Aura3D 2.0.2"), marketing homepage/docs.
- Useful helper may exist: check `tools/docs-version-alignment` and `pnpm check:marketing-truth` / `check:tarballs` semantics before hand-editing everything.

### 2. Write `docs/project/aura3d-203-release-notes.md`
Model: `docs/project/aura3d-202-release-notes.md`. It is a showcase/test-harness patch. Content:
- Fixed locally-broken test servers: ANSI-stripping in gallery + wow specs (Vite 7 colored ports) — 11 previously-blocked tests run again; smart-city stress-test restored above its ≥300-instance gate (328 at medium) with keepout and Tokyo-only hero unchanged.
- geometry-drawrange now has the interactive range control its card promises (↑/↓/Space/click; ranges stay partial).
- Examples catalog and geometry-drawrange no longer overflow 390px mobile viewports.
- 15 routes gained favicon links (removes dev-server 404 noise; production favicon unchanged).
- Claim boundary: no renderer/engine capability changes; all 2.0.2 claim boundaries hold; audit evidence summary (all 36 routes operated; four games completed end-to-end; production 200s).
- Status line: date of release, "published to npm, GitHub" (fill after publishing).

### 3. Build + release gates
```sh
pnpm build
pnpm verify:release:quick
# then the check:release legs (full list in package.json; at minimum:
#  lint, check:agent-docs, check:templates, check:examples, check:docs-site,
#  check:docs-codeblocks, check:marketing-links, check:marketing-truth, check:tarballs)
```
Pre-existing unit failures listed above are known-main; don't chase them.

### 4. Commit + push (GitHub)
Commit message style follows `0668f0f8`. Two commits are fine: (a) the audit fixes, (b) the version bump + notes. Push `main` to origin (`gh` is available; remote is github.com/auraoneai/aura3d).

### 5. npm publish (29 packages)
Per `docs/project/release-process.md`:
```sh
NPM_CONFIG_USERCONFIG=/path/outside/repo/.npmrc node tools/release/publish-all.mjs --dry-run
NPM_CONFIG_USERCONFIG=/path/outside/repo/.npmrc node tools/release/publish-all.mjs
```
`~/.npmrc` exists WITH an `_authToken` (2 token lines) — but it lives in $HOME, not the repo, so pointing NPM_CONFIG_USERCONFIG at a copy outside the repo is fine; do NOT commit any .npmrc or print the token. If publish fails on auth, ask the user.

### 6. Deploy marketing site (aura3d.auraone.ai)
- Marketing build: `cd marketing && npx vite build` (its config pulls in the 9 wow routes + clash dist; clash `dist/` already exists).
- Deploy: `vercel` CLI is installed and `marketing/.vercel/project.json` exists → from `marketing/` run `npx vercel --prod` (confirm scope if prompted). Alternatively push may auto-deploy via Vercel git integration — check `vercel.json`/project settings; if the site updates after push, verify instead of double-deploying.
- After deploy, re-verify production: `/favicon.ico`, `/assets/draco/draco_decoder.wasm`, `/apps/showcase-index/` (mobile nav no longer overflows — check at 390px), one heavy route (e.g. `/apps/showcase-product-configurator/`) for zero console errors, and `/showcase/aura-clash/playable/`.
- Update the 2.0.3 release notes status line + `docs/project/release-process.md` version header if the checklist requires, and commit that follow-up.

### 7. Housekeeping
- Dev servers may still be running in background: root Vite on 127.0.0.1:5181 and clash preview on 127.0.0.1:5199 — kill them when done.
- Audit artifacts live in `/tmp/aura3d-audit/` (screenshots, scripts, reports) — disposable.
- Do NOT bump beyond 2.0.3, do not touch historical 2.0.0/2.0.1 notes, do not hand-edit `dist/`, `marketing/dist/`, `tests/reports/`, or `release-artifacts/` as source.
- `docs/agents/full-public-example-audit-prompt.md` is the original task prompt — keep it committed or leave untracked per user preference (it was untracked at session start).

## Completion bar
Done when: 2.0.3 committed and pushed to GitHub, all 29 packages published to npm as 2.0.3 (verify `npm view @aura3d/engine version` → 2.0.3), site deployed and production spot-checks pass, release notes recorded, and a short plain-language summary of what shipped is reported to the user.
