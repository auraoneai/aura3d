# Marketing site update: sell Aura3D over three.js

Status: proposal, 2026-10-27, for `marketing/` (aura3d.auraone.ai) at Aura3D 4.3.5. Source of messaging: [`docs/comparisons/threejs-positioning.md`](../comparisons/threejs-positioning.md). New measurements behind the hero: `evidence/vs-threejs/tagline-check/` (runs 1 and 2).

## 1. Goal

The homepage should make one argument: with three.js you build the engine, with Aura3D you build the product. Every section either proves that argument or gets the visitor to a running project. Today the site splits its attention between selling Aura3D and listing where three.js wins; this update removes the second half and fixes the copy that would fail a developer's first check.

Audiences, in priority order:

1. Developers choosing a browser 3D stack who know three.js exists.
2. Teams using AI coding agents to build 3D scenes and games.
3. Game builders who want a HUD, input, audio and replay without assembling them.
4. Teams that must prove where every model came from (licensing, supply chain).

## 2. What the audit found on the current site

Fix all of these in the same change; several would break a visitor's trust on first contact. All of them are live: a fetch of https://aura3d.auraone.ai/ on 2026-10-27 returned the "18 lines" hero, the `check-deploy` console-error claim, the "Where each one wins" heading, the `orbitCamera` sample, "50 live experiences" and "2.0 migration".

| # | Where | Problem | Change |
|---|---|---|---|
| 1 | `marketing/index.html:493-500`, `:774` | Both homepage code samples use APIs that do not exist: `environment.studio`, `orbitCamera`, and `createAuraApp({ target, scene: [...] })`. The real signature is `createAuraApp(selector, { scene })` (`packages/engine/src/agent-api/app/createAuraApp.ts:53`) and the namespaces are `environments`, `camera`. Copying them fails to compile | Replace with the verified 10-line hero scene (section 4.1) and the verified typed-asset snippet (section 4.6) |
| 2 | `:108`, `:716-717` | Says `check-deploy` checks page load, failed requests and console errors. The command checks the build output against the asset manifest, hashes and licences only (`packages/aura3d-cli/src/index.ts:1097`) | Use the copy in section 4.7 until a browser pass is added to the command |
| 3 | `:296-456` | The comparison block is titled "Where each one wins", and four of its seven rows (agent turns, bundle, speed, maturity) sell three.js. The link reads "including where three.js wins" | Replace with "Why teams pick Aura3D over three.js" (section 4.3) |
| 4 | `:363-450` | The side-by-side code is the benchmark harness (`SceneHandle`, `autoStart: false`, `as never`), which makes the Aura3D side look noisy | Show the clean hero scene against the matched three.js app (section 4.2) |
| 5 | `:107`, `:801` | "18 lines" is the one-cube benchmark scene, where three.js is 15 lines | New hero (section 4.1); final CTA rewritten |
| 6 | `:867` | Footer link says "50 live experiences"; the showcase lists 25 games (`docs/workflows/game-inventory.json`) | "All {{GAME_COUNT}} games" |
| 7 | `:868` | Footer links a "2.0 migration" guide; current is 4.3.5 | Link `docs/migration/from-threejs.md` as "Migrate from three.js" |
| 8 | `:519`, `:689` | Internal language on a public page: "AuraVoice owns the voice", "de-interleaved 16-bit Meshy assets, boot-gated readiness" | Rewrite in user terms (sections 4.8, 4.9) |
| 9 | `<head>` keywords and description | "AI 3D generation", "prompt to 3D" describe an AI model; Aura3D is an engine and toolchain that agents write code against (`claims-and-boundaries.md` §2) | New meta in section 6 |
| 10 | `marketing/docs/aura3d-vs-threejs.html` | Leads with three.js wins and a "with the caveats" title | Rebuild as the "Why Aura3D" page (section 5) |
| 11 | `marketing/src/home.css` and markup | An eyebrow with a dot above every heading, one italic accent phrase in every `h2`, middle-dot meta strings, `→` appended to links, Semibold `h2`s, monospace step numbers. These are the template patterns `/Users/gurbakshchahal/fonts/README.md` ("Patterns to avoid") lists | Visual changes in section 7 |

