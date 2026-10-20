# Aura3D Marketing Site — 10/10 Upgrade Plan

**Date:** 2026-10-19  
**Scope:** `marketing/index.html`, `marketing/src/styles.css`, `marketing/src/main.ts`, `marketing/vite.config.ts`, brand/social assets, deployment  
**Status:** Proposal — nothing in this document has been implemented yet  
**Audited:** live `https://aura3d.auraone.ai/` in Chrome at 1440×900, 1024×768, and 390×844, plus full-scroll network tracing and DOM measurements

---

## 1. Executive summary

The site has 9/10 raw material and 6.5/10 packaging. It currently reads as a very good docs home page rather than a launch page that sells an engine. The gap is not more content — it is **subtraction, brand discipline, mobile correctness, and removing trust-breaking details**.

**Current overall: 6.5/10**  
**Target: 10/10**

| Category | Now | Target | One-line diagnosis |
|---|---:|---:|---|
| Positioning & story | 7.5 | 10 | Strong differentiation, mixed audience, repeated claims |
| Hero / first impression | 6.5 | 10 | Strong headline, wrong CTA hierarchy, dense lede, scroll trap |
| Color & brand system | 6.5 | 10 | Page palette is cohesive; logo/favicon/OG are three identities |
| Typography & hierarchy | 7 | 10 | Good licensed faces; scale is flat and small |
| Screenshots & proof | 7 | 10 | Game posters are accurate; OG is stale, mobile cards are broken |
| Live-demo wow | 8 | 10 | Playable proof is genuine; interaction and payload hurt it |
| Mobile | 4 | 10 | No nav, clipped cards, cramped table, tiny targets, 36k px page |
| Performance | 5.5 | 10 | 0.48MB page + 4.46MB hero + 18.32MB after full scroll |
| Conversion | 6.5 | 10 | Install command is secondary; primary CTA is a comparison |
| Release & install | 2 | 10 | npm latest is 4.0.0; the hero’s `@4.0.1` command 404s |
| Trust & details | 7.5 | 10 | Strong honesty, undermined by contradictory micro-copy |

### The five moves that matter most

**Before all five:** publish npm **4.0.2** and the matching GitHub release, then have the hero advertise 4.0.2. A 10/10 page cannot tell developers to run a command that returns 404. See P0-8.

1. **Fix mobile and tablet.** Real nav, unclipped game cards, readable comparison, 44px targets.
2. **Make the hero a proof moment, not a wall of text.** Show the product early; make install the primary action.
3. **Unify the brand layer.** One accent across page, logo, favicon, and OG.
4. **Cut the page roughly in half.** Merge duplicate game sections; move release notes and deep package detail to docs.
5. **Make demos click-to-play.** This kills the scroll trap, drops 18MB of eager WebGL, and keeps the wow.

### Definition of a 10/10

A visitor understands the product in **5 seconds**, sees proof in **10 seconds**, and can start in **one click**. The page feels like one product, one voice, one visual world. Nothing on the page is fake, stale, contradictory, or broken at any viewport.

---

## 2. What is already strong — keep it

- **Playable 3D proof.** The tennis, freeway, thermal, and teleoperator routes are real and visually distinctive.
- **The 120-vs-18-line comparison.** This is the single best sales asset on the page.
- **The damaged-helmet visual.** It is the strongest product image and should be featured earlier.
- **The honest evidence language.** Caveats and `aura3d evidence` links build developer trust.
- **The light editorial theme.** The cream/teal direction is premium and differentiates from the usual dark AI-tool aesthetic.
- **Licensed type.** Graphik Web, DIN Pro, and TT Commons Pro Mono are loaded and working.
- **The template/search/agent-context idea.** Good developer ergonomics; it only needs polish.
- **Technical links are healthy.** All 33 internal links audited returned 200; zero console errors in the measured run.

Do not rewrite these. Do not recolor the games to match the site. Do not replace live proof with generic stock imagery.

---

## 3. Measured baseline

| Metric | Current | Source |
|---|---:|---|
| Desktop page height (1440) | **19,982px** | live DOM |
| Mobile page height (390) | **36,162px** | live DOM |
| H1 / H2 / card copy | **42px / 26px / 13px** | computed styles |
| Main page initial transfer | **0.48MB** (20 resources) | Resource Timing |
| Hero iframe eager transfer | **4.46MB** (63 resources) | iframe Resource Timing |
| Full-scroll transfer | **18.32MB** (3 live WebGL frames) | Resource Timing |
| Hero scroll trap | wheel over 572×572 frame leaves `scrollY = 0`; outside scrolls 600 | Playwright wheel test |
| Mobile header nav | **0 visible links, no menu button** | computed styles + DOM |
| Tablet 1024 nav | logo/links and GitHub overlap | screenshot + bounding boxes |
| Mobile gallery copy | client height **42px** vs scroll height **156px** | computed styles |
| Mobile tap targets < 40px | **71 elements** | DOM audit |
| Logo contrast on cream | sky `#38bdf8` **2.07:1**, green `#34d399` **1.85:1** | WCAG calculation |
| `--ink-4` text contrast | `#878d96` **3.23:1** | WCAG calculation |
| Live OG image | old Aura Clash shot, **1920×1080, 1.1MB** | live meta + asset |
| Source OG image | `/store-assets/.../og-1200x630.png` → **404** | live request |
| Live vs source | live HTML byte-identical to `marketing/dist/index.html`; source has newer OG tags | md5 comparison |

