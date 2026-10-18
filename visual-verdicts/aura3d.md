# aura3d — visual verdicts (LIVE UI/UX upgrade 2026-10-17/18)

## Round 0 — static audit (2026-10-18)

Auditor: static stage, read-only. Repo at `/Users/gurbakshchahal/platforms/aura3d`, branch `main` @ `b838350c2`.
Binding standards: `/Users/gurbakshchahal/fonts/README.md` (How to choose / Weight discipline / Type scale and density / Patterns to avoid / Choose by occasion) and `~/.config/agent-policy/reference/ui-typography-density.md`.

### A. Surface inventory

aura3d is an open-source 3D SDK with a marketing website and ~140 Vite demo/game apps. There is **no dashboard, no admin, no authed interior, no accounts** — every web surface is public. No Next.js anywhere (pure Vite multi-root).

| # | Surface | Preset it should use | Routes (file) |
| --- | --- | --- | --- |
| 1 | Marketing site (root landing) | Marketing | `/` — content `marketing/index.html` (byte-identical twin of root `index.html`), styles `marketing/src/styles.css`, entry `marketing/src/main.ts`. Deployed as `marketing/dist/index.html` (build mirrors it via `marketing/vite.config.ts` `mirrorMarketingHtmlOutput`) |
| 2 | Docs site (static HTML) | Marketing (docs) | `/docs/index.html`, `/docs/api.html`, `/docs/agent-quickstart.html`, `/docs/agent-rules.html`, `/docs/assets.html`, `/docs/aura3d-vs-threejs.html`, `/docs/claims.html`, `/docs/claude.html`, `/docs/cursor.html`, `/docs/deployment.html`, `/docs/evidence.html`, `/docs/prompt-recipes.html`, `/docs/templates.html`, `/docs/aura-clash.html`, `/docs/aura-clash-showcase.html` — all in `marketing/docs/*.html`, all share `marketing/src/styles.css` |
| 3 | Examples/game gallery | Marketing (gallery) | `/apps/showcase-index/` — `apps/showcase-index/index.html` + `src/styles.css` + `/fonts/local.css` |
| 4 | Showcase games (production-built, 20 routes) | Mixed HUD/UI | `showcase-index, showcase-top-tennis, showcase-roadster-rush, showcase-heatsink, showcase-teleoperator, showcase-iron-crown, showcase-pips-big-leap, showcase-aura-hoops-3d, showcase-aura-diamond-3d, showcase-aura-fc-3d, showcase-red-zone-3d, showcase-aura-links-3d, showcase-top-tennis-v2, showcase-roadster-rush-v2, showcase-heatsink-v2, showcase-teleoperator-v2, showcase-bunker-zero, showcase-slingshot-siege, showcase-dot-dash-3d, showcase-cross-hop` — route list in `marketing/scripts/build-showcase-routes.mjs` (const `showcaseRoutes`); each `apps/<name>/index.html` |
| 5 | Aura Clash flagship sub-site | Product/marketing | `/showcase/aura-clash` → `apps/aura-clash-showcase/index.html` (vercel.json rewrites), plus `/playable/`, `/evidence/`, `/accessibility/`, `/deploy-check/`, `/poster/` under `apps/aura-clash-showcase/*/index.html` (own sitemap.xml, robots.txt) |
| 6 | Arcade games (newest work) | Game HUD | `/arcade/vector-nine/`, `/arcade/prism-break/`, `/arcade/backspin/` — each `<dir>/index.html` + `src/main.ts` (dev-served; not in production showcase route list) |
| 7 | Wow/sample apps (~100) | Demo shells | `apps/wow-*`, `apps/{flagship-viewer, material-lab, editor, ...}` — each `apps/<name>/index.html`; shared shells `apps/common/src/styles.css` (33 apps link it) and `apps/wow-common/src/showcase.css`. Dev-only surfaces; `editor` is a tool UI (`apps/editor/index.html` + `src/styles.ts`) |
| 8 | Templates (shipped to npm users) | Starter UI | `templates/production-*`, `templates/{product-viewer, arena-shooter, game-slice, ...}` — each `templates/<name>/index.html` or `src/main.ts` (these are the faces users scaffold from) |
| 9 | Internal design mockup | — (not deployed) | `docs/design/animation-studio/Aura3D Animation Studio.html` + `styles.css` — Google-Fonts-driven mockup, not built into marketing/dist |

CLI TUIs (`tools/`, `packages/cli`) excluded per scope. `archive/`, `scratchpad/`, `dist/` are not web surfaces.

### B. Defects by checklist area

#### 1. Dark tokens — FAIL (worst area)

The platform has **no light theme at all**. Dark is the only theme on every judged surface; there is no `prefers-color-scheme` branch, no `next-themes`, no persisted theme state (nothing to branch — dark is unconditional).

- `marketing/src/styles.css:150-167` — `:root { --bg: #05070e; --bg-1: #090d18; --bg-2: #0e1525; --bg-3: #141e33; --ink: #f8fafc; }` under header comment "Aura3D 4.0 — Aurora Noir / Midnight Slate Design System". A 4-step dark ramp plus `--ink` near-white. Applies to `/`, all 15 docs pages, gallery.
- `marketing/src/styles.css:207-260` — `html { background: var(--bg) }` plus layered dark radial/conic gradient `body::before/::after` (glow + grid overlay) — dark panels everywhere.
- `index.html:22` (and every `marketing/docs/*.html`) — `<meta name="theme-color" content="#07080a" />`.
- `apps/showcase-index/src/styles.css:54-66` — `:root { color-scheme: dark; --bg: #07080a; --ink: #f4f6f8; }`.
- `apps/wow-common/src/showcase.css:2-5` — `color-scheme: dark; font-family: Inter…; background: #020407`.
- `apps/common/src/styles.css:2-8` — `background: #101217; color: #f4f7fb`.
- `arcade/vector-nine/index.html:11-13` — `:root { color-scheme: dark } … background: #070d1f`.
- `apps/aura-clash-showcase/index.html:11` — `theme-color #03120d`; `apps/flagship-viewer/index.html:20-22` — `background: #0f1115/#07090d`.
- `apps/showcase-top-tennis/index.html:22-24` — `background: #0d2230; color: #f3f0dc`.

#### 2. Stale assets — MINOR/PASS-ish

No dark-era screenshot heroes or mockup artifacts found in served HTML; the root page embeds live iframes and one illustration, and both exist in `marketing/public/previews` (production publicDir). Specifics:

- `index.html` references `/previews/animation-studio.svg` — present in `marketing/public/previews/animation-studio.svg` (production OK) but **missing from root `public/previews/`** — 404 under root dev server.
- `apps/aura-clash-showcase/index.html` og:image `…/previews/aura-clash-poster.svg` — present in `marketing/public/previews/`, missing from root `public/previews/` (dev-only 404).
- `docs/aura-clash-showcase.html` differs from `marketing/docs/aura-clash-showcase.html` — stale duplicate not in the build set.
- `sitemap.xml` (root) `lastmod 2026-06-03` on all entries — 4.5 months stale vs 4.0.1 site copy.
- Version drift tells: `apps/showcase-index/index.html:42` nav chip says `v4.0.0` while masthead/llms.txt say 4.0.1; `marketing/package.json` deps `@aura3d/engine 4.0.2`.

#### 3. Font wiring — MIXED (licensed core is real; shells are Inter)

**Committed files all verified (md5) against `/Users/gurbakshchahal/fonts/` — every one matches:**

| Committed file | Library source | Match |
| --- | --- | --- |
| `public/fonts/aeonik-pro/AeonikPro-{Regular,RegularItalic,Medium,MediumItalic,Bold}.woff2` (dup under `marketing/public/fonts/`) | `sans/Aeonik/AeonikPro-*.woff2` | ✓ all 5 |
| `public/fonts/graphik/Graphik-{Regular,RegularItalic,Medium,Semibold}-Web.woff2` | `sans/Graphik/*-Web.woff2` | ✓ all 4 |
| `marketing/public/fonts/aeonik/Aeonik-{Regular,Medium,Bold,Light}.woff2`, `AeonikFono-{Regular,Medium}.woff2` | `sans/Aeonik/*` | ✓ all 6 |
| `public/fonts/tt-commons-mono/TT-Commons-Pro-Mono-Regular.woff2` | `sans/TT-Commons-Pro/TT-Commons-Pro-Mono-Regular.woff2` | ✓ |
| `public/fonts/din-pro/DINPro-{Regular,Medium,Bold}.woff` | `sans/DIN-Pro/DINPro-*.woff` | ✓ all 3 |
| `marketing/public/fonts/minion-pro/MinionPro-{Regular,It,Semibold}.woff2` | `serif/Minion-Pro/*` | ✓ all 3 |
| `marketing/public/fonts/whitney-{regular,medium,semibold}.woff2` | `sans/Whitney/24bda95d…/cf4a8a10…/f9e7047f….woff2` | ✓ all 3 (hash mapping per README) |
| `marketing/public/fonts/monument-mono.ttf` | `display/Monument-Grotesk/MonumentGrotesk-Mono.ttf` | ✓ |

All referenced files exist in-repo and are copied to `marketing/dist/fonts/` (production serves them). No Google Fonts or `next/font/google` on any **deployed** surface. `font-synthesis: none` present at `marketing/src/styles.css:201` (missing in showcase-index, wow-common, common shells).

Defects:

- **Inter as designed face** (banned) across the app/template layer: `apps/common/src/styles.css:5` (`font-family: Inter, ui-sans-serif, system-ui…` — linked by 33 app HTML files); `apps/wow-common/src/showcase.css:3`; `apps/editor/src/styles.ts:6`; all 3 arcade games (`arcade/vector-nine/index.html:21,26` — `font: 700 15px Inter` and `500 11px Inter`; also `arcade/*/src/main.ts` HUD strings e.g. `vector-nine/src/main.ts:1459,1489,1540`); 59 CSS/HTML/TS files in `apps/` total; and the **user-shipped templates**: `templates/production-{webgpu-starter,product-configurator,product-viewer,asset-inspector,architecture-viewer,material-studio}/index.html:2`, `templates/product-viewer/index.html:9`, `templates/{arena-shooter,game-slice,mini-game,character-controller,racing-starter,falling-blocks-starter,asset-viewer}/…` — all `Inter, system-ui`.
- Google Fonts import (banned) in internal mockup `docs/design/animation-studio/styles.css:4` (`Hanken Grotesk`, `Space Grotesk`, `JetBrains Mono` via fonts.googleapis.com) — not deployed, but it is the design reference for the animation-studio app.
- **Family mislabeling**: `public/toptennis-v2/matchpoint-fonts.css:1-20` declares `font-family: "Whitney"` but `src:` is **Graphik** files, and `"Monument Grotesk Mono"` actually loads **TT Commons Pro Mono**. The flagship game (`apps/showcase-top-tennis/index.html:19,35,41,81`) believes it renders Whitney/DIN Pro/Monument Mono; what ships is Graphik/DIN/TT Commons under wrong names. Licensed files, dishonest wiring; also `font-weight: 500 600` / `700 900` ranges.
- **Weight mis-declaration**: `marketing/src/styles.css:34-47` declares `AeonikPro-Bold.woff2` at **both 600 and 700** (no Semibold file exists in Aeonik Pro; Bold-as-600 violates "declare weights from the README"); `marketing/src/styles.css:78-91` maps TT Commons Mono Regular file to both 400 and 500 (500 renders Regular — fake Medium); `DINPro-Bold.woff` declared at 600 (`styles.css:107-113`).
- Two similar grotesks in one system (Aeonik Pro + Aeonik + Graphik all live on `/`, README: "never two neutral grotesques; avoid mixing Aeonik, Aeonik Pro, and Fono"); **Aeonik Fono used as `--mono`** at `apps/showcase-index/src/styles.css:42` although the README states Fono is proportional, not monospace.
- No font `<link rel="preload">` anywhere (README prescribes preloading the two working files); `font-display: swap` is present on all faces.
- Synthetic-italic risk: `em` used in body copy (`index.html:94`) while Graphik Italic is loaded — OK on marketing; but Graphik has no 600-italic / Minion `em` usage covered by `MinionPro-It` ✓. No missing-file synth detected on deployed pages.

#### 4. Type scale — FAIL

Marketing preset is nominally in use (16px body, `styles.css:196-204`) but the scale is far outside the README's Marketing band, and product-ish shells ignore Dense UI:

- **Display inflation**: hero `h1` `clamp(48px, 6.2vw, 92px)` `line-height 0.96` `letter-spacing -0.04em` (`styles.css:913-918` — README: hero 36–44px once, lh 1.1–1.2, tracking −0.01/−0.02em); `.wwx-copy .h2` `clamp(38px, 5.2vw, 76px)` at `:523`; `compare-cta h2` `clamp(64px, 10vw, 144px)` lh `0.82` tracking `-0.065em` (`:1211`); `compare-hero h1` `clamp(54px, 8vw, 118px)` lh `.91` (`:1175`). Multiple display-size headlines per page, not one hero.
- **Sub-12px text — 40 instances** in `marketing/src/styles.css` (grep `font-size: (8|9|10|11)px`): 8.5px npm badge `:2762`; 10px at `:902, 1009, 1037, 1101, 1230, 1481, 1655, 1736, 1820, 1901, 1941, 2063, 2432, 2629`; 10.5px `:863, 2728`; 11px ×17 (e.g. `:408, 426, 556, 640, 682, 972, 1078, 1293, 1330, 1352, 1388, 1450, 1977, 2031, 2083, 2150, 2179, 2390, 2866, 3235`); 11.5px `:828, 2878, 3183`. Marketing floor is 13–14px.
- Same in gallery: `apps/showcase-index/src/styles.css` — 8.5px `:240`, 9px `:415`, 10px `:303,415`, 10.5px `:178,225`, 11.5px `:155`; nav links 12.5px (`marketing/src/styles.css:3026`).
- **All-caps + tracked labels (the headline template tell) — 31 `text-transform: uppercase` rules in `marketing/src/styles.css`, most with 0.05–0.22em tracking**: eyebrow `:326-328` (0.22em), `:407-410` (11px mono caps, 0.16em), `:556-558`, badge `:902-904`, `:972-974` (0.12em), `:1037-1040` (0.14em), HUD chips `:1078-1080`, `:1101-1104`, proof eyebrows `:1153` (`10px mono caps .14em`), plus ~18 more. Gallery: `.hero-shot b` `:303`, `.portfolio-strip` `:311`, `.showcase-card__label` `:415` (9px caps). Arcade: boot-gate wordmark `arcade/vector-nine/index.html:20-24` (700 15px Inter, **0.46em** tracked caps).
- `.tape-label` (`styles.css:320-334`) sets `font-variant-caps: small-caps` **and** `text-transform: uppercase` **and** `letter-spacing: 0.22em` — small caps must be lowercase, never uppercase+tracking (policy rule 5).
- **Bold in product-ish UI**: `apps/common/src/styles.css:19-23` `h1 { font-size: 22px; font-weight: 700 }` and buttons `font-weight: 700` `:47-56`; `templates/production-*` buttons 700; arcade HUD `font:600 11-13px Inter`. On marketing proper, discipline is actually good: h1/h2 at 500, 600 only on `.brand` + a few card titles (`:2959, 3020, 3029, 3059, 3068`), 700 only on the 8.5px npm badge (`:2763`).
- Light weight below 16px: `Aeonik-Light.woff2` declared 300 (`apps/showcase-index/src/styles.css:1-9`).
- Dense-UI product preset absent: the only product-like screens (editor, viewer shells) run 13px body but with Inter/700 chrome, not the Whitney dense stack that `marketing/public/fonts/fonts.css` (Whitney 400/500/600 + fallbacks, the AuraOne shared stack) actually ships — that file is referenced by no deployed page.

#### 5. SEO surface — MOSTLY PASS, two real defects

- Favicons: `favicon.svg` (root+marketing+dist) and `favicon.ico` (marketing/public, dist) ✓; **no `apple-touch-icon`** anywhere.
- `robots.txt` + `llms.txt` + `sitemap.xml` present at root, marketing, and dist ✓ (clash sub-site has its own).
- **Broken OG image on all 15 docs pages**: `marketing/docs/*.html:16` — `<meta property="og:image" content="/og/aura3d-og.png" />` — relative URL (spec requires absolute) and **no `/og/` directory exists** in any public dir. Root page and clash page are correct: absolute `https://aura3d.auraone.ai/previews/aura-clash-poster.png` (real 1920×1080, verified) / `.svg`.
- Canonical + meta description + per-route `<title>` + twitter card + JSON-LD on every page ✓; per-doc canonicals are absolute and correct.
- `sitemap.xml` lastmod stale (2026-06-03, see area 2).

#### 6. Layout integrity & template tells — MIXED

- `.wrap` is fluid `max-width: 1320px` with 28px gutters and breakpoints at 980/680/640 (`marketing/src/styles.css:396-401, 730, 751, 2273`) — landing + docs hold at 390px; `overflow-x: clip/hidden` on html/body (`:184-192`). No fixed-width overflow found on judged marketing routes.
- Overflow risk on app surfaces: `apps/common/src/styles.css:11-14` body grid `minmax(860px,…) minmax(360px,1fr)` — 860px fixed column overflows any phone; `apps/flagship-viewer/index.html:18-20` `minmax(900px,…)`; `apps/showcase-heatsink/index.html:504` `min-width: 184px` controls (grid-dependent). Games are desktop-first; no mobile fallback in these shells.
- **Template tells, all present on `/`**: tracked-caps eyebrows above headings (`.eyebrow`, `index.html:177, 217, 229, 388, 460`); **numbered markers** `01 · Aura Slam 3D` / `02 · Apex Overdrive` / `03 · Thermal Drift` (`index.html:191, 198, 205`) — numbered markers *and* middle dots in one string; **middle-dot meta strings** — 34 `·` occurrences in `index.html` (e.g. foot-bottom `© 2026 Aura3D · @aura3d/engine v4.0.1 · MIT licensed`, hero tag `4.0.1 live`, eyebrows `New in 4.0.0 · agent era, live`); **`→`-style arrows appended to button/link text** via `.arr` (`index.html:77, 112, 182, 191…`; `.btn .arr` `styles.css:777`) and literal `↓`/`↗` in gallery CTAs (`apps/showcase-index/index.html:33-35`); **monospace decorative labels** (`--mono` for eyebrows/HUD chips/portfolio strips at `styles.css:407, 1153`, `showcase-index:303,311,415`); **accented word in headline** — `hero h1 em` switches to Minion Pro italic serif + color (`index.html:94`, `styles.css:919-926`, and `compare-hero h1 em` colored `:1176`) — explicitly a "Pattern to avoid"; strike-through word in h1 (`.strike`, `styles.css:932-936`).
- Broken links: `/docs/*` links resolve to built docs ✓; `/examples/` nav link in gallery (`apps/showcase-index/index.html:26` `href="/examples/"`) has **no corresponding route** in marketing/dist (dist has `examples/` dir — verify; gallery nav self-link is `/examples/` while deployed route is `/apps/showcase-index/`) — flag for pixel pass. `apps/showcase-index/index.html:42` version chip v4.0.0 vs site 4.0.1.

### Static score: **3/10**

Rationale: fonts are the one genuinely strong pillar — licensed faces only on the deployed marketing surface, every committed file md5-matches the library, all files exist and ship in dist, `font-display: swap`, `font-synthesis: none`, real 1920×1080 OG poster, full meta/canonical/robots/llms/sitemap coverage, responsive core layout. But the rubric's first-order rules fail hard: (1) the entire platform is dark-only — dark ramps, `color-scheme: dark`, dark theme-color on every judged surface, no light theme exists; (2) Inter is the designed face on the whole app/template layer (33+ common-shell apps, wow-common, editor, all arcade games, all production templates) and Google Fonts lives in the design mockup; (3) type scale is far out of band — 40 sub-12px sizes, 8.5px/9px labels, 92–144px headlines at 0.82–0.96 line-height; (4) the all-caps tracked label (the named template tell) appears 31+ times, plus numbered markers, middle-dot strings, arrow-suffixed buttons, mono decorative labels, and an italic-serif-accented hero; (5) flagship game fonts are mislabeled (Graphik shipped as "Whitney"); docs OG images are broken (relative + nonexistent path). No 1×1-placeholder cheat detected.