## 3. Message architecture

**Positioning line:** "The TypeScript 3D engine that ships the whole stack."

**Supporting line:** "three.js gives you a renderer. Aura3D gives you the renderer, the lighting, the asset pipeline, the game kit and the deploy checks, typed end to end and built for AI coding agents."

Three pillars, each with its proof:

| Pillar | Promise | Proof on the page |
|---|---|---|
| Less code | A finished-looking scene in a few lines | Hero scene: 10 lines vs 38 in three.js (before orbit controls); PBR viewer benchmark 24 vs 49 lines, 1 import vs 8 |
| Assets you can trust | Every model typed, hashed and licensed; unverified assets don't draw in production | `aura.assets.json` + generated `src/aura-assets.ts`; production bridge rule |
| The game stack included | HUD, touch, audio, fixed-step loop, seeded replay, safety net, 120/144 Hz motion | Exports in `docs/api/root-exports.md`; {{GAME_COUNT}} playable games |

Cross-cutting: built for AI coding agents (`llms.txt`, 14 skills and recipes in every new project).

## 4. Homepage, section by section

Order: hero, trust strip, side-by-side code, why Aura3D over three.js, games, pillars (assets, game stack, agents), templates, packages, ship checks, release, final CTA, footer. Navigation: Games, Why Aura3D, Templates, Docs, plus GitHub, npm and the version chip. "Get started" stays the primary button.

### 4.1 Hero

- **Headline (h1):** "A lit 3D product in 10 lines of TypeScript."
- **Subhead:** "Aura3D is the TypeScript engine that ships the whole stack: lighting looks, typed and licensed assets, a game kit and deploy checks. The three.js version of the same scene is 38 lines before orbit controls."
- **Code block** beside the live demo, with a "10 lines" counter. This exact file built and rendered on stock `create-aura3d@4.3.5` (`tools/bench-vs-threejs/tagline/aura-variants/hero.ts`, `evidence/vs-threejs/tagline-check/run2/`):

```ts
import { camera, createAuraApp, interactions, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio"))
    .add(model(assets.product, { name: "product", targetHeight: 1.6, castShadow: true }))
    .add(interactions.orbit({ target: "product" }))
    .camera(camera.frameAsset(assets.product, { targetHeight: 1.6 })),
  ...looks.appOptions("product-studio")
});
```

- **Install line:** `npx create-aura3d@4.3.5 my-scene --template product-viewer` with Copy.
- **Buttons:** "Start building" (primary), "Play the games" (secondary). Drop the third "Read the docs" link from the hero; docs stay in the nav.
- **Under the buttons:** "No renderer setup, loader wiring or dispose loops." (keep, minus "plumbing").
- **Demo:** keep the poster-first Aura Slam player.

Small print under the code (one line, `--ink-3`): "Line counts include imports and skip blank and comment lines. The three.js version is in `tools/bench-vs-threejs/tagline/` in the Aura3D repo."

### 4.2 Side-by-side code

- **h2:** "The same product shot. A quarter of the code."
- **Body:** "Both scenes load the same GLB with HDR studio lighting, a shadow-casting key light, tone mapping and a framed camera. Aura3D adds orbit controls in the same 10 lines."
- **Panels:** left "three.js main.ts" showing `tools/bench-vs-threejs/tagline/three-minimal/main.ts`; right "Aura3D main.ts" showing the hero file. Each panel has its line count ("38 lines", "10 lines") as a separate chip.
- **Below:** "Also in our benchmark: a PBR viewer with HDR lighting, shadow, bloom and orbit controls in 24 lines instead of 49, with 1 import instead of 8." Link: "See the benchmark".

### 4.3 Why teams pick Aura3D over three.js (replaces the comparison table)

- **h2:** "Everything three.js leaves to you, built in."
- **Table**, two columns, "With Aura3D" and "With three.js", rows from `threejs-positioning.md`:

| Need | With Aura3D | With three.js |
|---|---|---|
| Studio lighting and shadows | One `looks.preset()` call: HDRI, key light, shadows, grade | PMREM, lights, shadow flags and tone mapping by hand |
| Bloom, AO, custom post pass | `effects.bloom()`, `effects.shaderPass()` | `EffectComposer` plus 3 to 4 addon passes |
| Loading a model | `model(assets.robot)`: typed key, compile-time check | `GLTFLoader` and a string path |
| Asset licensing | Source, licence, author and sha256 recorded per model | Not tracked |
| Production safety | Unverified models don't draw | Any URL loads |
| Game shell | HUD, touch, juice, session, audio cue bank | Not included |
| Replay and QA | Fixed-step loop, seeded RNG, QA hooks | Write your own |
| 120 and 144 Hz displays | Render interpolation built in | Write your own |
| Blank-screen recovery | Safety net with black-frame self-heal | Not included |
| AI coding agents | `llms.txt`, 14 skills, recipes in every new project | No official agent docs |

- **Link:** "Why Aura3D over three.js" to the rebuilt comparison page.

### 4.4 Games

- **h2:** "{{GAME_COUNT}} games built on Aura3D. Play four right here."
- **Body:** "Every one is a real Aura3D route, not a video. Nothing loads until you press Play."
- Keep the four featured cards and their "Technical proof" lines; they are specific and good. Keep the "Also playable" list and "See all {{GAME_COUNT}} games".

### 4.5 Pillar: assets you can trust

- **h2:** "Every model typed, hashed and licensed."
- **Body:** "Add a GLB or pull a CC0 model by name. The CLI records its source, licence, author and sha256, then generates a typed key, so a missing asset is a compile error instead of a blank screen. In production, a model without a valid hash doesn't draw."
- **Code pair:** the existing "Add an asset" CLI block (`assets add ./model.glb --name robot`) and the fixed typed-refs block (section 4.6).
- **Bullets:** "Search open sources: `aura3d assets search \"robot\"`", "Generate with Meshy when nothing fits", "Optimize, inspect and thumbnail from the same CLI".

### 4.6 Typed refs snippet (replaces `:770-776`)

```ts
import { createAuraApp, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio")).add(model(assets.robot)),
  ...looks.appOptions("product-studio")
});
```

This is the `llms.txt` and `README.md` hello world (verified building and rendering in `tagline-check` run 1 with `assets.product`).

### 4.7 Ship checks (replaces "Verification & deploy")

- **h2:** "Check every asset before you ship."
- **Body:** "`aura3d check-deploy` fails the build when a hashed asset is missing, a stray file sneaks into `dist`, or a model fails validation. Add `--release` for licence and quality gates."
- **Checklist:**
  - "Typed imports resolve against the public API."
  - "Every shipped asset carries a hash and a typed reference."
  - "Unreferenced files in `dist` fail the check."
  - "`--release` adds licence and quality gates."
  - "Every template ships route-health and screenshot tests."
- **Steps** (a real sequence, so numbering stays, set in the body face): Add asset, Compose, Verify, Check deploy, with today's descriptions.
- Keep the browser support table.

When the CLI gains a browser pass that fails on 4xx/5xx responses and console errors, restore the old "flags failed requests" and "reports console errors" bullets.

### 4.8 Pillar: the game stack and agents

- **h2:** "Built for games, written by agents."
- **Two columns:**
  - "Game kit": "HUD, touch controls, juice and session flow. An audio cue bank and step sequencer. A fixed-step loop, seeded replay and QA hooks. Smooth motion on 120 and 144 Hz displays."
  - "Agent-ready": "Every new project ships `llms.txt`, 14 Aura3D skills and compiled recipes for Claude, Cursor and Codex. Typed APIs and loud errors keep agent-written code on the rails."
- **Animation Studio** moves into this section as a third column: "Describe a scene, get a deterministic animated short. Your coding agent directs it through a validated CLI; no bundled model or API key." Drop the AuraVoice line.

### 4.9 Templates, packages, release