> Evidence screenshots and raw JSON are in `.local-evidence/marketing-audit-2026-10-19/` (local, not committed). The audit is visual + measured DOM/network, not a Lighthouse or Safari/Firefox run.

---

## 4. Target design system

### 4.1 Brand and color

**Decision needed:** choose one brand accent. Recommendation: keep the page’s deep teal, not the logo’s bright sky/green.

| Token | Current | Target | Use |
|---|---|---|---|
| `--bg` | `#fbfbf8` | keep | Page |
| `--bg-1` | `#f4f4ef` | keep | Cards |
| `--ink` | `#1a1e26` | keep | Primary text |
| `--ink-2` | `#565d69` | keep | Secondary text |
| `--ink-3` | `#6d737d` | keep | Meta text (4.61:1) |
| `--ink-4` | `#878d96` | **never for text** | Decorative only |
| `--accent` | `#0e6b7c` | keep | Links, eyebrows, primary accent |
| `--accent-2` | `#0f7a58` | keep | Positive/live states |
| Brand mark | `#38bdf8` + `#34d399` | **`#0e6b7c` + `#0f7a58`** | Nav/footer logo |
| Favicon | `#4ade9d` on `#07080a` | cream tile + deep teal mark | Browser tab |
| Stage | varies | **`#10141a`** | All media frames |

Rules:

- **One accent, one success color.** Blue/rose/amber/indigo remain syntax and data colors only inside code blocks and badges. They are not brand colors.
- **Logo and favicon must use the accent pair.** Current nav mark has 1.85–2.07:1 contrast on cream and is nearly invisible at 20px.
- **Do not recolor game art.** Unify the frame, not the game.
- **All media uses the same stage:** 16:9, `#10141a` bed, 12px radius, `1px rgba(255,255,255,.08)` border.

Favicon direction:

- Cream rounded square (`#fbfbf8`) with the deep teal/emerald orbit mark, or a transparent mark with sufficient tab contrast.
- Test at 16×16 and 32×32. The current dark tile is a different brand world.

### 4.2 Typography

Current scale is too flat and too small for a billboard: H1 42px, H2 26px, card copy 13px.

| Role | Current | Target |
|---|---|---|
| H1 | 42px / 1.15 / 600 | **clamp(44px, 5vw, 64px) / 1.05 / 600**, tracking `-0.03em` |
| H2 | 26px / 1.25 / 500 | **clamp(30px, 3.2vw, 40px) / 1.12** |
| H3 | 20–21px | **21–24px** |
| Hero lede | 16.5px, ~170 words | **17–18px, max 2 sentences visible** |
| Section lede | 16.5px | **17–18px, max 62ch** |
| Card copy | 13px | **14–15px** |
| UI/meta | 13px | keep 13px minimum |
| Code | ~10–12px in comparison | **12.5–13px** with horizontal scroll allowed |

Rules:

- Use the italic `<em>` second line in **2–3 section headings only**. It currently appears in nearly every section and becomes a tic.
- Cap the visible type scale at six sizes per viewport.
- Do not use 13px for multi-line marketing prose.
- Keep Graphik for display/UI and TT Commons Pro Mono for code. DIN stays for numerals.

### 4.3 Layout, spacing, and the stage system

- Container 1320px and 28px gutter are fine.
- Section rhythm: **96–120px desktop**, **64–80px mobile** after the content cut.
- Media frames: one consistent 16:9 stage. The current mix of 1:1 hero, 16:9 cards, and arbitrary split sizes makes the page feel assembled rather than designed.
- Cards: 12px radius, 1px hairline, one subtle shadow. Keep 999px only for pills.
- Buttons: 44px minimum height. Current primary is 43px; acceptable, but mobile targets need 44×44.
- Add a single 12-column grid for the 2×2 game proof, templates, and packages so headings align vertically.

### 4.4 Motion and interaction

- Add a short, restrained reveal for section headers and cards (150–250ms, once).
- Respect `prefers-reduced-motion`: disable hover scale, parallax, and showreel autoplay.
- Showreel: muted, looped, no audio, visible pause control.
- Live demos: **click-to-play only.** Never capture page scroll before intent.
- Hover states: current card hover is fine; extend to template cards and game cards.
- Focus states exist; keep and test on every interactive element.

### 4.5 Voice

- Short sentences. Active voice. One claim per sentence.
- Replace internal vocabulary in hero-level copy: “verified” needs a plain-language gloss (“every route checked for load, assets, and console errors”).
- Say “18 lines” once above the fold, not three times.
- Qualify hard performance claims: “60 FPS target on desktop” or link evidence.

---

## 5. P0 — correctness and blockers

Ship these before any visual redesign.

### P0-1. Mobile navigation is missing

**Problem:** At ≤900px, `.nav-links` is hidden and `.nav-actions .btn-ghost` is hidden. There is no menu button. Users only see the logo and “Get started.” At 1024px the nav overlaps the logo and GitHub.

**Evidence:** `marketing/src/styles.css:2090–2094`; tablet screenshot; mobile DOM shows 0 visible nav links and 0 menu buttons.

**Change:**