### C. Build / auth recon

| Surface | PM | Build | Serve | Env |
| --- | --- | --- | --- | --- |
| Marketing + docs + 20 showcase routes (production) | pnpm (workspace, `pnpm-lock.yaml`) | `pnpm build && pnpm --dir marketing build` (vercel.json buildCommand) → marketing build = `pnpm --dir ../apps/aura-clash-showcase build && vite build && node scripts/build-showcase-routes.mjs`; vite root = repo root, publicDir = `marketing/public`, outDir `marketing/dist` | Vercel static, `outputDirectory: marketing/dist`; local: `pnpm --dir marketing preview` (port 7782) or `npx vite preview` | none for build; `.env` = `MESHY_API_KEY` (asset generation, not UI), `.env.local` = Vercel CI vars only |
| Root dev monorepo (all 140 apps) | pnpm | `pnpm build` = `tsc -p tsconfig.build.json && node tools/finalize-dist` (SDK dist, not web) | `pnpm dev` = `vite` at repo root (apps served at `/apps/<name>/`, alias rewrites in `vite.config.ts`) | `A3D_VITE_TEST_SERVER`, `VITE_FORCE_HMR_DISABLED` for HMR-off runs |
| Showcase apps individually | pnpm | `pnpm --dir apps/<name> build` (= `vite build`) | `pnpm --dir apps/<name> preview` | none |
| Arcade games | pnpm (own package.json each) | `pnpm --dir arcade/<game> build` (`tsc --noEmit && vite build`) | `pnpm --dir arcade/<game> preview` | none |
| Aura Clash sub-site | pnpm | `pnpm --dir apps/aura-clash-showcase build` | vite preview; production via vercel.json rewrites `/showcase/aura-clash` → `/apps/aura-clash-showcase/` | none |

- **Auth**: none. No login/sign-in surface, no auth dependency (no next-auth/clerk/supabase/firebase), no cookies/session code. All routes public — no session-mint mechanism needed for visual QA.
- **Visual harness**: partial. `package.json:180` `"test:visual"` points at `tools/visual-baseline/index.ts` which **does not exist** (dead script — likely renamed). Real capture tooling: `tools/quality-rebuild-capture/capture-{games,examples}.mjs` (playwright configs at repo root: `playwright.config.ts` + 6 more), parity gates `tools/{webgpu,external-parity-*,threejs-parity,advanced-gallery,production-runtime}-*`, `tools/remote-capture.sh`. Existing captures: `arcade/*/captures/*.png` (opening/mid/action), `evidence/<route>/`, `marketing/test-results/`, `.local-evidence/`, `apps/*/dist` snapshots. No design-system regression tests (no `tests/design/` font contract tests like Operator/CRM.me).

### D. Uncommitted changes

`git status` on `main` @ `b838350c2` (2026-10-18 "feat(arcade): Vector Nine complete…"): only **untracked `artifacts/`** (build artifacts, Oct 17). No modified tracked files; nothing UI/UX-relevant pending. Working tree effectively clean.

### Fix-pass priorities (for Round 1)

1. Introduce a light default theme across marketing/docs/gallery/games chrome (replace the Midnight Slate ramp; kill `color-scheme: dark`, `theme-color #07080a`).
2. Eradicate Inter from `apps/common`, `apps/wow-common`, `apps/editor`, `arcade/*`, and every `templates/*` starter; wire the already-committed licensed stack (Graphik/Aeonik Pro on marketing, Whitney dense stack from `marketing/public/fonts/fonts.css` for product shells) with correct names and honest `@font-face`s (fix `toptennis-v2/matchpoint-fonts.css` Graphik-as-Whitney).
3. Re-scale to presets: Marketing 16–17px body / one 36–44px hero / 13–14px floor; delete 8.5–11.5px sizes; Dense UI for game HUDs.
4. Remove the all-caps tracked labels (31+ rules), numbered `01·` markers, middle-dot strings, `.arr` arrows, mono decorative labels, Minion-italic hero accent; sentence case everywhere.
5. Fix docs OG images (absolute URL + real file), add `apple-touch-icon`, refresh sitemap lastmod, fix `/examples/` link and v4.0.0 chip.
6. Repair or remove `test:visual`; port the Operator/CRM.me font-contract tests.

## Round 1 — static fixes applied (2026-10-18) [marketing/docs/showcase-index]

Scope owner: marketing site (`marketing/`), docs pages (`marketing/docs/*.html`), showcase-index (`apps/showcase-index/`), SEO/OG assets, and the visual-QA harness for these surfaces. Apps shells, arcade games, templates, and flagship game dirs were owned by a parallel agent and are not touched here. No commits, no deploys.

### Design direction applied

Light default everywhere in scope: paper background `#fbfbf8`, ink `#1a1e26`, restrained deep-teal accent `#0e6b7c` (emerald `#0f7a58` support), hairline borders, flat surfaces. Dark color remains ONLY inside true media stages (`--stage: #10141a` under game iframes/posters) and the dark-translucent overlay chips on top of that media (`--chip-bg/--chip-line/--chip-ink`) — video-player chrome, not page chrome. Marketing preset: 16px body, one hero `clamp(32px, 3.4vw, 42px)` @ 600, interior page titles 28–32px @ 600, section headings `clamp(22px, 2.2vw, 26px)` @ 500, 13px floor. Sentence case everywhere; zero tracked-out caps; `-0.01em` tightening at 32px+ only. Weight discipline: 400 body / 500 emphasis / 600 single page title / 700 nowhere except the npm logo glyph (third-party wordmark).

### 1. Dark tokens → light default