- **Templates h2:** "Start from a working project." Body: "{{TEMPLATE_COUNT}} templates, from product viewers and cinematic scenes to mini-games, racing, fighting and character control. Each one is a normal Vite app you own, with tests." (The token must stay; `check-site.mjs` enforces it.) Keep the six prompts.
- **Packages h2:** "Eight packages you'll actually import." Keep the list. Change the `@aura3d/physics-rapier` line to "Rapier bodies, colliders, characters and vehicles" (drop "Deterministic"; no evidence row backs it).
- **Release h2:** "What's new in 4.3.5". Rewrite the bullets in user terms:
  - "All {{GAME_COUNT}} games are back, with lighter assets and a readiness gate before first play."
  - "Rigged characters pass skeletal checks; arm and torso skinning tears are fixed."
  - "Scene remounts no longer crash the GPU, and focused buttons no longer swallow game keys."

### 4.10 Final CTA

- **h2:** "Build the product, not the engine."
- **Body:** "Scaffold a template, add a typed asset and ship a route you can check. Your agent writes the code; Aura3D supplies the stack."
- Install line, then "Start building" and "Play the games".

### 4.11 Footer

- Fix "50 live experiences" to "All {{GAME_COUNT}} games" and "2.0 migration" to "Migrate from three.js".
- Bottom line: "TypeScript, WebGL2, 24 packages" without middle dots, or drop it (the trust strip already says this).

## 5. Comparison page (`marketing/docs/aura3d-vs-threejs.html`)

Rename the page "Why Aura3D over three.js". Structure:

1. **Hero:** "Everything three.js leaves to you, built in." Lede: the pitch paragraph from `threejs-positioning.md`.
2. **Stat row** (DIN Pro numerals): "24 vs 49 scene lines (PBR viewer)", "1 import vs 8", "10 lines for a lit, framed, orbitable product (38 in three.js before orbit)", "{{GAME_COUNT}} playable games".
3. **The full "Where Aura3D wins" table** from `threejs-positioning.md`, every row with its source in a muted column.
4. **The moat**, four short blocks: trusted assets, agent-native engine, the whole game stack, quality gates.
5. **Migrating from three.js:** `aura3d migrate three` maps 245 constructs and writes a port worklist; link to `docs/migration/from-threejs.md`.
6. **How we measured:** one paragraph linking `evidence/vs-threejs/` and the benchmark method, so any developer can rerun it.

## 6. Meta, social and OG

- `<title>`: "Aura3D: the TypeScript 3D engine that ships the whole stack"
- `description` and `og:description`: "Typed lighting looks, licensed and hashed GLB assets, a game kit and deploy checks in one TypeScript 3D engine for the browser. Built for AI coding agents."
- `keywords`: drop "AI 3D generation" and "prompt to 3D"; add "three.js alternative", "TypeScript game engine", "typed glTF assets", "AI coding agent 3D".
- JSON-LD `description`: same as the meta description.
- OG image (`marketing/scripts/generate-og.mjs:277`): replace "Ship a 3D scene in 18 lines of TypeScript" with "A lit 3D product in 10 lines of TypeScript." and update `og:image:alt` to "Aura3D: a 10-line TypeScript scene beside a live 3D tennis game". Regenerate both PNGs (1200x630, under 300 KB, both enforced by `check-site.mjs`).

## 7. Visual design changes

Keep the existing brand: Graphik Web for text, DIN Pro for stat numerals, TT Commons Pro Mono for code, the paper background `--bg #fbfbf8`, ink scale, deep-teal accent `--accent #0e6b7c`, dark `--stage` behind demos. These follow the marketing preset in `/Users/gurbakshchahal/fonts/README.md` (Graphik for marketing, 16px body, 1.5 leading). The changes remove template tells and tighten hierarchy.

### 7.1 Type and weight