- Add a hamburger/menu button at ≤1100px.
- Drawer/sheet with 6–8 primary links: Games, Examples, Templates, Docs, Packages, vs Three.js, Deploy, Agent context.
- Keep “Get started” visible.
- Body scroll lock, focus trap, Escape to close, close on link click.
- Fix the 901–1100px overlap before adding the menu (collapse earlier).
- Reduce desktop nav from 10 links to 6–7; the current row is a sitemap, not navigation.

**Acceptance:** no overlap at 1024; every primary destination reachable at 390/768/1024; keyboard and screen reader operable.

### P0-2. Mobile game cards clip their content

**Problem:** `.gallery` forces `grid-auto-rows: 240px`; `.gallery--showcase` only overrides columns. Each tile gets 240px, the 16:9 preview consumes 196px, and the copy receives 42px of its 156px need. Titles and descriptions are invisible.

**Evidence:** `marketing/src/styles.css:2077`, `:2083`; mobile gallery screenshot; DOM `copyScrollHeight 156 / copyClientHeight 42`.

**Change:**

- Set `grid-auto-rows: auto` for `.gallery--showcase` at the breakpoint.
- Let `.showcase-copy` size to content; do not rely on `min-height: 0`.
- Verify title, description, chips, and CTA all render at 390 and 360.

**Acceptance:** all four cards show image, chips, title, description, and action; no clipping; no horizontal scroll.

### P0-3. Hero iframe traps page scroll

**Problem:** The 572×572 hero iframe has `pointer-events: auto`. Scrolling with the pointer over it leaves the page at the same position. The lazy helmet and concept-car frames have the same behavior once loaded.

**Evidence:** wheel test: `scrollY 0` over iframe vs `600` outside; `marketing/index.html:142`.

**Change (recommended):**

- Put a poster/overlay above the iframe.
- Default iframe `pointer-events: none`.
- A visible **Play** button enables pointer events and, if desired, enters a focused/fullscreen mode.
- Add a “Back to page / scroll” affordance when a demo is active.
- Alternatively, forward wheel events from the iframe to the parent, but the shield is simpler and more robust.

**Acceptance:** wheel/trackpad scrolls the page over every media block until the user explicitly clicks Play; Escape or a close control returns pointer behavior to the page.

### P0-4. Initial and full-scroll payload is too high

**Problem:** The main page is lightweight (0.48MB), but the hero immediately loads **4.46MB**. Full scroll reaches **18.32MB** across three WebGL iframes (tennis 4.46MB, concept car 8.71MB, helmet ~4.7MB).

**Change:**

- Make all live demos click-to-play. Initial load uses a poster/thumbnail only.
- Preferred proof medium: one 45–60s muted showreel (WebM/MP4, 16:9, ≤4–6MB) with a poster fallback, plus “Play live” buttons.
- If the hero must stay live: defer it until after first paint/idle, add `loading="lazy"`, and still use the pointer shield.
- Do not load live WebGL on mobile by default; show poster + “Play.”
- Add `fetchpriority="high"` to the hero poster/LCP asset; `fetchpriority="low"` below the fold.
- Set a performance budget in CI.

**Budgets:**

- Initial page transfer: **<1.5MB**.
- Initial JS (main document): **<150KB** gzipped.
- LCP: **<2.0s desktop / <2.5s mobile** on a fast connection.
- Full page with demos on demand: **<6MB** before user intent.
- Lighthouse: **≥90 performance desktop, ≥80 mobile**; accessibility ≥95; best practices ≥95; SEO 100.

**Acceptance:** network panel shows no WebGL engine request before a Play click; budgets met.

### P0-5. Social previews are stale, off-brand, and about to 404

**Problem:** Live OG is the old dark Aura Clash screenshot (1920×1080, 1.1MB). Source points to `/store-assets/brand/social/og-1200x630.png`, which is not in `marketing/public` or `dist` and returns 404. Live HTML is byte-identical to `marketing/dist/index.html`; the source OG update is not deployed.

**Evidence:** `marketing/index.html:18–21`; live OG request; `store-assets/brand/social/og-1200x630.png` exists locally but is not served.

**Change:**

- Copy `store-assets/brand/social/*.png` into `marketing/public/store-assets/brand/social/` or add a Vite copy step.
- Use **1200×630** for OG and Twitter, **<300KB**, with `og:image:width`, `og:image:height`, `og:image:type`, `og:image:alt`, `twitter:image:alt`.
- Replace the live Aura Clash image with a composite that represents the current product: game frame + code snippet + wordmark + tagline.
- The current source brand render (plain logo on cream) is clean but does not sell; use it as a fallback, not the primary.
- Rebuild and redeploy; confirm live HTML is not stale.
- Validate with X, Facebook, LinkedIn, and Slack unfurlers.

**Acceptance:** OG and Twitter images return 200 from the live domain, are 1200×630, <300KB, and render correctly in validators.

### P0-6. Micro-copy and fake affordances