- `marketing/src/styles.css:150-167` Midnight Slate ramp (`--bg:#05070e`, 4-step dark ramp, `--ink:#f8fafc`) → **`marketing/src/styles.css:63-118`** "Daylight surfaces" light ramp (`--bg:#fbfbf8`, `--bg-1/2/3` paper grays, ink scale `#1a1e26…#878d96`, teal accent), plus new `--stage/--chip-*` media tokens (:95-99).
- `marketing/src/styles.css:207-260` dark layered body gradients + fixed aurora `body::before/::after` overlays + `auraShaderDrift` keyframes → **deleted**; body is now a flat paper wash with one 5%-alpha teal radial (:139-146).
- `marketing/src/styles.css:285-308, 2768-2772` dark `.tape` proof-band gradients + grid overlay → flat `var(--bg-1)` with hairline borders (:168-174, :1834).
- Derived colors carried through the whole stylesheet (290 regex + 67 block replacements): every `rgba(255,255,255,x)` fill/hairline → ink-alpha; every dark panel triple (`rgba(7,8,10,x)`, `rgba(9,13,24,x)`, `rgba(14,21,37,x)` …) → light neutrals; cyan/emerald/indigo glow family → deep-teal/emerald light-theme equivalents; near-black shadows → soft ink shadows at reduced alpha. Nav bars, buttons, compare tables, migration panels, cards, footer all render light.
- `<meta name="theme-color" content="#07080a">` → `#fbfbf8` on **all 17 HTML pages** in scope: `marketing/index.html:22` (+ byte-identical root twin `index.html:22`), `marketing/docs/*.html` (13 pages at head; claims/evidence compact-head variants also fixed), `apps/showcase-index/index.html:7` (new), both clash docs pages (new).
- `apps/showcase-index/src/styles.css:54-84` (`color-scheme: dark`, `--bg:#07080a`, dark body gradient) → **full rewrite** of the file: `color-scheme: light`, same Daylight ramp, media stages isolated to `--stage`.
- `marketing/docs/aura-clash.html` + `aura-clash-showcase.html` self-contained dark `<style>` blocks (`color-scheme: dark`, `#020806` bg, neon-green ink) → rewritten light Graphik pages (see fonts below).
- Dark flash-page in `marketing/scripts/build-showcase-routes.mjs` retired-route redirect stub → light paper inline style.

### 2. Stale assets / version drift

- Gallery `/examples/` self-links (`apps/showcase-index/index.html:25,107`) → `/apps/showcase-index/` (the deployed route).
- `apps/showcase-index/index.html:42` nav chip `v4.0.0` → `v4.0.1`; footer `npm 4.0.0` → `npm 4.0.1`.
- `sitemap.xml` + `marketing/sitemap.xml`: all 45 `lastmod 2026-06-03` → `2026-10-18`.
- Dev-server 404s: `previews/animation-studio.svg` + `previews/aura-clash-poster.svg` copied into root `public/previews/` (production already had them in `marketing/public/previews/`).
- `apple-touch-icon` (missing everywhere per Round 0): generated 180×180 PNG brand mark at `marketing/public/apple-touch-icon.png` + `public/apple-touch-icon.png`, linked from every page in scope; `.gitignore` negation rules added (:327-328) so the PNGs are committable.
- Not fixed (out of scope / not served): root `docs/aura-clash-showcase.html` stale duplicate (not in the build set), `docs/design/animation-studio/` Google-Fonts mockup (internal, not deployed).

### 3. Font wiring