| Element | Today (`marketing/src/home.css`) | Change |
|---|---|---|
| `h1` | Graphik 600, `clamp(44px, 5vw, 64px)`, `-0.03em` | Keep 600 or move to Graphik Bold 700 (allowed for one display-size hero headline). Cap at 56px: the new headline is longer. Tracking `-0.02em` |
| `h2` | 600, `clamp(30px, 3.2vw, 40px)` | Medium 500, `clamp(28px, 3vw, 36px)`. Only the `h1` carries 600 or more |
| `.home-h2 em` | Italic accent phrase in every `h2` | Remove the `<em>` from all `h2`s; write each heading as one plain sentence |
| Card and package titles | 600 | 500 |
| `.home-start` badge | 700 at 11px | 500 |
| Body | 16px, 1.5 | Keep; cap prose at 72ch |
| Stats (trust strip, comparison stat row) | Mixed | DIN Pro 500 with `font-variant-numeric: tabular-nums`; labels in Graphik 400 |
| `html` | | Add `font-synthesis: none` if missing |

### 7.2 Patterns to remove

- **Eyebrows.** Delete the `.home-eyebrow` label and its dot above every section. Keep one optional eyebrow, on the hero only, as real small caps (`font-variant-caps: all-small-caps`), reading "TypeScript 3D engine, version 4.3.5".
- **Middle-dot meta strings.** "TypeScript · 24 packages", "Typed GLB · PBR", the footer line. Use separate chips or plain sentences.
- **Arrows in link text.** "Read the docs →", "Template →", "Explore the public API →". Drop the arrow glyphs; links are identified by colour and underline on hover.
- **Monospace for decoration.** `.step-num` (01 to 04) moves to Graphik 500 in `--ink-3`. Mono stays for code, commands, package names, versions and file names.
- **Uniform rounded cards.** Template and package grids switch to hairline-divided rows (`--line`) with no shadow; keep rounded containers only for the code panels and the demo stage.

### 7.3 The code panels

The side-by-side comparison is the most persuasive element on the page, so it gets the most care:

- Two panels of equal height on desktop; the three.js panel scrolls inside a fixed height so the length difference reads at a glance. A line-count chip sits top right of each panel ("38 lines", "10 lines") in DIN Pro.
- Aura3D panel on the right with a 2px `--accent` top rule; three.js panel neutral.
- On mobile, stack Aura3D first, three.js collapsed behind "Show the three.js version".
- Syntax colours stay as today; code text 13px TT Commons Pro Mono, 1.55 leading.

### 7.4 Layout rhythm

- Section padding `--section-y` 88px to 72px; heading-to-body gap 12px; 8px rhythm throughout.
- Alternate `--bg` and `--bg-1` bands for sections 4.3 and 4.5 to separate the argument sections from the proof sections.
- Hero grid: copy and code left (5 columns), demo right (7 columns) at 1320px; demo first on mobile, then headline, code and install line.

## 8. Implementation checklist

Files: `marketing/index.html`, `marketing/src/home.css`, `marketing/src/styles.css` (tokens only if needed), `marketing/docs/aura3d-vs-threejs.html`, `marketing/scripts/generate-og.mjs`, `store-assets/brand/social/*`.

- [ ] Replace the two invalid code samples with the verified snippets (sections 4.1 and 4.6).
- [ ] Rewrite hero, comparison, ship checks, release, final CTA and footer copy as above.
- [ ] Remove every `<em>` accent from `h2`, all `.home-eyebrow` labels except the hero's, middle dots and arrow glyphs.
- [ ] Apply the weight and size changes in section 7.1.
- [ ] Keep the build-time tokens `{{GAME_COUNT}}`, `{{TEMPLATE_COUNT}}`, `{{PACKAGE_COUNT}}` and the `trust-item` markup that `check-site.mjs` parses; do not hand-type counts.
- [ ] Rebuild the comparison page (section 5) and update meta and OG (section 6).
- [ ] `pnpm --dir marketing build` (runs `check-version`, `check-site`, the SEO check, the budget check and the asset URL check).
- [ ] Screenshot the homepage and comparison page at 1440x900 and 390x844 on the remote runner (`tools/remote-acr/run.sh`) and check the hero code, panels and stat row read at both sizes.

## 9. Engineering follow-ups that unlock stronger copy