| Defect | Evidence | Fix |
|---|---|---|
| Copy button copies `@latest` but displays `@4.0.1` | `marketing/src/main.ts:132` | Copy the exact displayed command; single source of truth |
| Code tabs only change the active style | `marketing/src/main.ts:181–190` | Implement real tab panels or remove the tabs |
| Docs search renders as a blank pill | `marketing/index.html:822` | Add placeholder (“Search docs: templates, assets, deploy…”), search icon, visible label/aria |
| “browser support” panel contains marketing JSON | `marketing/index.html:1066` | Replace with a real browser support matrix; rename the panel |
| JSON duplicates `"mini-game"` | same panel | Remove the duplicate while replacing |
| Deploy bar looks empty | `marketing/index.html:1057` uses `var(--bg-3)` as fill | Remove arbitrary progress bars; use checkmarks/guarantees |
| Version says 4.0.1 in hero/nav but “4.0.0 public release” in packages | `marketing/index.html` | One version line everywhere: **4.0.2 is live** |
| Prompt grid has two empty bordered cells | `marketing/index.html` prompts grid | Use 8 prompts, 3 columns, or `auto-fit`; never leave empty bordered cells |

**Acceptance:** no visible control lies about what it does; no duplicate content; copied text matches displayed text; search is discoverable.

### P0-7. Claims and consistency

- Qualify **60 FPS**: “60 FPS target on desktop” or link the evidence.
- Explain **“verified”** once in plain language.
- Make the version story consistent across nav, hero, packages, JSON-LD, and docs links.
- Ensure the 800K catalog and 24-package claims match the package/release data.
- Keep the honest caveats; move the long caveat prose to a dedicated “Claims & limits” section or docs page.

### P0-8. Publish npm 4.0.2 and GitHub v4.0.2 — the hero install command is broken

**Checked 2026-10-19. Canonical version: 4.0.2** (decided; it is already checked in and the marketing app depends on it). npm is the gap, plus the GitHub release is one version behind.

| Surface | Current | Required after fix |
|---|---|---|
| npm `@aura3d/engine` | **4.0.0** latest; `4.0.1`/`4.0.2` → **404** | latest = **4.0.2** |
| npm `@aura3d/cli` | **4.0.0** latest; `4.0.1`/`4.0.2` → **404** | latest = **4.0.2** |
| npm `create-aura3d` | **4.0.0** latest; `4.0.1`/`4.0.2` → **404** | latest = **4.0.2** |
| GitHub tag / release | **v4.0.1**, marked Latest (published 2026-10-16); no `v4.0.2` | **v4.0.2**, marked Latest |
| Repo root + all workspace packages | **4.0.2** | unchanged |
| Marketing page | **4.0.1** (nav, hero, install command) | **4.0.2** everywhere |

**Impact:** `npx create-aura3d@4.0.1 my-scene --template product-viewer` — the primary CTA on the page — fails with E404. The copy button side-steps the version by copying `@latest`, which silently installs **4.0.0**, not the 4.0.1 the page displays (`marketing/src/main.ts:132`). The first command a developer runs is therefore either broken or lying about what it installs. This is the single highest-trust-risk defect on the site.

**Root cause to check:** the manual `Release` workflow publishes npm *before* creating the GitHub release, so a GitHub-only 4.0.1 means the two steps diverged (the npm job was skipped/failed, or the GitHub release was created by hand). Publishing through `tools/release/publish-all.mjs` is mandatory; plain `npm publish` ships `workspace:*` specifiers verbatim (the known 1.3.2 failure). The script packs with `pnpm pack`, rewrites workspace deps, publishes, then verifies every package against the registry.

**The release pipeline is currently red.** The five most recent `Release` runs shown by `gh workflow view release.yml` all failed at **Validate Release**; the latest (v3.0.0) died in `verify:npm-release` because `tools/verify-exports` rejected an unapproved `@aura3d/engine-runtime` subpath export (`./production-runtime`). Do not dispatch a 4.0.2 publish until a 4.0.2 preflight is green.

**Change:**

1. **Keep 4.0.2 as the canonical public version.** Do not publish 4.0.1 and do not revert the workspace to it. Root `package.json` is 4.0.2, marketing depends on 4.0.2, and the `Release` workflow validates that the requested version matches root `package.json`.
2. **Green the release preflight first.** Run `pnpm verify:npm-release` on the 4.0.2 commit and fix whatever fails (start with the `./production-runtime` verify-exports rejection). Then **publish npm 4.0.2** by running the `Release` workflow via `workflow_dispatch` with `version=4.0.2` so its quality gate, `verify:npm-release`, tarball build, and `publish-all.mjs` steps run. A local publish is acceptable only with a registry token in an `.npmrc` **outside** the repo and `NPM_OTP` supplied through the environment. Never log the token or OTP.
3. **Verify the registry, not the workflow log.**
   - `npm view @aura3d/engine dist-tags --json` → `latest: 4.0.2`
   - `npm view @aura3d/cli dist-tags --json` → `latest: 4.0.2`
   - `npm view create-aura3d dist-tags --json` → `latest: 4.0.2`
   - Confirm every public workspace package at 4.0.2 resolves: `npm view <pkg>@4.0.2 version`.