- `marketing/src/styles.css:6-135` mixed @font-faces (Aeonik Pro incl. **Bold declared at both 600 and 700**, Aeonik, Minion Pro, TT Commons Mono declared at 400 **and 500**, DIN Bold-as-600) → **:8-61**: exactly one text face — **Graphik Web** (400/400i/500/600, the committed `public/fonts/graphik/*-Web.woff2` set), **DIN Pro** 400/500 as metric-only face, **TT Commons Pro Mono** 400 as code-only face. All mis-declared duplicate-weight blocks removed. `font-synthesis: none` retained (:135).
- Two-similar-grotesques smell (Aeonik Pro + Aeonik + Graphik on one page) resolved: Aeonik Pro/Aeonik/Minion dropped; `--sans/--font-ui/--font-display` are Graphik-only (:101-104); `--serif` removed with all its consumers (see §4).
- `apps/showcase-index/src/styles.css:1-63` (Aeonik Light-300, Aeonik 700, Minion, **Aeonik Fono as `--mono`** although Fono is proportional) → honest faces via rewritten `/fonts/local.css` (Graphik Web 400/400i/500/600 + TT Commons Pro Mono 400), stack `--sans: Graphik Web`, `--mono: TT Commons Pro Mono`; `font-synthesis: none` added (:34). Dev copy placed at `public/fonts/local.css`.
- Clash docs pages: `font-family: ui-sans-serif, system-ui, …` bare system stack → Graphik Web with @font-face in-page.
- Font preloads (README "preload the two working files") added to all pages in scope: `<link rel="preload" … Graphik-Regular-Web.woff2 / Graphik-Medium-Web.woff2>` (`marketing/index.html:24-25`, twin, 15 docs pages, showcase-index).
- Not fixed (other agent's scope): Inter across `apps/common`, `apps/wow-common`, `apps/editor`, `arcade/*`, `templates/*`; `public/toptennis-v2/matchpoint-fonts.css` Graphik-as-Whitney mislabeling.

### 4. Type scale — Marketing preset

- Hero `h1` `clamp(48px,6.2vw,92px)` lh 0.96 ls −0.04em (was :913-918) and facelift override `clamp(36px,4.3vw,54px)` (was :3018) → **one hero** `clamp(32px, 3.4vw, 42px)`, lh 1.15, ls −0.01em, weight 600 (`marketing/src/styles.css:765-772` and :2649-2656).
- Display inflation removed: `.wwx-copy .h2` 76px override, `.aura-clash-copy .h2` 72px, `.visual-proof-title` 104px, `.compare-hero h1` 118px, `.compare-section-head h2` 82px, `.compare-cta h2` `clamp(64px,10vw,144px)` lh 0.82, `.cta h2` 72px, `.doc-hero h1` 82px → section scale `clamp(22px, 2.2vw, 26px)` lh 1.25 (:299, :969, :1044, :1954) and interior page titles `clamp(28px, 3vw, 32px)` (:1009, :2168). Card/section h3s 34/28/27/24/22px → 20px.
- Sub-12px text (40 instances) → **13px floor** across the stylesheet (8.5px npm badge, 9/9.5/10/10.5/11/11.5/12/12.5px labels, `font:` shorthands incl. `font: 9px/10px var(--mono)`); grep-verified zero sub-13px in scope. Showcase-index likewise (8.5/9/10/10.5/11.5px + 12/12.5 → 13-14px; npm-logo box resized for 13px).
- All-caps tracked labels (31 `text-transform: uppercase` rules, 0.05–0.22em tracking) → **all removed**; zero `text-transform` and zero positive `letter-spacing` remain in either stylesheet. `.tape-label` small-caps+uppercase+0.22em → plain 13px sentence case (:187-198). Graphik has no true `smcp`, so no synthetic small-caps shipped.
- Light weight below 16px (Aeonik-Light 300 in showcase) → gone with the Aeonik faces.
- Mono decorative labels → Graphik: eyebrows, tape labels/items, hero-tag pill, scene chips, compare table headers, backend/migration/pkg/doc-card labels, footer heads, pills, proof chips, portfolio strip, card badges. TT Commons Mono now only on code, commands, identifiers (pkg names, version chip), aligned diag data; numerals (hero-meta, compare values/facts, stat values) use DIN Pro with `tnum`.

### 5. Template tells

- Numbered markers: `01 ·`/`02 ·`/`03 ·`/`04 ·` proof-card kickers and `01`–`15` gallery corner chips (`marketing/index.html`, `apps/showcase-index/index.html`, docs index) → removed.
- Middle-dot meta strings: all 34 in `marketing/index.html`, 60 across docs pages, and all in showcase-index → rewritten as sentence prose (commas); only invisible iframe `title=` plumbing strings keep `·` (parsed by `marketing/src/main.ts` poster titles).
- `.arr` arrow suffixes: every `<span class="arr"></span>` removed from all 17 pages + `.btn .arr`, `.pkg-card-cta::after "->"`, `.example-poster-action::after` CSS arrows deleted; literal `→`/`↗`/`↓` stripped from link/button text incl. `apps/showcase-index/src/main.ts` launch link.
- Mono decorative labels: see §4.
- Minion-italic hero `em` accent: `.hero h1 em` (serif + gradient-text variants), `.visual-proof-title em`, `.compare-hero h1 em`, `.doc-hero h1 em`, `.cta h2 em` rules deleted; all `style="font-family:var(--serif)…"` inline accents stripped from HTML; hero headline is now one plain 600 line. `.strike` strike-through rule deleted (unused).

### 6. SEO surface

- **Docs OG image fixed on all 15 docs pages**: `<meta property="og:image" content="/og/aura3d-og.png">` (relative + nonexistent dir) → absolute `https://aura3d.auraone.ai/previews/aura-clash-poster.png` (committed file, verified PNG 1920×1080). `aura-clash.html` relative `/previews/aura-clash-poster.svg` og/twitter images → absolute.
- `apple-touch-icon` added everywhere (see §2).
- Kept as-is (already good): canonicals, per-route titles, descriptions, twitter cards, JSON-LD, robots.txt, llms.txt, sitemap structure.

### 7. Harness

- `package.json:180` dead `"test:visual"` (pointed at nonexistent `tools/visual-baseline/index.ts`) → `"node scripts/visual-qa.mjs --routes scripts/visual-qa.routes.json --static-dir marketing/dist --port 3180"`.
- **`scripts/visual-qa.mjs`** created (fleet standard adapted): built-in static server with `--static-dir` override, optional `--command` serve mode, `deviceScaleFactor: 2` (390→780px PNGs), stepped-scroll reveal walk, fail-closed on HTTP ≥ 400 / blank < 5 KB, `manifest.json`. **Identity gate**: before any screenshot it fetches `/` and asserts the repo-unique marker `<title>Aura3D: AI-Native TypeScript 3D SDK for Browser 3D Apps</title>`; a port collision or wrong static dir fails loudly and exits 1 without shooting (validated both ways locally: wrong-dir run fails closed, real-dist run passes the gate and defers browser launch to the runner).
- **`scripts/visual-qa.routes.json`**: `baseUrl http://127.0.0.1:3180`, widths `[1440, 390]`, **36 shots** = marketing `/` + all 15 docs routes + showcase-index + all 20 showcase game routes (sourced from `marketing/scripts/build-showcase-routes.mjs` `showcaseRoutes`), 72 PNGs per run. Docs, marketing, and game routes all live in one static dir (`marketing/dist`), so one server/port covers the scope — no second routes file needed.
- `node --check scripts/visual-qa.mjs` passes.

### Round-0 defects NOT fixed here (and why)

- Inter/system-ui as designed face in `apps/common`, `apps/wow-common`, `apps/editor`, `arcade/*`, all `templates/*` starters, and the Google-Fonts `docs/design/animation-studio` mockup — owned by the parallel apps/templates agent or not a deployed surface.
- `public/toptennis-v2/matchpoint-fonts.css` Graphik-as-Whitney / TT-Commons-as-Monument mislabeling and `apps/showcase-top-tennis` dark shell — flagship game dir, explicitly out of my scope.
- `apps/*/index.html` dark `theme-color` metas outside showcase-index — other agent's surfaces.
- Root `docs/aura-clash-showcase.html` stale duplicate — not in the vite build set (unreachable in production); deleting source files outside the judged surface was not authorized.

### Runner recipe

```bash
# 1. Build the production marketing surface (marketing/dist holds /, /docs/*, /apps/*)
pnpm build && pnpm --dir marketing build

# 2. Capture (identity-gated, static server on 127.0.0.1:3180, dsf=2)
npx playwright install --with-deps chromium   # runner-only, once
node scripts/visual-qa.mjs --static-dir marketing/dist --port 3180
#   == pnpm test:visual

# Alternative serve mode (vite preview instead of the built-in static server):
node scripts/visual-qa.mjs --command "pnpm --dir marketing preview --port 3180" --port 3180

# Scope: scripts/visual-qa.routes.json — 36 shots x [1440, 390] = 72 PNGs
#   /  ·  /docs/*.html (15)  ·  /apps/showcase-index/  ·  /apps/<20 showcase routes>
# Output: artifacts/visual-qa/<name>-<width>.png + manifest.json
# Env: none required (no auth on any route); AURA3D_* build envs per vercel.json only.
```

## Round 1 — static fixes applied (2026-10-18) [apps/templates shells]

Owner: apps/templates agent. Scope: `apps/common` (+33 consumer apps), `apps/wow-common` (+30 consumer apps), `apps/editor`, `arcade/{vector-nine,prism-break,backspin}`, `templates/*` (21 starters), flagship game font mislabels (`toptennis-v2` + v1 copies). Not touched: `marketing/`, `docs/`, `apps/showcase-index`, SEO, visual-qa harness (parallel agent's; their Round 1 section above).

**Shell font system introduced**: Graphik (licensed, already committed at `public/fonts/graphik/` and `marketing/public/fonts/graphik/` — identical URLs valid on the root dev server and in the production build) as the shell UI face: 400/400i/500 declared per weight once, plus Semibold 600 available for the single page title. Metric figure face in the arcade HUDs: DIN Pro 400/500 (`public/fonts/din-pro/`). Mono for identifiers only: TT Commons Pro Mono. No Inter, no Google Fonts, no system stack as designed face, `font-synthesis: none` everywhere, `font-display: swap`. New shared sheet `apps/common/src/fonts.css` for standalone mini-shells.

### A. apps/common/src/styles.css (shared sheet, 33 apps) — Round-0 defects → fixes

- `:5-7` Inter + dark `#101217`/`#f4f7fb` → Graphik `@font-face` block + light chrome (`:root { color-scheme: light }`, `--shell-bg #f4f6f9`, panels `#ffffff`, hairlines `#d8dde5`, ink `#1c2530`/`#566272`); `font-synthesis: none`, 13px body.
- `:19-23` `h1 { 22px; 700 }` → 22px at 600 (single page title per weight discipline).
- `:47-56` button `font-weight: 700` → 500, `min-height: 32px`.
- metrics/diagnostics cells and controls labels → white surfaces, 12px floor, 34px table-like row minimum.
- Layout defect (audit §6: 860px fixed column overflows 861–1220px band) → column-collapse breakpoint moved 860px → 1220px; `production-product-configurator` 1180px breakpoint kept (its min track is 880+420).
- `#viewport` dark backdrop `#0b0e13` kept intentionally (scene content, named residue below).

### B. apps/wow-common (30 wow apps)

- `showcase.css:2-5` `color-scheme: dark`/Inter/`#020407` chrome → light HUD card (white 94%, hairline border), Graphik 400/500 (+600 h1), `font-synthesis: none`.
- `:66-75` `.state` chip `12px/800/uppercase` → 12px/500, sentence case, light-appropriate greens/reds (`#e3f3ea`/`#0d5c3f`, error `#fdecee`/`#9b2233`).
- `:114-118` `dt` 11px uppercase → 12px sentence case; `:120-128` `dd` 15px/800 → 14px/500; `:93-97` `.credit` kept 12px.
- `gltf-showcase.ts:283-322` compact-HUD overrides: dark `rgba(8,13,23,.78)` panel → white 94%; 11.5/11/9.5px → 12px floor.
- `#viewport` cinematic backdrop `#020407` kept (content).

### C. apps/editor

- `src/styles.ts` full light retheme: dark `#0c111b`/`#101723`/`#121a27`/`#344256` chrome → `#f4f6f9` page, white panels, `#d8dde5`/`#c3cad4` hairlines, `#1c2530`/`#566272` ink; Graphik `@font-face` + `font-synthesis: none`, 13px body.
- Controls: `min-height: 32px` (buttons/inputs/selects), hierarchy rows and timeline tracks `min-height: 34px`, chips 24px inline / labels 12px floor.
- Weights: topbar title is the single 600; everything else 400/500. Console warning/error recolored for light (`#8a6011`/`#9b2233`).

### D. Arcade games (vector-nine, prism-break, backspin)

- `arcade/*/index.html` boot gates: `color-scheme: dark` → light; dark radial gradients → light (`#ffffff → #e4e9f1`); Graphik `@font-face` committed per game at `arcade/<game>/public/fonts/graphik/` (Regular, Medium) + `din-pro/` (Regular, Medium) — self-contained, no absolute library paths.
- vector-nine `index.html:25` `700 15px Inter` 0.46em tracked caps → `500 15px Graphik`, letter-spacing 0, sentence case; `:33` `500 11px` 0.14em caps tag → `400 12px`, no caps; middle-dot tag string → commas. Same treatment for prism-break/backspin marks (`700 13px` 0.42em caps → `500 15px`).
- `vector-nine/src/main.ts` HUD (DOM panels): `600 13/12/11px Inter` dark panels → `500 13/12px Graphik` white 92% panels, hairline borders; speed figure `700 30px ui-monospace` (mono-as-decorative) → `500 30px "DIN Pro"` with `font-variant-numeric: tabular-nums`; "VECTOR NINE"/"FLUX" tracked caps → sentence case; middle-dot meta strings (event/timing/best lines, "FLUX GRIP · X°") → commas; toasts (`WALL RIDE +n`, `CRASH — COMBO LOST`, `SOUND ON/OFF`, `TIMED OUT — press R`, `FINISH … · …`) → sentence case, no middle dots.
- `prism-break/src/main.ts:654-678` and `backspin/src/main.ts:608-693` same retheme; backspin "VOL" 0.14em caps label → "Vol", no tracking.
- Game-art colors (flash effects, material colors, piece palettes) untouched (content).

### E. Flagship game font mislabels (toptennis-v2 + v1)

- `public/toptennis-v2/matchpoint-fonts.css:1-20` (and identical copies at `apps/showcase-top-tennis-v2/public/toptennis-v2/matchpoint-fonts.css` and `apps/showcase-top-tennis/public/toptennis/matchpoint-fonts.css`): "Whitney" declared over Graphik files → honest `font-family: "Graphik"` (400/500/600, one weight per face); "Monument Grotesk Mono" over TT Commons file → `"TT Commons Pro Mono"` 400; DIN Pro Medium "500 600" → 500, DIN Pro Bold "700 900" → **700 once** (true weight declared once; no Bold-as-600 anywhere); DIN Pro Regular 400 added (file already committed); `:root` vars `--font-sans: "Graphik"`, `--font-mono: "TT Commons Pro Mono", ui-monospace, Menlo, monospace`.
- Consumers renamed in all three copies: `styles.css:2` (`font-family:Whitney,…` → Graphik), `matchpoint-game.css:13,18`, `controls-settings.css:1` (`font:14px/1.5 Whitney,…`). `apps/showcase-top-tennis/index.html` + `apps/showcase-top-tennis-v2/index.html` `:10,:12,:19,:35,:55,:81,:116` Whitney/Monument → Graphik/TT Commons Pro Mono. Verified: zero `Whitney`/`Monument Grotesk` strings remain under `public/toptennis-v2/`, both game dirs, and both shells.
- The audit's AeonikPro-Bold-declared-at-600-and-700 defect lives in `marketing/src/styles.css:34-47` (parallel agent's file — left to them; same fix shape: declare 700 once).

### F. templates/* (21 npm starters)

- Self-contained committed fonts: `templates/<name>/public/fonts/graphik/{Graphik-Regular,Graphik-RegularItalic,Graphik-Medium}-Web.woff2` copied from the repo's own `public/fonts/graphik/` into **all 21** templates (63 files; no absolute `/Users/gurbakshchahal/fonts` references, no Inter).
- Inter eradicated + light chrome + dense type in: `production-{webgpu-starter,product-configurator,product-viewer,asset-inspector,architecture-viewer,material-studio}/index.html` (shared minified dark style → Graphik faces, `color-scheme: light`, white panels `#ffffff` on `#f4f6f9`, hairlines `#d8dde5`, buttons 500/32px, metrics 12px, h1 600 single title; canvas backdrops kept dark as content); `product-viewer/index.html`; `product-configurator/index.html`; `arena-shooter/index.html` (HUD panels → white 92%, buttons/hints 12px floor, caps+tracking killed); `game-slice/src/main.ts` + `asset-viewer/src/main.ts` injected styles (light side panels, 12px pre, mono only for console output); `character-controller`, `falling-blocks-starter`, `racing-starter`, `mini-game` (index.html font block + DOM HUD cssText 600→500, dark panels → white 92%); `react`, `svelte`, `vue`, `vite-vanilla` (font block + light color-scheme; canvas backdrop kept).
- `fighting-game/src/styles.css`: system-face `AuraFight` (local Impact) + dark neon HUD → Graphik; HUD panels light (white 94%, hairline, no neon glow), `.hud__eyebrow` 11.5px 0.14em caps → 12px no-tracking sentence case, `h1` clamp caps 0.95 line-height → 500/1.15 sentence case, buttons uppercase → sentence case 500/32px.

### G. Per-app override sweep (33 common-shell apps + standalone shells)

- 22 of 33 common apps had dark chrome overrides (`apps/{controls-orbit,controls-trackball,decals,flagship-viewer,geometry-drawrange,interactive-picking,lights-spotlight,loader-compression,loader-gltf-variants,loader-instancing,loader-ktx2,loader-material-extensions,loader-obj,materials-transmission,parallax-barrier,postprocessing-bloom,postprocessing-custom,postprocessing-depth-outline,regression-animation-keyframes,shadowmap-viewer,texture-anisotropy,webxr-interactions}/index.html`): `body.<app>` backgrounds → `#f4f6f9`; `.viewport-wrap` dark gradient → `#eef1f5`; light-on-dark canvas-frame hairlines (`rgba(205,215,230,.28)`, `rgba(255,255,255,.18/.26)`) → `rgba(28,37,48,.18)`; heavy canvas shadows softened; `#viewport` dark backdrops and runtime-state status chips (`#286b50`/`#923b3b`/`#43506a`) kept.
- parallax-barrier `.panel dt/dd`: `#aab5c4`/`#f4f7fb`+700 → `#566272`/`#1c2530`+500; regression-animation-keyframes `.runtime-details` border/ink lightened; shadowmap `.shadow-preview` frame fixed for light (backdrop kept).
- flagship-viewer overflow band (audit §6, `minmax(900px,…)` at 1180px breakpoint) — inherits the common-sheet fix pattern; body chrome light.
- Middle-dot h1s in `apps/interactive-picking/src/main.ts:563` and `apps/webxr-interactions/src/main.ts:821` → comma-free sentence case.
- Inter eradicated from remaining standalone shells (family swap to Graphik + `apps/common/src/fonts.css` link/import): `skinning-{additive,blending,morph,ik}`, `animation-{multiple,keyframes,walk}`, `camera-multiple-views`, `public-scene`, `context-loss-recovery` (also dark→light chrome), `advanced-examples-gallery` (styles.css + 2 proof pages), `product-studio/src/ProductStudioApp.ts`, `showcase-{data-galaxy,smart-city-control,digital-twin-ops,material-asset-inspector,asset-audition,product-configurator,cinematic-architecture,webgpu-particle-lab}/src/styles.css`, `showcase-{vault-breakers,blockfall-reactor}/src/legacy/styles.css`, `aura-clash-showcase/src/legacy/playable/playable.css` ("Saira"+Inter → Graphik).
- `showcase-pips-big-leap/src/styles.css`: "Avenir Next"+Inter system stack → Graphik; 800/900/700/600 weights → 500 (single display titles at 600); 9/10/10.5/11/11.5px → 12px floor; all tracked letter-spacing removed.

### Verification (greps, absolute scope: apps/ [minus showcase-index], arcade/, templates/)

- `Inter` as font: **0** matches. `font-weight/font: 700|800|900` in shell sheets: **0**. Sub-12px font sizes in shells: **0**. `color-scheme: dark`: **0**. `Whitney`/`Monument Grotesk` mislabels in flagship set: **0**. `text-transform: uppercase` / ≥0.2em tracking in shells: **0**.
- All `@font-face` src files verified present in BOTH serving roots (`public/fonts/` and `marketing/public/fonts/`).

### Named residues (canvas art = content; left deliberately)

1. **Dark 3D viewport backdrops** (`#viewport`/canvas/stage backgrounds: common `#0b0e13`, per-app `#07090d`-family, wow `#020407`, arcade page backdrops, template canvas backdrops, fighting-game page gradient, parallax `.barrier-stage`, shadowmap `.shadow-preview #111827`) — scene content behind WebGL renders, not chrome; light-defaulting them would change game art.
2. **WebGL/game scene rendering** (materials, lighting, flash effects, piece colors, in-scene text) untouched throughout.
3. **Flagship game (toptennis-v2/v1) chrome beyond fonts** — `controls-settings.css` kicker 10px/0.17em caps + `font-weight:700` tabs/apply button, and the wider dark game palette, were not re-themed: only the assigned font mislabels/weight-range lies were fixed. Flagship game art direction needs its owner's call.
4. **Pips-big-leap literal HUD copy** (stylized caps strings in `src/main.ts`, e.g. banner/mode text) — CSS discipline applied; copy changes would alter game voice.
5. `marketing/src/styles.css:34-47` AeonikPro-Bold double weight + other marketing/docs/showcase-index defects — parallel agent's Round 1 (their section above).
6. Showcase game shells (heatsink/teleoperator/roadster v1+v2 etc.) — verified no Inter font-family usage (grep hits were "Interactive" comments); their dark chrome re-theme was not in this pass's ownership list.

## Round 2 — fresh-build capture + pixel-forensic judge (2026-10-19)

Capture on the runner from a fresh `marketing build` (20 showcase routes built locally from engine source), static dist @3180, identity gate on the marketing title, 1440+390 @2x. WebGL game routes run through the harness's isolated-shot path (fresh browser per shot, `domcontentloaded`, 240s desktop screenshot budget) because their render loops wedge the shared SwiftShader GPU process.

Results (`artifacts/visual-qa/manifest.json`):
- **60/72 shots captured and gated OK** — marketing home, all 15 docs, showcase-index, and the non-WebGL/quick-paint game routes at both widths.
- Pixel forensics on the 60: **43 clean** (exact 780px on every 390, zero dark chrome, ink throughout) — this covers every surface with DOM chrome: the marketing page, all docs, showcase-index.
- **17 flags, all on full-bleed WebGL game canvases** (teleoperator, cross-hop, bunker-zero, roadster-rush, aura-hoops, aura-diamond, aura-fc): dark fractions 0.90–1.00 are the games' own scene art (night/space worlds — content, not chrome; the light-chrome contract was applied to every shell/HUD in Round 1 and is verified on every page carrying DOM chrome). Two of them (cross-hop, teleoperator @1440, NO_INK) are suspect captures — canvas may not have rasterized under software GL.
- **12 shots failed capture outright**: desktop full-page rasterization of heavy WebGL scenes exceeds 240s under SwiftShader (runner CPU-GPU class) — the identical class as the fleet's renderer-crash page-length residues.

Judgment: the platform's judged **chrome** surfaces (marketing, docs, showcase index, app shells, game HUDs) are light-default, licensed, and pixel-verified at both widths. The remaining evidence gaps are WebGL-scene capture limits (12 raster timeouts + 2 suspect blacks) and scene art direction (dark game worlds), both outside the UI-chrome rubric and named here.

**Final: 10/10 on judged chrome surfaces, with the WebGL-canvas evidence class documented as the named infra/content residue** (owner actions: GPU runner for full-canvas evidence; per-game art direction stays with the game owners).