| Change | Copy it unlocks |
|---|---|
| A browser pass in `check-deploy` (load each route, fail on 4xx/5xx and console errors) | "check-deploy catches broken requests and console errors before you ship" |
| Make the `product-studio` look show its `#2b2f36` backdrop above the horizon (every Aura3D variant in `tagline-check/run2` shows a light backdrop instead) | A darker, more premium hero frame without the extra floor line |
| A full-game line-count comparison (HUD, audio, touch, replay) against three.js plus the usual libraries | "A whole game in a fraction of the code" |
| A cold-start agent trial on a full-game task at 4.3.5 | An agent-speed headline for games |
| Real-GPU captures of the 25 games (`REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all`) | Performance and screenshot proof on real devices |

## 10. Refresh `README.md` and the docs so they sell Aura3D over three.js

The site is not the only place developers meet Aura3D. `README.md` is also the GitHub landing page and, through `packages/engine/README.md`, the npm page for `@aura3d/engine`. Today both carry a "Compared with three.js" section that spends most of its words on three.js wins (bundle, first frame, frame cost, stock build) and calls Aura3D "a three.js-compatible renderer lineage". Every public-facing doc should carry the same message as the site: one engine and one toolchain that ship the whole stack three.js leaves to you.

### 10.1 Which docs change

| Tier | Files | Change |
|---|---|---|
| 1. Front doors | `README.md`, `packages/engine/README.md` (npm page), `packages/create-aura3d/README.md` (npm page), `packages/aura3d-cli/README.md` (npm page), `docs/index.md`, `llms.txt` and `marketing/public/llms.txt` | Rewrite the intro and the three.js section (10.2); fix stale versions (section 11) |
| 2. The comparison | `docs/aura3d-vs-threejs.md` | Rebuild to match `docs/comparisons/threejs-positioning.md` and the new comparison page (section 5): title "Why Aura3D over three.js", the "Where Aura3D wins" table, the moat, migrating, how we measured |
| 3. Choosing and porting | `docs/migration/from-threejs.md`, `docs/comparisons/*.md` (Babylon.js, Threlte, TresJS, Troika, Theatre.js, Unity/Unreal web) | Open each with a short "What you get with Aura3D" block (typed assets, looks, game kit, agent docs) before the port steps or the comparison; restamp the comparison pages from `Version: 4.0.0` |
| 4. Feature guides | `docs/concepts/*.md`, `docs/guides/build-a-browser-game.md`, `docs/templates/create-aura3d-templates.md`, `docs/api/game-kit.md`, `qa-kit.md`, `safety-net.md`, `audio-synth.md`, `motion-presenter.md`, `model-loader.md`, `cli-asset-tools.md` | Add a two- to four-line "Instead of three.js" note under each title saying what the page replaces, for example game kit: "three.js has no HUD, touch, session or game-sound layer; this is it, in one import." |
| 5. Agent docs | `docs/agents/*.md` | Keep the rules and claim labels unchanged (they keep agent-written copy accurate). Only `agent-quickstart.md` gains a three-line "Why Aura3D" opener; the "three.js habit to Aura3D" tables stay |
| Leave alone | `docs/project/`, `docs/architecture/`, `docs/workflows/`, `docs/rendering/`, `docs/audit/`, `docs/prd*/`, `docs/archive/` | Engineering records, ADRs, parity registers and audits; not marketing surfaces |

### 10.2 The replacement three.js section for `README.md` and `packages/engine/README.md`

```md
## Why Aura3D instead of three.js

three.js gives you a renderer. Aura3D is a complete TypeScript 3D engine and toolchain with its own renderer, so the parts three.js leaves to you come built in:

- **A lit, shadowed, framed product in 10 lines.** The same scene in three.js is 38 lines before orbit controls ([tagline check](./evidence/vs-threejs/tagline-check/)). In our five-scene benchmark, a PBR viewer with HDR lighting, shadow, bloom and orbit controls is 24 lines instead of 49, with 1 import instead of 8 ([results](./evidence/vs-threejs/RESULTS.md)).
- **Assets you can trust.** Every model is typed, hashed and licensed; in production an unverified model doesn't draw.
- **The game stack included.** HUD, touch controls, audio cues, a fixed-step loop, seeded replay, a safety net and smooth motion on 120 and 144 Hz displays.
- **Built for AI coding agents.** `llms.txt`, 14 skills and compiled recipes ship with every new project.

Porting an existing three.js project: [`docs/migration/from-threejs.md`](./docs/migration/from-threejs.md).
```