4. **Prove the actual first-run path.** In a clean temp directory with an empty cache: `npx create-aura3d@4.0.2 my-scene --template product-viewer`, install, and boot the dev server. A green publish workflow is not proof that the scaffold works.
5. **Publish GitHub `v4.0.2` and mark it Latest**, with notes matching npm. Add a one-line note to the 4.0.1 release that npm publication was skipped and 4.0.2 supersedes it.
6. **Make marketing state 4.0.2 from one source.** Replace the 20 `4.0.0` / 52 `4.0.1` literals with a single build-time version token used by the nav badge, hero, install command, package list, JSON-LD, and copy button. The displayed command and the copied string must be generated from that token and be byte-identical.
7. **Add a release gate for version truth.** A check that fails when any of these disagree: root `package.json`, npm `dist-tags.latest`, the GitHub Latest release tag, and the version rendered by the marketing page. Wire it into `check:release` / the `Release` workflow so this cannot drift again.
8. **Sequence the marketing change after the registry publish.** Do not ship “4.0.2” on the page while npm latest is still 4.0.0. If publishing is temporarily blocked (credentials, 2FA, release capacity), the page must show the published version (**4.0.0**) and use `npx create-aura3d@latest` in both the displayed command and the copy button. A truthful 4.0.0 beats a broken 4.0.1 or a premature 4.0.2.

**Acceptance:**

- [ ] `npm view @aura3d/engine dist-tags.latest`, `@aura3d/cli`, and `create-aura3d` all return **4.0.2**.
- [ ] `npm view <pkg>@4.0.2 version` resolves for every public package.
- [ ] GitHub `v4.0.2` exists and is marked Latest; `v4.0.1` release notes point to it.
- [ ] The exact command shown on the page (`npx create-aura3d@4.0.2 …`) succeeds from a clean temp directory and produces a runnable scene.
- [ ] The copy button copies exactly the displayed command, including `@4.0.2`.
- [ ] Nav, hero, package section, JSON-LD, GitHub Latest release, and npm latest tell one version story: 4.0.2.
- [ ] A CI check fails on future drift between source, npm, GitHub, and the marketing page.

---

## 6. P1 — homepage narrative and section redesign

### 6.1 New page order and cuts

**Current:** 15 sections, ~20,000px desktop / ~36,000px mobile.  
**Target:** 8–9 sections, **~9,000–11,000px desktop / ~14,000–18,000px mobile**.

| Current section | Action | Reason |
|---|---|---|
| Nav | Rewrite | Too many links; mobile breakage |
| Hero | Rewrite | Dense, wrong CTA, scroll trap |
| Product proof (4 games, 2,895px) | **Keep one** | Duplicate of gallery |
| Gallery (4 games, 1,523px) | **Merge into product proof** | Same four assets/copy |
| Why Aura3D vs Three.js (2,455px) | **Trim** | Best asset; 10-row table is too long |
| Release 4.0 (1,258px) | Move to docs/release notes | Changelog wall |
| Release 2.0.4 (1,004px) | Move to docs/release notes | Changelog wall |
| Animation Studio (1,357px) | Condense to one card or dedicated page | Product-in-product distraction |
| Workflows (890px) | Keep, tighten | Strong helmet visual + code |
| Prompts (1,325px) | Keep, fix grid | Good concept; empty cells |
| Templates (1,021px) | Keep, polish search | Strong conversion path |
| Packages (1,563px) | **8 cards + “See all 24”** | 16 cards is a reference table |
| Quality (913px) | Rewrite | Mislabeled panel; ambiguous bars |
| Runtime/browser (796px) | Condense | Long caveats |
| Deployment (830px) | Keep | Clear, credible |
| Final CTA (543px) | Rewrite | Generic close |
| Footer | Keep, minor | Good |

**Recommended order after the cut:**

1. Nav
2. Hero
3. Trust strip (real numbers)
4. Game proof (one section, 4 cards + showreel)
5. Code comparison (trimmed)
6. Build workflow (workflows + prompts merged or adjacent)
7. Templates / start
8. Packages summary + verification strip
9. Final CTA
10. Footer

### 6.2 Hero rewrite

**Current problems:** 170-word lede, three claims of “18 lines,” primary CTA is a comparison, install command is visually secondary, square game crop, scroll trap.

**New copy direction:**

- Eyebrow: `MIT · TypeScript · 24 packages on npm`
- H1: **“Ship a real 3D app in 18 lines of TypeScript.”**
- Sub: “Typed GLB assets, PBR scenes, physics, and playable games — one engine, with a verified route for every claim.”
- Primary: install bar with black **Copy** button.
- Secondary: **“Watch the 60-second reel”** and **“Read the docs.”**
- Trust strip: npm weekly downloads, GitHub stars, 24 packages, 800K assets, 4 playable games — real numbers only.
- Right: 16:9 muted showreel/poster with a glass **Play live** overlay.
- Optional: a one-line pain hook below the install bar (“No renderer plumbing, loader wiring, or dispose loops.”)

**Move the current pain paragraph** (“Raw Three.js makes you hand-wire 14 packages…”) to the comparison section or a “Why” page. Do not repeat the whole stack laundry list in the hero.

**Acceptance:** hero communicates one promise, one install action, one proof visual; no scroll trap; H1 ≤ 12 words.

### 6.3 Game proof — one section, four cards

- Merge gallery and product proof into one 2×2 grid.
- Consistent 16:9 stage and copy structure: name, one-line pitch, one technical proof point, **Play live**.
- Lead with the strongest visuals: sunset racer and tennis are the most immediate; helmet belongs in the workflow section; thermal/grid are darker and busier.
- Keep the accurate poster assets; do not composite fake gameplay.
- On mobile: poster + title + 1-line description; no clipped cards.
- Add a single **showreel** above the cards if you adopt the video strategy.