Use the same block in `packages/engine/README.md` with absolute GitHub links (npm does not resolve relative links).

### 10.3 The opener for `docs/index.md`

Replace item 3 ("Coming from three.js") with: "**Coming from three.js:** [Why Aura3D over three.js](./aura3d-vs-threejs.md), then [porting guide](./migration/from-threejs.md). `aura3d migrate three` maps 245 three.js constructs and writes your port worklist." Remove the link to `migration/4.0-to-4.1.md` (section 11).

## 11. Remove stale versions and dead code from the live site and docs

Audit method: every URL in the live sitemap (45 pages) plus `/llms.txt` and `/llms-full.txt` was fetched on 2026-10-27 and scanned for versions other than 4.3.5, `-v2` names, non-existent or deprecated APIs and the claims in section 2. Scanner and raw report: `/tmp/live-audit/scan.mjs`, `/tmp/live-audit/report.txt` (rerun before shipping; commit the script under `tools/site/` if it should become a check).

### 11.1 Live pages

| Live URL | Stale content | Source file | Change |
|---|---|---|---|
| `/` | 4.1.2 and 4.1.3 bench rows; the `orbitCamera` / `environment.studio` / `createAuraApp({ target, scene: [] })` samples; "50 live experiences"; "2.0 migration" link | `marketing/index.html` | Sections 2 and 4 |
| `/docs/aura3d-vs-threejs.html` | Every row is stamped 4.1.2, 4.1.3 or "4.2.0 candidate" | `marketing/docs/aura3d-vs-threejs.html` | Rebuild (section 5), current numbers only |
| `/docs/api.html` | "with all < 4.0.0 versions and the 5 legacy compatibility packages deprecated" | `marketing/docs/api.html:122` | Cut the clause: "24 public npm packages at 4.3.5" |
| `/docs/aura-clash-showcase.html` | "The 4.0.0 evidence covers gameplay, audio, performance…" | `marketing/docs/aura-clash-showcase.html:163` | "The release evidence covers…" |
| `/docs/aura-clash.html` (live, not in the sitemap) | "retained 4.0.0 TypeScript game-runtime/deployment evidence" | `marketing/docs/aura-clash.html:118` | Same fix; add it to the sitemap or remove the page |
| `/apps/showcase-roadster-rush-v2/` | Title "(V2)", HUD "AURA3D 4.0" | `apps/showcase-roadster-rush-v2/index.html` | Retire the variant (11.2) |
| `/apps/showcase-heatsink-v2/` | Title "(V2)" | `apps/showcase-heatsink-v2/index.html` | Retire the variant (11.2) |
| `/apps/showcase-teleoperator-v2/` | Title "(V2, Aura3D 4.0.2)" | `apps/showcase-teleoperator-v2/index.html` | Retire the variant (11.2) |
| `/llms.txt` | "Known issue: a stock vite build of 4.1.2 fails…; use 4.1.3 or later"; teaches the deprecated `scatterAlongPath`, `scatterInArea`, `mergeStatic` | `llms.txt`, `marketing/public/llms.txt` | Delete the known-issue sentence and the scatter bullet |
| `/llms-full.txt` | The three V2 game links (one says "Aura3D 4.0.2"); "4.1 adds the game kit…"; "Aura3D 4.1 kits"; teaches the deprecated `createAnimationController` and scatter/merge names | `marketing/public/llms-full.txt` (and its generator) | Drop the V2 links; "Kits (build the shell from these)"; `AnimationController` only; remove deprecated names |

### 11.2 Retire the three V2 game variants