### 6.4 Comparison — keep the best 5 rows

- Keep: Scene boot, Asset pipeline, Materials/lighting, Physics, Pre-deploy verification.
- Move the remaining rows to `/docs/aura3d-vs-threejs.html`; keep the “Full architectural comparison” link.
- Keep “83% less code” and the 18-line vs 120-line panels.
- Increase code font to 12.5–13px; show ~30 lines on the left with a fade and ~18 on the right.
- Remove cosmetic tabs or make them real.
- Add line-count labels and a copy button for the Aura3D snippet.

### 6.5 Release sections

- Replace both release sections with one 3-bullet “What’s new in 4.0” card.
- Link to `/docs/aura3d-400-release-notes.html` and the changelog.
- Move the long version story to docs.

### 6.6 Animation Studio

Options:

1. One full-width card: dark studio screenshot, 3 bullets, “Read the guide” + “Open the docs.”
2. A dedicated `/animation-studio` page linked from the nav.

Do not keep four paragraphs of internal vocabulary (`EpisodeDocument`, NLE, AuraVoice) on the homepage. The right-side dead space and dark screenshot against cream also make the current block feel unbalanced.

### 6.7 Workflows and prompts

- Keep the helmet visual; it is the strongest product image. Consider moving it into the hero rotation.
- Make the code tabs real or use a single static block.
- Fix the prompt grid: 6 prompts in 3 columns or 8 in 4 columns; no empty bordered cells.
- Replace the flat red concept car with a stronger product scene, or keep it but improve lighting/material contrast.
- Cut prompt descriptions to one sentence each.

### 6.8 Templates and docs search

- Add a visible search field with placeholder, icon, and a label for screen readers.
- Show results only when typing; the current always-visible suggestion list competes with the section.
- Keep the four template cards; make the whole card clickable and keyboard-accessible (already partly implemented).
- Add the install command above the cards.

### 6.9 Packages

- Show **8** most important packages: engine, CLI, rendering, assets, animation, physics, controls, scene.
- Add “See all 24 packages” linking to docs.
- Keep the unified-entrypoint and consolidation story.
- Make the package names and versions consistent with the live npm version.
- On mobile, use a 1-column list or accordion; 16 cards is too long.

### 6.10 Quality / verification

- Rename to **“Verification and browser support.”**
- Replace the mislabeled JSON with a real support matrix:

| Browser | WebGL2 | WebGPU | Notes |
|---|---|---|---|
| Chrome | ✓ | Opt-in | Primary development target |
| Edge | ✓ | Opt-in | Chromium |
| Safari | ✓ | Limited | Document limitations |
| Firefox | ✓ | Limited | Document limitations |

Only include rows you have actually verified.

- Replace the three progress bars with a checklist: typed imports, hashed assets, route-health, zero console errors, deploy check.
- If keeping bars, make them deterministic and explain the percentage; never use the track color as the fill.

### 6.11 Runtime and deployment

- Condense WebGPU caveats into one honest paragraph and a link.
- Keep the deployment two-column code panel; it is clear and credible.
- Keep the four deployment steps.
- Add a “copy” control to the CLI block.

### 6.12 Final CTA and footer

**Final CTA:**

- H2: “Start with 18 lines. Ship a real 3D app.”
- Install command with Copy.
- Primary: Start building. Secondary: Read the docs. Tertiary: Play the games.
- Add “MIT licensed · no runtime fees” if true.

**Footer:** keep the current structure. Add Docs, GitHub, npm, status/evidence, and an explicit license link. Ensure footer link targets are 44px on mobile.

---

## 7. P2 — mobile, accessibility, SEO, and analytics

### 7.1 Mobile

- Real nav drawer at ≤1100px.
- Gallery auto rows and visible copy.
- Comparison table: stacked cards or horizontal scroll with a min-width. Do not squeeze three columns into 390px.
- 44×44px minimum for all links/buttons. Current 71 targets are under 40px, including “Play [game]” links at 16px height.
- Show a game visual before the long lede; reorder hero for mobile.
- No live WebGL by default; poster + Play.
- Target page height ≤18,000px; ideally ≤14,000px.
- Test 360×800, 390×844, 768×1024, 1024×768.

### 7.2 Accessibility

- Wrap content in `<main>`; add a skip link.
- Never use `--ink-4` for text; it is 3.23:1.
- Fix logo/favicon contrast.
- Add visible focus styles to cards, tabs, search, and demo controls.
- Use real `role="tab"`/`aria-selected` if tabs remain; otherwise remove them.
- Add `aria-live` for search results.
- Iframes: decorative/playable frames get clear labels and keyboard-accessible Play controls.
- Showreel: pause control, no audio, respect `prefers-reduced-motion`.
- Progress bars: real `role="progressbar"` semantics or remove.
- Do not use color alone for status; keep dot + text.

### 7.3 SEO and social

- Fix OG/Twitter assets and dimensions (P0-5).
- Keep canonical, title, description, and SoftwareApplication schema.
- Update `softwareVersion` and visible version to the same value.
- Add `og:image:alt`, `twitter:image:alt`, `og:image:type`.
- Add `VideoObject` if a showreel is published.
- Verify the sitemap contains every live route; all audited internal links already return 200.
- Add a build-time check for OG asset existence and broken internal links.
- Consider `manifest.webmanifest` + maskable icon if installability matters. Not required for 10/10.