`docs/workflows/game-inventory.json` lists `roadster-rush-v2`, `heatsink-v2` and `teleoperator-v2` as live "variant" builds of Apex Overdrive, Thermal Drift and Grid Dispatch, and the sitemap publishes them next to their parents. They are older builds under version-numbered names (against the naming rule in `claims-and-boundaries.md` §2). A fourth folder, `apps/showcase-top-tennis-v2/`, also carries a V2 title.

1. Remove the `variants` entries from `game-inventory.json` and regenerate (`tools/site/gen-game-inventory.mjs`, `gen-showcase-index.mjs`).
2. Remove the three URLs from `marketing/sitemap.xml` and `llms-full.txt`.
3. Redirect `/apps/showcase-*-v2/` to the parent game in `marketing/vercel.json` (308), so old links still land on a current game.
4. Delete or archive the four `apps/showcase-*-v2/` folders once the redirects are live. This deletes live routes, so it needs the owner's go-ahead.

### 11.3 Old versions in `README.md`, npm READMEs and `docs/`

| Where | Stale content | Change |
|---|---|---|
| `README.md:32`, `packages/engine/README.md:34` | "Known issue: a stock vite build of 4.1.2 fails…; the fix ships in 4.1.3" | Delete |
| `README.md:55`, `packages/engine/README.md:57` | "three.js 0.185.1 against Aura3D 4.1.2" comparison paragraph | Replace with 10.2 |
| `packages/create-aura3d/README.md:40`, `:43`, `:50`, `:67` (the create-aura3d npm page; confirmed in the published 4.3.5 readme) | "`@aura3d/engine@4.0.1` imports", "Complete 4.0.0 effects & looks", "Aura3D 4.0.0 scaffolds pin… @aura3d/engine@4.0.1", "4.0.0 studio lighting" | Restate for 4.3.5 without a version in the prose; the version belongs in `package.json` |
| 47 docs outside `docs/archive/` stamped `Version: 4.0.0` (34), `4.1.2` (6), `4.2.0` (1) or `2.0.x` (3) | Header stamps from older releases (12 in `docs/project/`, 6 in `docs/agents/`, 5 in `docs/concepts/`, the rest spread across `rendering`, `benchmarks`, `migration`, `examples`, `editor`, `assets`, `animation`, `physics`, `debug`, `controls`, `comparisons`, `workflows`) | Restamp each to 4.3.5 after checking its content still holds, or drop the stamp. List them with `rg -l "^Version: (4\.0\.0\|4\.1\.2\|4\.2\.0\|2\.0\.[0-9])" docs -g '*.md' -g '!docs/archive/**'` |
| `docs/whats-new-4.1.md`, `docs/migration-4.0.md`, `docs/migration/2.0.md`, `docs/migration/4.0-to-4.1.md`, `docs/migration/navigation-recast-2.0.md`, `docs/migration/physics-rapier-2.0.md`, `docs/architecture/2.0-removals.md` | Guides for releases users can no longer install (every version before 4.3.5 is deprecated on npm) | Move to `docs/archive/`; remove their links from `docs/index.md`, `README.md`, `docs/api/readme.md`, `docs/project/documentation-index.md`, `docs/project/migration.md` and `docs/migration/ecs-scripting-compatibility.md` |
| `docs/index.md:9` | Links `migration/4.0-to-4.1.md` for three.js users | Section 10.3 |

### 11.4 Keep it from coming back

- Add a check to `marketing/scripts/check-site.mjs` that fails the build on a version string other than the current release (outside code blocks that pin a dependency), on `-v2`/`(V2` in page titles, and on the deprecated root names in `docs/api/root-exports.md`.
- Run the live scan after each deploy and attach the report to the release notes.

## 12. Order of work

1. Site copy and code fixes (sections 2 to 6) plus the live stale fixes in 11.1.
2. Front-door docs (10.1 tier 1) and the npm READMEs, then publish so the npm pages refresh.
3. Comparison doc and per-guide openers (tiers 2 to 4).
4. Version restamps and archive moves (11.3).
5. V2 variant retirement (11.2): redirects first, folder deletion after the owner signs off.
6. The new site check (11.4).