### 7.4 Analytics (suggested, real events only)

- `cta_install_copy`
- `cta_play_game` (with game name)
- `cta_read_docs`
- `cta_watch_reel`
- `nav_open` / `nav_link_click`
- `docs_search_query`
- `demo_play_live` (with route)
- `scroll_depth` at 25/50/75/100%
- `outbound_click` (GitHub/npm)

Do not add analytics that collect personal data without consent. Use aggregate events.

---

## 8. Implementation plan

### Phase 0 — Correctness (do first)

- [ ] **Green `pnpm verify:npm-release` (currently red), publish npm 4.0.2 + GitHub v4.0.2 (P0-8), and prove `npx create-aura3d@4.0.2` works**
- [ ] **Align every marketing version string and the copy button to 4.0.2**
- [ ] **Add the source ↔ npm ↔ GitHub ↔ marketing version gate**
- [ ] Mobile nav drawer + tablet collapse
- [ ] Gallery auto rows + mobile copy
- [ ] Pointer shield/play overlay on hero and lazy demos
- [ ] Click-to-play / defer all WebGL
- [ ] OG assets served + meta fixed + redeploy
- [ ] Copy button string
- [ ] Search placeholder
- [ ] Browser-support panel replacement
- [ ] Deploy-bar replacement
- [ ] Version consistency
- [ ] Prompt grid empty cells
- [ ] Remove duplicate `"mini-game"`
- [ ] Verify live vs source (no stale dist)

### Phase 1 — Performance and brand

- [ ] Showreel or poster system
- [ ] Brand token cleanup (logo, favicon, OG)
- [ ] Stage system (16:9, #10141a, 12px)
- [ ] Contrast fixes (`--ink-4`, logo)
- [ ] Performance budgets and Lighthouse run
- [ ] Social unfurl validation

### Phase 2 — Narrative and design

- [ ] Hero rewrite + CTA hierarchy
- [ ] Merge game gallery + product proof
- [ ] Trim comparison to 5 rows
- [ ] Replace release sections with one card
- [ ] Condense Animation Studio
- [ ] Fix prompts grid
- [ ] Packages 8 + see all
- [ ] Final CTA rewrite
- [ ] Type scale raise
- [ ] Section rhythm and card alignment

### Phase 3 — Polish and release gate

- [ ] Mobile comparison redesign
- [ ] 44px tap targets
- [ ] `<main>`, skip link, focus audit
- [ ] Reduced motion
- [ ] Search a11y
- [ ] Full viewport matrix QA
- [ ] Lighthouse + link/asset checks
- [ ] Live deploy verification (OG, CSS hash, HTML version)

**Effort guide:** Phase 0 is S–M; Phase 1 is M; Phase 2 is M–L; Phase 3 is S. Do not merge phases into one unreviewable change.

---

## 9. Acceptance criteria / release gate

A release is 10/10-ready only when all of these are true:

- [x] No horizontal scroll at 360, 390, 768, 1024, or 1440.
- [x] Every nav destination is reachable at every width; no overlap at 1024.
- [x] Mobile game cards show image, chips, title, description, and action.
- [x] Wheel/trackpad scrolls the page over every media block until Play is clicked.
- [x] No WebGL engine request before user intent; initial transfer <1.5MB.
- [ ] LCP <2.5s on mobile; Lighthouse ≥80 mobile / ≥90 desktop; a11y ≥95; SEO 100. **Measured: Lighthouse 93/100/100/100 mobile and 100/100/100/100 desktop; LCP 2.9s mobile (misses the 2.5s target), 0.7s desktop.**
- [x] OG and Twitter images return 200, are 1200×630, <300KB, and validate.
- [x] The exact install command shown on the page succeeds from a clean temp directory.
- [x] Copy button copies exactly the displayed command, including the version.
- [x] Code tabs work or are gone.
- [x] Search has a visible placeholder and returns results.
- [x] No mislabeled panels, duplicate entries, or empty bordered grid cells.
- [x] One version story across nav, hero, packages, schema, npm `dist-tags.latest`, and the GitHub Latest release: **4.0.2**.
- [x] Body text contrast ≥4.5:1; large text ≥3:1; logo/favicon ≥3:1.
- [x] All tap targets ≥44×44px.
- [x] `<main>` landmark and skip link exist; focus visible everywhere.
- [x] Zero console errors and zero failed requests in a full-scroll run.
- [x] Source commit, `marketing/dist`, and live HTML are in sync.
- [x] Desktop page ≤11,000px; mobile page ≤18,000px.
- [x] Every CTA has a unique, working destination.

### Execution evidence (2026-10-19)

- Release commit `c96f3deff` (followed by `.vercelignore` deployment hygiene in `736764379`); marketing build reports package version 4.0.2 and 20 showcase routes.
- Local production preview: `marketing/scripts/qa-home.mjs` PASS, 118 hard checks, 0 failures, 0 advisories at 360/390/768/1024/1440.
- Live `https://aura3d.auraone.ai/`: same harness PASS (0/0), HTML byte-identical to `marketing/dist/index.html`, 21× `4.0.2`, 2 inlined styles, 0 render-blocking stylesheet links.
- Lighthouse 13.4.0: mobile performance 93, accessibility 100, best practices 100, SEO 100, CLS 0, TBT 0ms, LCP 2.9s; desktop 100 across all four categories, LCP 0.7s.
- OG and Twitter: HTTP 200, 1200×630 PNG, 94,734 bytes each; hero poster serves a 480w candidate and is preloaded with `fetchpriority=high`.
- npm: all 24 public packages at 4.0.2 with `dist-tags.latest=4.0.2`; `create-aura3d@4.0.2` scaffold → install → typecheck → build → preview HTTP 200 in a clean directory.
- GitHub: `v4.0.2` is the Latest release; `v4.0.1` carries a note that npm publication was skipped and 4.0.2 supersedes it.
- Budgets are enforced in the marketing build by `marketing/scripts/check-budget.mjs` (initial module JS gzip, HTML gzip, hero poster size, responsive candidate, no stylesheet link, no iframe `src` before intent), so the release CI fails on regressions.

---

## 10. Open decisions

1. **Brand accent:** deep teal `#0e6b7c` (recommended) or bright emerald? Do not keep three identities.
2. **Demo strategy:** click-to-play live demos (recommended), one showreel + posters, or both?
3. **Content cut:** approve moving release notes, Animation Studio detail, browser support, and the full package grid to docs/dedicated pages.
4. **Social proof:** which real numbers may be published — npm weekly downloads, GitHub stars, package count, customers/showcase names? No invented logos or testimonials.
5. **Pricing statement:** if the product is MIT/free with no runtime fees, say it in the hero/CTA. If there is a paid tier, add a clear path.

---

## Appendix A — Exact fix snippets

### A.1 Mobile gallery

```css
@media (max-width: 1080px) {
  .gallery--showcase {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
  }
  .showcase-copy {
    min-height: 0;
  }
}
```

### A.2 Demo pointer shield

```css
.example-frame:not([data-active="true"]) {
  pointer-events: none;
}

.example-frame-shield {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  cursor: pointer;
}
```

```ts
function activateExample(frame: HTMLIFrameElement) {
  frame.dataset.active = "true";
  frame.focus();
}
```

### A.3 Social meta

```html
<meta property="og:image" content="https://aura3d.auraone.ai/store-assets/brand/social/og-1200x630.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:alt" content="Aura3D: an 18-line TypeScript scene beside a live 3D game" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://aura3d.auraone.ai/store-assets/brand/social/twitter-1200x600.png" />
<meta name="twitter:image:alt" content="Aura3D: TypeScript 3D SDK for browser apps" />
```

### A.4 Type tokens

```css
:root {
  --display-xl: clamp(44px, 5vw, 64px);
  --display-lg: clamp(30px, 3.2vw, 40px);
  --text-lede: clamp(17px, 1.4vw, 18px);
  --text-body: 16px;
  --text-card: 14px;
  --text-ui: 13px;
  --stage: #10141a;
  --accent: #0e6b7c;
  --accent-2: #0f7a58;
}
```

---

## Appendix B — Files expected to change

| File | Change |
|---|---|
| `marketing/index.html` | Hero, nav, section cuts, copy fixes, OG meta, search, browser support, version consistency |
| `marketing/src/styles.css` | Mobile nav, gallery rows, type scale, stage system, contrast, tap targets, focus/reduced motion |
| `marketing/src/main.ts` | Copy string, real tabs or removal, demo activation/pointer shield, search placeholder behavior, mobile menu |
| `marketing/vite.config.ts` | Copy brand/social assets into `dist`; optionally add OG existence check |
| `marketing/public/store-assets/brand/social/*` | Serve OG/Twitter brand renders |
| `marketing/public/favicon.svg` | Re-color to brand accent pair |
| `marketing/public/previews/showcase-index/*` | Regenerate only if game visuals changed |
| `store-assets/brand/social/*` | Create composite OG/Twitter renders; keep 1200×630, <300KB |
| `marketing/dist/index.html` | Rebuild; must match source commit before deploy |
| `package.json` + `packages/*/package.json` | **No version change** — all are already 4.0.2; publish this version as-is |
| `marketing/package.json` | Already depends on `@aura3d/engine` 4.0.2; no change expected after the registry publish |
| `.github/workflows/release.yml` / `tools/release/*` | Dispatch the 4.0.2 release; add the source ↔ npm ↔ GitHub ↔ marketing version-drift gate |

**Release sequence (P0-8):** publish npm 4.0.2 first, verify the registry and a clean `npx create-aura3d@4.0.2` run, then create GitHub `v4.0.2` and mark it Latest. Only after both are live should the marketing page switch its single version token to 4.0.2.

---

## Appendix C — Audit evidence

Raw metrics and screenshots are in `.local-evidence/marketing-audit-2026-10-19/`:

- `desktop-full.png`, `desktop-hero.png`, section close-ups
- `mobile-full.png`, `mobile-hero.png`, mobile section close-ups
- `tablet-1024-hero.png`
- `desktop-metrics.json`, `mobile-metrics.json`, `perf.json`, `desktop-details.json`, `mobile-details.json`
- `current-og.png`

These files are local evidence for this audit. Commit selected before/after screenshots to a durable `docs/audits/` folder if the team wants a permanent record.
