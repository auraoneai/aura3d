# PRD 07 — Autonomous Decisions, Agent Review and Build Record
Status: **LIVING RECORD for the 2026-10-29 build (prototype; not released)** · Owner: build agent (owner instruction 2026-10-29) · Links: [index](README.md), [execution prompt](MASTER-PROMPT.md), [product and safety](01-product-learning-and-safety.md), [content bible](02-character-and-content-bible.md), [architecture](03-aura3d-architecture-and-contracts.md), [backlog](04-implementation-backlog-by-filename.md), [episodes](05-episodes-games-and-curriculum.md), [QA](06-qa-release-and-execution.md)

This file records four things:
1. what the owner decided;
2. what the build changed in `01`-`06` after checking them against Aura3D 4.5.0;
3. which agent reviews replaced the human sign-offs the PRD names;
4. what was built and verified, and what remains open.

Every entry names its source, so the next reader can check it.

**What agent review means here.** A software agent checked the work against the rules written in `01`-`06` and `MASTER-PROMPT.md`. That is not a clinical (SLP), legal, privacy-counsel, trademark or assistive-technology-user review. It relaxes no safety rule and supports no educational, therapeutic or "ready for children" claim.

**How to read the evidence paths.** Paths are repo-relative at the branch commit. API facts were checked in two places:
- the published 4.5.0 typings in `apps/veer-wonder-world/node_modules/@aura3d/*/dist` (a local, gitignored install used for the consumer typecheck);
- the matching source under `packages/`, which this file cites so the path survives a fresh checkout.

## 1. Decision log

### 1.1 Owner decisions (2026-10-29)
| # | Decision | Why | Source / where applied |
| --- | --- | --- | --- |
| O1 | Build everything now: 6 characters, 20 episodes, 12 activities, 6 worlds, all media, all tests and every doc update. P1 and P2 are in scope; P3 (microphone and voice input, `04` K01-K06) stays out of scope and off | Owner instruction | `MASTER-PROMPT.md` §0.1. Applied in README phases, `04` header and §L, `05` header and §0, `06` §2 and §9 |
| O2 | No human sign-off. The SLP, caregiver, creative, rights and legal reviews are agent reviews recorded in section 2. Story manifests carry `review: { language: "approved", rights: "approved", reviewer, date }` | Owner instruction | `MASTER-PROMPT.md` §0.2; `apps/veer-wonder-world/src/types.ts:167`; section 2 below |
| O3 | Every safety rule still applies in full. Agent review replaces only the sign-off step | Owner instruction | `MASTER-PROMPT.md` §0.3 and §6. This edit pass deleted no rule from `01`-`06`; where a rule names a human review needed before a public claim or launch, it stays open (section 4.3) |
| O4 | Generation spend is authorised: Meshy (no cap; every job in the ledger) and the pooled ElevenLabs keys, both through Kiro Prism | Owner instruction; Meshy spend was already uncapped (owner decision 2026-10-25) | `MASTER-PROMPT.md` §0.4; `CHANGELOG.md` 4.3.0 entry "Meshy spend is uncapped"; `apps/veer-wonder-world/tools/meshy-pipeline.mjs` (`aura3d meshy ledger reserve/settle --game wonder-world`) |
| O5 | No public release in this run. The route stays `prototype` with `noindex`, out of the site catalog, sitemap and showcase index. Publishing a children's app is a separate owner decision | Owner instruction | `MASTER-PROMPT.md` §0.5; README phases paragraph; B5 below; section 4.3 |
| O6 | Deploy an unlisted preview so the owner can see the app live, at the Vercel project's own production domain. Every response carries noindex, and nothing links to the address; this public repository does not write it down either. This is not a public release, and O5 still holds | Owner instruction after PR #1398 merged, 2026-10-29 | `apps/veer-wonder-world/DEPLOYMENT.md` status and §3; B35 below; section 4.1 "Preview deploy" |
| O7 | Serve the preview also at a custom domain on `auraone.ai` whose host name is the child's name, next to the project address. The domain is a DNS-only CNAME in the Cloudflare zone `auraone.ai`, pointing at Vercel, and is added to the project. This host name carries the child's name, which the neutral-name rule of DEPLOYMENT.md §3 kept out of every address; the owner chose it knowing that the TLS certificate puts the name into public certificate-transparency logs. The build, the logs and the evidence carry no name beyond O8's welcome (`tools/check-dist.mjs`, the build spec), the repository does not write the address, and noindex stays | Owner instruction, 2026-10-29 | `apps/veer-wonder-world/DEPLOYMENT.md` §3; section 4.1 "Preview deploy" |
| O8 | The start screen greets the child by name: "Welcome to" over "<name>'s Wonder World", in a more dramatic welcome (a sky with a sun glow, a rainbow and clouds, the six characters' portraits, and a big gradient title). The name lives in one constant, `WELCOME_NAME` in `apps/veer-wonder-world/src/personal.ts`. The UI string keeps a `{name}` placeholder, so every line, caption, string, key, route, title and the static splash stay generic, and `WELCOME_NAME = null` gives "Welcome to Wonder World". The guards now allow that constant in the sources (`no-child-data.test.ts`) and one string literal in the build (`tools/check-dist.mjs`, `tests/browser/wonder-world-build.spec.ts`), and fail any other occurrence. Captures of the start screen show the name, so the evidence keeps none of them. This reverses O3's no-name rule for this one line; a public release removes it (section 4.3 item 2) | Owner instruction, 2026-10-29 ("Welcome to <name>'s Wonder World in the page") | `apps/veer-wonder-world/src/personal.ts`, `src/ui/start-screen.ts`, `src/ui/styles.css`; the five PRD boxes that promise no name in the build carry this exception |

### 1.2 Doc corrections (`MASTER-PROMPT.md` §3), each checked against 4.5.0
| # | Correction | What was checked (evidence) | Applied in |
| --- | --- | --- | --- |
| C1 | Version: pin 4.5.0 (npm `latest`); the stock Vite build fix shipped in 4.1.3; `workspace:*` inside the monorepo | npm dist-tag `latest` is `4.5.0`, published 2026-10-29T02:29:29Z (`npm view @aura3d/engine time`); `CHANGELOG.md:7` `## 4.5.0 (2026-10-28)`; `CHANGELOG.md:240` (4.1.3: `"readFileSync" is not exported by "__vite-browser-external"` fixed); `apps/veer-wonder-world/package.json` (`workspace:*`); every `@aura3d/*` package in the published install reports 4.5.0 | README "What exists" and P0 list; `03` §1 and §10; `04` A01 and F0.2; `06` §4 version guard |
| C2 | Build commands: `apps/*` is not a workspace member; `check-deploy` from `@aura3d/cli` 4.5.0, `--browser` on the remote runner only; `EXTRA_DIRS` staging; real-GPU scenario | `pnpm-workspace.yaml:1-3` lists only `packages/*` and `workers/*`. `aura3d check-deploy --dist dist --browser [--route /path ...]` is in the 4.5.0 CLI help (`packages/aura3d-cli/src/cli-help.ts:70`; published `@aura3d/cli` `dist/cli-help.js:67`; `docs/api/cli-asset-tools.md:95`). `--browser` loads the build in headless Playwright (`CHANGELOG.md:41`), so policy keeps it remote. `tools/remote-acr/run.sh:37,129` documents and copies `EXTRA_DIRS`. `tools/real-gpu/scenarios.json` entries are `{ path, settleMs, steps }`. `tools/real-gpu/README.md` says agents must not run it on the Mac | README "What exists"; `04` A01; `06` §4 steps 2, 7, 8 and 10 |
| C3 | Rendering: no vignette; HDRI or `environments.*` in every world; `quality: "auto"` and `renderPath`; runtime particles off with mesh bubbles; `await warmPrograms(app)`; the file is `looks.ts` | `packages/rendering/src/webgl2/LegacyPost.ts:2974-2987`: `linearVignetteEnabled()` is opt-in and "the 4.2.0 display-space vignette in the LDR tail is the default again". `CHANGELOG.md:84` (4.3.2). `CHANGELOG.md:33`: authored lights only, with no implicit environment. `CHANGELOG.md:32`: ten presets bring an HDRI; five carry a neutral fill, dropped under `lights.ambient`. `CHANGELOG.md:11`: `quality: "auto"`. `packages/engine/src/agent-api/nodes/types.ts:2516`: `renderPath { path: "direct" \| "hdr-msaa", quality, reason }`. `packages/engine/src/contracts/effects.ts:22` and `CHANGELOG.md:59` (4.3.5): `app.effects.runtime`. `packages/game/src/index.ts:68`: `warmPrograms` | `02` §4; `04` A10 |
| C4 | Audio: one shared `AudioContextManager`; `createGame` and `createCueBank` both receive it; narration is an app-owned player; `GameAudio` cues are not used for voice | `packages/audio/src/AudioContextManager.ts:28` is a plain class. `packages/game/src/createGame.ts:196` passes `browserContext: true` before spreading `options.sound`. `packages/engine/src/game/GameAudio.ts:269-272`: `browserContext` makes a new manager, and combining it with `createContext` throws. `packages/audio/src/synth/SynthCueBank.ts:7`: the default is a new manager. `packages/audio/src/game-sound/Voice.ts:152,157`: default gain jitter ±1.5 dB and pitch jitter ±0.6 semitone; `GameAudio` sets no override. `cue()` resolves once playback starts and reports no end. This build creates no cue bank: sound effects play through the app mixer on the same shared manager (B23) | `03` §1 and §4; `04` B05 and B06 |
| C5 | API table: session states, touch, `TypedGLBActor`, `AnimationController`, `@aura3d/debug`, QA kit | `packages/engine/src/contracts/game.ts:9`: `GameSessionState` matches `03` §3. `packages/engine/src/contracts/game.ts:18`: `TouchPreset` lists `twin-stick`, `dpad-2btn`, `dpad-4btn`, `steer-pedals`, `aim-drag`, `flight`, `lane-swipe` and `flippers`; none means "tap a big object". `packages/engine/src/public/index.ts:22`: `TypedGLBActor` is type-only. `packages/engine/src/public/index.ts:15,21`: `AnimationController`, `cloneSkinned`, `raycast`, `defineModelAssets` and `attachRootRenderSource` are root values (`docs/api/skinned-actors.md`). `packages/debug/src/index.ts:58,61`: `installBlackFrameGuard`, `installSafetyNet`. `packages/engine/src/public/index.ts:18`: `createFixedStepLoop`, `installQaHooks`, `readQaParams` and `createCountedRng` are root exports | `03` §1 and §6 |
| C6 | Rigs and mouths: Meshy rigging is humanoid only. It was evaluated on Lulu and rejected, so every character, animal and prop moves procedurally. The models have no mouth morphs; talking is a squash/bob pulse, never lip sync | `apps/veer-wonder-world/tools/wonder-assets.json` has `rig: false` for all 59 keys. Its `rigNote` on `momo` and `lulu` records the rejection: `validate --skin` fails in every clip (895-1465 of 12,356 triangles past 1.6x, worst 8.5-11.2x), and after `tools/bake-armature-scale.mjs` and `repair-skin --refit-skeleton` 297 triangles still stretch, worst 142.9x. `provenance/models/lulu.json` keeps the rig task id and ten animation task ids, yet records `rigged: false`, `clips: []` and zero joints. `src/aura-assets.ts` `MODEL_INFO` has `rigged: false` and `clips: []` for every key; see also `tools/model-review.json` (`lulu`). The unused rig path stays in `tools/meshy-pipeline.mjs` (`RIG_ACTIONS` for `momo` and `lulu`) and `tools/admit-models.mjs` (`merge-clips`, `validate --skin`) | README product definition; `02` §1, §2, §4 and §6; `03` §1, §4, §5, §9 and §10; `04` B05, B07 and D01-D07; `06` §4 step 6 and QA-A05 |
| C7 | Rename Pip to Peeko everywhere | `tools/site/games.catalog.json:65` and `docs/workflows/game-inventory.json:108`: "Pip's Big Leap" is a live game whose hero is Pip | README decision 1; `02` cast table, world map and allocation table; `03` §2; `04` D04 (`peeko.ts`); `05` E02, E03, E14 and E18 |
| C8 | Scope and gates follow the owner decisions; no safety rule deleted | The owner decisions in 1.1 | README phases and P0 list; `06` §2 Status column (G8 = agent review, owner instruction); `04` §L; `05` §0; `06` §8 and §9 |
| C9 | Media sources: Meshy text-to-3D and ElevenLabs, both through Kiro Prism; a rights record per file; free-tier output is prototype-only and is re-rendered on a paid tier before any commercial release | `apps/veer-wonder-world/tools/meshy-pipeline.mjs` (Prism Meshy base URLs). `apps/veer-wonder-world/tools/gen-audio.ts`: Prism ElevenLabs text-to-speech, music and sound-generation, with provenance fields `provider`, `endpoint`, `voice`, `prismKey`, `tier`, `prompt` and `date` | `02` §5 and §6; `04` A09, D15 and D16; README P0 list |
| C10 | Required reading and helpers; the `episode-builder` template in F0.1 | The files exist: `docs/agents/new-game-checklist.md`, `docs/agents/lessons-learned.md`, `docs/api/auravoice-bridge.md`, `docs/agents/effects-and-scene-kits.md` and `tools/game-checks/run.mjs`. `packages/game/src/index.ts:68,78` exports `warmPrograms`, `createFixedStepPresenter` and `runMotionGate`. `packages/create-aura3d/templates/episode-builder/README.md` labels the template example/experimental | README engineering start prompt; `06` §4 step 1 and §11; `04` F0.1 |
| C11 | The P3 voice doc becomes `08-optional-voice-validation.md` | `07` is this record | `04` K05; README index |
| C12 | `docs/agents/troubleshooting.md` line 79: the 4.3.0 vignette fix is opt-in, and the default vignette still darkens | `LegacyPost.ts:2974-2987`; `CHANGELOG.md:84` | `docs/agents/troubleshooting.md:79` |

### 1.3 Build decisions
| # | Decision | Why | Source / evidence |
| --- | --- | --- | --- |
| B1 | Admitted models live in `apps/veer-wonder-world/src/assets/models/<key>.<sha8>.glb`, with provenance in `apps/veer-wonder-world/provenance/models/<key>.json`. URLs are module-relative (`new URL("./assets/models/...", import.meta.url).pathname`). This replaces the `public/aura-assets/**` paths in `04` A09 and D16; `MASTER-PROMPT.md` §4 and §5 already use `src/assets/models/` | It is the documented `defineModelAssets` pattern (`docs/api/model-loader.md:12`, `docs/agents/asset-workflow.md:164`). The repo dev server maps `/aura-assets/` only to the root `public/` tree and the template trees (`tests/browser/example-dev-server.ts:378-383`). The Vite build fingerprints module-relative assets. The remote runner copies the app folder through `EXTRA_DIRS`, while its default slim profile leaves out the root `public/aura-assets` (`tools/remote-acr/run.sh:33,129`) | `apps/veer-wonder-world/tools/gen-aura-assets.mjs`, `apps/veer-wonder-world/tools/admit-models.mjs` |
| B2 | Audio lives in `apps/veer-wonder-world/src/assets/audio/{en/lines,songs,music,sfx}/*.mp3`, with provenance in `apps/veer-wonder-world/provenance/audio/{lines,songs,beds,sfx}.json`. The manifest is `src/audio-manifest.ts`, not `src/content/...`. This replaces `04` D15 and the `public/audio/**` and `src/content/audio-manifest.ts` paths in `MASTER-PROMPT.md` §5 wave 2 | Same reasons as B1 | `apps/veer-wonder-world/tools/gen-audio.ts` (header), `apps/veer-wonder-world/tools/gen-audio-manifest.mjs` |
| B3 | Generated, never hand-edited: `src/aura-assets.ts` (from `tools/gen-aura-assets.mjs`; exports `MODEL_KEYS`, `ModelKey`, `models`, `MODEL_INFO`, `modelRef`) and `src/audio-manifest.ts` (from `tools/gen-audio-manifest.mjs`; sha256 plus ffprobe duration). Generators: `tools/meshy-pipeline.mjs` (preview, refine, remesh, rig, animate; resumable), `tools/admit-models.mjs` (merge-clips, optimize, inspect, `validate --skin`, admit, provenance), `tools/gen-audio.ts` (ElevenLabs through Prism; resumable). The rig, animate and merge-clips steps are unused, because no model is rigged (C6). The 59-model list is `tools/wonder-assets.json`. All paths are app-relative | Reproducible media with checked hashes. Regenerating and running `git diff --exit-code` proves nobody hand-edited the generated files (`MASTER-PROMPT.md` §8) | The files above |
| B4 | Voices are ElevenLabs premade voices through Kiro Prism (cast in section 3.1). Sheru barks only (SFX `woof` and, from B20, a bank of eight more barks) | Original voices with no cloning and no family voice; consistent across 32 stories | `apps/veer-wonder-world/tools/gen-audio.ts` (`VOICES`) |
| B5 | The app is not in the site build (`showcaseRoutes`, `marketing/scripts/build-showcase-routes.mjs:50`). It is also not in `tools/site/games.catalog.json`, `docs/workflows/game-inventory.json` (the source of the showcase index, `tools/site/gen-showcase-index.mjs:11-12`), the sitemap route manifest in `marketing/scripts/gen-seo.mjs` or `docs/workflows/game-names.md`. `apps/veer-wonder-world/index.html` carries `<meta name="robots" content="noindex">` | Owner decision O5 | On 2026-10-29 no site, catalog, inventory, sitemap or showcase file named the app. Outside `apps/veer-wonder-world/` and this folder, only the repo-root browser specs `tests/browser/wonder-world-*.spec.ts` named it. The `noindex` tag and the title "Wonder World (prototype)" were present in `index.html`; the parent re-checks both in section 4.1 |
| B6 | Reviewer string in every manifest: `"agent:claude-opus-5.5 (owner instruction 2026-10-29, no human sign-off)"` | Extends the §0.2 form `"agent (owner instruction 2026-10-29)"` with the reviewing model and the no-sign-off note, so each manifest says who reviewed it | `apps/veer-wonder-world/src/content/episodes/*.ts` and `src/content/activities/*.ts` (`review`; all 32 manifests carry this string on 2026-10-29) |
| B7 | Names: the public title is "Wonder World"; the chick id is `peeko` (`src/types.ts:9`). No child name appears in UI, routes, logs, default lines or evidence. The working name survives only in this PRD folder and the directory name | `MASTER-PROMPT.md` §6 privacy | README decision 2; `01` §8 |
| B8 | Motion. This run's fixed decisions named Momo and Lulu as Meshy-rigged bipeds with merged clips, and required a procedural fallback for any clip missing at runtime. Momo's clips were to be `idle`, `walk`, `run`, `wave`, `talk`, `happyJump`, `cheer`, `sway`, `mirror`, `pickUp`, `lookAround`, `sleep`, `drink`, `wakeUp`, `jazzHands` and `shrug`; Lulu's `idle`, `walk`, `run`, `dance`, `hop`, `cheer`, `wave`, `talk`, `sway`, `jazzHands`, `happyJump` and `funnyDance`. The rig was rejected (C6), so both GLBs carry no clips and the fallback is the motion of the whole cast, as `MASTER-PROMPT.md` §2 and §3.6 state. The clip names stay as candidates in the character files. "Talking" is a squash/bob pulse and is never called lip sync | `MASTER-PROMPT.md` §2 and §3.6 and the admitted models override the earlier clip plan. Keeping the candidates means a later rig that passes `validate --skin` needs no code change. `walk` and `run` would come from Meshy's basic rig animations; the rest are the `RIG_ACTIONS` library ids | `apps/veer-wonder-world/src/characters/momo.ts` and `lulu.ts` (`clipCandidates`); `src/characters/character-registry.ts` (plays only clips that `MODEL_INFO` lists); `src/aura-assets.ts` (`MODEL_INFO`) |
| B9 | Every model use has a primitive stand-in of the right size and colour. It is drawn when `modelRef(key)` is `undefined` (not admitted) or when `?models=0` is set. `bubble` is always procedural. After review, five more keys are drawn procedurally by design (`PROCEDURAL_MODELS`): `ball`, `bush`, `stompStone`, `cloud` and `balloon`, plus the six props added later (B20: `letterBLower`, `letterALower`, `toothbrush`, `sun`, `candleFlame`; and `partyHat`). The ball generations had a face, resembled a known capture-ball design or came out lime. The bush came out as a 327 MB grey rose. `stompStone`, `cloud` and `balloon` were not generated while the Meshy keys were out of credits. The `hat` was generated once credits returned (v2, a plain red sun hat) and is admitted | The app must always run while generation is incomplete; the stand-in is never a release claim. `02` §6 allows simple scene geometry for props that are not hero subjects | `apps/veer-wonder-world/src/aura-assets.ts` (`modelRef`, `MODEL_INFO.heightM`, `MODEL_INFO.procedural`, `PROCEDURAL_MODELS`); `tools/model-review.json` (status `procedural`); `src/types.ts:17-28`; `docs/api/model-loader.md:5` |
| B10 | Story files and keys are listed in section 3.2. Story id = slug. Line keys are `<code>.<beatId>.<n>`, with `<code>` `e01`-`e20` or `g01`-`g12`. A beat's response lines continue its numbering: `e17.invite.2` ("Go!") is the E17 invite response. All 843 line keys of the 32 stories match the scheme (823 at the 2.1 snapshot; the content lint enforces it). Strings are `<code>.title`, `<code>.offline`, `<code>.bridge` and `<code>.tip.<n>` | One key scheme lets the validator, the audio generator and captions resolve every line | `apps/veer-wonder-world/src/localization/en/episodes/sheru-big-adventure.ts`; `apps/veer-wonder-world/tools/gen-audio.ts` |
| B11 | The turn wait defaults to 5000 ms (`BeatSpec.waitMs`). Parents can change it (`ParentSettings.waitMs`), and the wait always ends by itself | Inside the 4-6 s proposal of `01` §3.1 | `src/types.ts:118-122`, `src/types.ts:276` |
| B12 | Browser specs J08-J13 sit at the repo root as `tests/browser/wonder-world-*.spec.ts` | The root `playwright.config.ts:21-22` matches `tests/browser/**/*.spec.ts`, and the remote runner takes `SPECS="tests/browser/wonder-world-*.spec.ts"` | `04` J08-J13 updated |
| B13 | Game checks without registration. `tools/game-checks/run.mjs` resolves only `kind: "game"`, `status: "live"` entries of `docs/workflows/game-inventory.json` and throws `unknown game(s)` for anything else (`tools/game-checks/lib/index.mjs:529-537`). Registering would put the prototype into the site inventory (B5). Instead, `node apps/veer-wonder-world/tools/game-checks.mjs` runs every per-game check in `GAME_CHECKS` (`tools/game-checks/lib/index.mjs:506`). It feeds them the files from `gameSources` (`:40`) for an unlisted game record (`appFolder: "veer-wonder-world"`, status `prototype`) and exits 1 on any error finding. The repo-wide `GLOBAL_CHECKS` are not part of it. `apps/veer-wonder-world/tools/check-all.sh` runs it with the other local checks. If the parent registers the app instead, record why (§0.5) | Keeps the static checks without listing a children's prototype publicly | `apps/veer-wonder-world/tools/game-checks.mjs`; `tools/game-checks/lib/index.mjs` |
| B14 | Two typechecks. `apps/veer-wonder-world/tsconfig.json` extends the root `tsconfig.base.json` (workspace sources, `MASTER-PROMPT.md` §8). `tsconfig.published.json` checks the same `src` and `tests/unit` against the published 4.5.0 packages (`typecheck:published` script) | The first proves the monorepo build; the second proves the app uses only published API | `apps/veer-wonder-world/package.json`, `apps/veer-wonder-world/tsconfig.published.json` |
| B15 | Fonts: "Graphik Web" through `/fonts/local.css`, weights 400, 500 and 600 | Licensed font set only | `public/fonts/local.css:7` |
| B16 | Locale: English only. `pa.ts` stays present but disabled until a native review | `03` §7; `04` C08 | — |
| B17 | No family content. E18 and G09 use generic friends; no family names, voices or photos; no family pack is built | `MASTER-PROMPT.md` §6 | `05` E18 and G09; `04` I06; `02` §3 |
| B18 | Raw Meshy output stays in the gitignored `artifacts/meshy/wonder-world/<key>/` (root `.gitignore:418`, `/artifacts/`). Each model's thumbnail is reviewed before admission (`tools/model-review.json`), and rejected versions are kept in `artifacts/meshy/wonder-world/_rejected/`. The `ball` prompt was sharpened ("no face") after the first result looked like a face. The later versions were rejected too, so the ball is drawn procedurally (B9) | `MASTER-PROMPT.md` §4 | `apps/veer-wonder-world/tools/wonder-assets.json` (`ball`); `tools/model-review.json` (`ball`); regeneration status in 4.1 |
| B19 | Run `aura3d check-deploy` from `apps/veer-wonder-world` (it reads `aura.assets.json` and `--dist` relative to the working directory). The app's `aura.assets.json` lists no entries, so the static pass checks no model files; the remote build spec `tests/browser/wonder-world-build.spec.ts` passes `--no-assets` to make that explicit. The file has to exist: the first remote build run (`wonder-ff-build-1`) failed with "Missing aura.assets.json", even with `--no-assets`, because `validateAssets` fails whenever the file is absent. Its `typegen` is `src/aura-assets.ts` (written by `tools/gen-aura-assets.mjs`), so `aura3d assets add` and `assets typegen` must not be run in the app folder. The GLBs and audio are covered instead by two checks. The regenerate-and-diff check (B3) requires each model's sha256 to match its provenance record, and each audio file to have a provenance record and a sha256 matching the committed manifest. The `--browser` pass fails on any 4xx/5xx response or failed request | It records honestly what each check covers | `packages/aura3d-cli/src/index.ts:1097-1160` (`checkDeploy`); `packages/aura3d-cli/src/index.ts:960-972` (`validateAssets` fails when the manifest is missing); `apps/veer-wonder-world/aura.assets.json` |
| B20 | Contract additions after the checklist audit (2026-10-29), all optional or additive so every existing story stays valid: a `song` action takes `performers` (who plays the song's per-line motion; default the cast on stage) and `cues` (stage actions at a lyric line's start); gestures `surprise` and `wait`; Sheru's bark bank (`woofSoft`, `woofDouble`, `yip`, `arf`, `pant`, `sniffs`, `huff`, `aroo` beside `woof`); `ParentSettings.sfxVolume` (off, soft, normal); procedural props `letterBLower`, `letterALower`, `toothbrush`, `sun` and `candleFlame`; QA hooks `nodeRects`, `stageApply`, `setTalking` and `state().spoken`; the page switch `?modelWaitMs` | The audit of every `01`-`06` checkbox (section 4.2) found these gaps: song motions never played (`04` C06, F04, F05), no surprised or waiting pose (`02` §2), one bark (`02` §2), no caregiver SFX adjustment (`01` §9), no lowercase letter (`05` §1), E19's brush and sun and E16's candle not shown, and no way to capture a turnaround or check the talking pulse in a browser | `apps/veer-wonder-world/src/types.ts` (comments cite this row); `src/qa/install-hooks.ts`; `src/runtime/feature-flags.ts` |
| B21 | The model preloader's timeout bounds the wait, not the download. A model still arriving when a story load stops waiting (10 s) is drawn as its stand-in for that mount and keeps downloading (capped at 15 minutes, first 120 s; see below); the next mount uses it. `summary()` reports downloads still running as `pending`, and `dispose()` aborts them | Aborting at 10 s meant that on a slow connection the ~2 MB characters never finished. The first remote run showed it: on software WebGL2 Sheru's 2.1 MB file took 15 s, so the first mount drew a stand-in (run `wonder-A-20261029T135132Z`, record `first-frame-models` field `firstMount`) | `src/runtime/asset-preloader.ts`; `tests/unit/stage/character-registry.test.ts` (asset preloader); `tests/browser/wonder-world-lib.ts` `remountIfModelsLate`. The cap went from 120 s to 15 minutes on 2026-10-29: with the welcome animating over the boot on software WebGL2, a model the server had already sent stayed unread past 120 s and was aborted, which failed `check-deploy --browser` (runs `wonder-exp-a/b/c-20261029T222803Z`: unchanged failed; a longer cap, or reduced motion, passed). The cap is for a stuck download, not a slow one |
| B22 | E16's candle flame is a separate procedural prop (`candleFlame`) resting on the candle, so the story can light it, blow it out and relight it. The cake model's own flame and wick were cut off (`tools/cut-cake-flame.mjs`: 92 triangles above the candle rim), and the cake is a surface whose rest height is its top | A modelled flame cannot go out; the lines and the birthday song describe it going out | `src/assets/models/cake.f261855c.glb`; `provenance/models/cake.json` (`processing.flameCut`); `src/scenes/stand-ins.ts` (`cake`, `candleFlame`) |
| B23 | Sound effects play through the app mixer on the shared `AudioContextManager`, not `createCueBank`/`createSampleSlices` (`04` F1.3 and B06 name the cue bank). The mixer applies each effect's own gain relative to `SFX_MAX_GAIN`, the SFX bus cap, the grown-up's level, pause, the repeat guard and the three-voice limit in one place | `GameAudio` and synth cues add pitch and gain jitter and report no end of playback (C4), and a cue bank would need a second pause and level path beside the mixer | `src/runtime/audio-mixer.ts` (`playSfx`, `sfxGainScale`, `SFX_VOLUME_SCALE`); `tests/unit/runtime/audio-mixer.test.ts` |
| B24 | Touch meaning is per beat, not a finite GO/STOP/OPEN/POP/MORE/FETCH event set (`04` F1.1). A beat names its tap targets and its `response` says what the tap means; every tap and every parent confirm goes through one dispatcher (the touch router, then the director's `TAP` or `PARENT_CONFIRM`) | Any target is a good answer and silence never fails (`01` §3.1); one response per beat is the contract (section 3.2), so a fixed verb set would add a mapping without changing what a child sees | `src/runtime/touch-router.ts`; `src/runtime/episode-director.ts`; `src/app.ts` (`bindCanvasTaps`, `confirm`) |
| B25 | GoGo's wheels do not turn and the train has no doors (`02` §2, `04` D06). GoGo moves with drive tweens, a chug bob and its carriage | The admitted GoGo model is one welded mesh with modelled wheels and no door. Meshy text-to-3D returns one mesh per model, so a regenerated GoGo would be welded the same way: wheel roll or opening doors need a vehicle modelled in separate parts (wheels and doors as their own nodes), which this pipeline cannot produce. When this was first recorded the Meshy keys were also out of credits (26 of 30 returned HTTP 402); credits came back later in the run (Momo v3 and the sun hat were generated), and the separate-parts limit still holds | `provenance/models/gogo.json`; `src/characters/gogo.ts`; `~/.aura3d/meshy-ledger.jsonl` |
| B26 | The ball and balloon, the procedural props of B20 and the party hat are drawn from scene geometry and are not production art (`04` "Art / media acceptance": no primitive-only substitute in a production claim): the label stays `prototype` | The Meshy balls looked like a face or a known capture-ball design (B18); the balloon was not generated while the keys were out of credits; the B20 props and the party hat are small, simple shapes (a lowercase letter, a toothbrush, a sun, a flame, a cone hat) that scene geometry draws cleanly and that stories show, hide and light | `tools/model-review.json` (`procedural`); `src/scenes/stand-ins.ts` |
| B27 | A generated rights manifest, `src/assets/rights-manifest.ts` (`04` D14): licence, owner role and review for every admitted model and every audio file (with its tier), licence, source and owner for each look HDRI, and notes for the procedural props. Nothing imports it, so it stays out of the bundle | Build-readable rights records without shipping prompts or key ids | `tools/gen-rights-manifest.mjs`; `tests/unit/content/rights-manifest.test.ts`; `tools/check-all.sh` |
| B28 | Episode length is measured with the recorded audio. The content lint fails an episode that runs under 120 s with its clips (no taps), and every episode declares that measured length. Eight episodes (E07, E08, E09, E10, E16, E17, E18, E20) ran 108-119 s and got longer holds, mostly 1-2 s on calm beats; all 20 now run 122-137 s | Recorded speech runs faster than the text estimate, so the declared figure alone (checked to within 25%) hid episodes under the 2-4 minute target of `05` | `src/content/schema.ts` (`checkDuration`); `tests/unit/content/content-schema.test.ts`; commit `908b17a69` |
| B29 | Voice lines are generated one at a time, and any file a free-tier or unknown-tier key produced is generated again | The Prism pool sends each call to the key with the most characters left; while the one paid (`starter`) key is busy, parallel calls spill onto free-tier keys (26 of 29 new lines in one run). Free-tier output is prototype-only (C9) | `tools/gen-audio.ts` (`PAID_TIERS`, default concurrency); `provenance/audio/*.json` (`tier`); commit `0dd15eefd` |
| B30 | Spoken forms: where a caption shows a lone lowercase letter ("Big B, little b."), the voice is asked to say the letter name ("Big Bee, little bee."); the caption keeps the written letter | A lone "a" is read as the word "uh". `05` §1 keeps letter name and sound apart, so the name must be the name | `src/localization/en/spoken-forms.ts`; `tools/gen-audio.ts`; `tools/validate-content-entry.ts` (stale check uses the spoken form) |
| B31 | E01's "Mirror Momo" is a reflection drawn in the mirror's glass: a smaller, depth-flattened copy of Momo's model (or stand-in), tinted cooler and dimmer, playing her gestures as a mirror image and kept inside the glass. There is no render-to-texture mirror | `surfaces.mirror` in 4.5.0 is horizontal only (a floor mirror), so a standing hand mirror needs its own reflection; a copy costs one draw call and stays deterministic | `src/scenes/stage.ts` (`reflectionLayout`, `reflectionPose`, `MODEL_MIRROR_GLASS`); `tests/unit/stage/mirror-reflection.test.ts` |
| B32 | The consumer smoke (`03` §10 "`mini-game` consumer smoke works on the pinned released SDK") gates on scaffold, install, the engine resolving to 4.5.0, build and the static `check-deploy`. Its `--browser` pass may fail only on the template's own missing demo media, which it lists; any other failure fails it | A fresh `create-aura3d@4.5.0 --template mini-game` builds and passes the static gate, but its page requests demo media the scaffold does not ship: six `/packs/game-sfx-core/*.m4a` effects, the `/probes/probe-20ms` audio-codec probes, and the `Textures/colormap.png` that one Kenney GLB names (first seen in run `wonder-P-20261029T152530Z`). That is an upstream template defect, not the SDK and not this app (the app's own build passes `check-deploy --browser`). The same pass reports the template's hero model `/aura-assets/kaykit-barbarian.glb` as `net::ERR_ABORTED` on software WebGL2 (runs `wonder-P-20261029T152530Z` and `wonder-consumer-smoke-20261029T161422Z`). The spec then opens the built scaffold itself and counts that abort as upstream only when the hero GLB finishes downloading there and the template reports the hero's clips. Follow-up for a later Aura3D release: ship or drop those files in the template | `tests/browser/wonder-world-consumer-smoke.spec.ts` (`UPSTREAM_TEMPLATE_404`, `HERO_ABORTED`, `heroCheck`); record `consumer-smoke` (`browser.upstreamTemplate404`, `hero`) |
| B33 | The stage's forward is +Z for every model, as for every stand-in. The three side-on Meshy vehicles (`gogo`, `gogoCarriage`, `car`, front toward -X in the GLB) get a quarter turn (`MODEL_FRONT_YAW`) | The shakedown's character sheet showed GoGo's side for "face the viewer", its face appearing only when it faced offRight; every `face gogo toward viewer` in E04 and G02 showed the side, and drives slid broadside | `src/scenes/stage.ts` (`MODEL_FRONT_YAW`); `tests/unit/stage/model-orientation.test.ts`; run `wonder-K-20261029T152530Z` |
| B34 | Peeko's fitted height is 0.55 m (was 0.45) and Lumi's 0.65 m (was 0.6). Lumi is admitted again with a soft warm-yellow tint (`#ffeb99`, glTF base colour factor; geometry unchanged). Peeko's character sheet uses G04, its own activity, and a sheet's turnaround passes when the view most unlike the front differs from it | On a 320x568 phone the wide framing must keep the stage's full width, so only size helps. The sheets measured Peeko at 31-43 px and Lumi at 43 px tall against the 48 px floor (run `wonder-K-20261029T152530Z`; the framing's projection still gives 43 and 48 px with the closer look-dev framing of commit 3f7822cf4), and Lumi's untinted texture read near-white against the learning cloud, while `02` asks for a warm yellow star. E02 keeps Peeko behind a door in every wide shot. Lumi's back matches its front but for the face, 1% of the crop | `tools/wonder-assets.json`; `tools/model-review.json` (`lumi.tint`); `provenance/models/{lumi,peeko}.json`; `tests/browser/wonder-world-lib.ts` (`CHARACTER_STORIES`); `tests/browser/wonder-world-capture-lib.ts` (`turned`) |
| B35 | The preview is its own Vercel project, `aura3d-wonder-world`, in the team of the Aura3D site. `apps/veer-wonder-world/tools/deploy-preview.sh` checks the commit out into a clean temporary worktree and puts the commit's `deploy/vercel.json` and `deploy/vercelignore` at its root. The deploy host then installs and runs `tools/deploy-build.sh`: the content lint, the Vite build, `tools/check-dist.mjs` (noindex kept, no source maps, no child name in a served text file) and the static check-deploy. The deploy build unsets every `VITE_` variable before Vite runs, and `check-dist.mjs` fails any served file that holds a `VITE_VERCEL_` variable. The engine reads `import.meta.env` as one object (`packages/game/src/index.ts`), so Vite inlines every `VITE_` variable it sees. The first deploys carried Vercel's own (the deployment URL with the team slug, and the production URL, which named the child once the O7 domain was added). The site's own `.vercelignore` leaves the app out | DEPLOYMENT.md §3 asks for an origin root (the HDRIs and fonts load from `/hdri/` and `/fonts/`) and neutral names. A sub-path of the public site would be neither, and adding the app to the site build is the public-release step (O5). The project's address carries no child's name. Vercel's per-deployment URLs carry the team's slug, and they stay behind the team login. Heavy builds stay off developer Macs and the ACR runner has no artifact egress, so the deploy host builds. The merge had raised the site's upload to 15,017 files, past Vercel's 15,000-file limit. The first deploy uploaded 12 files, because the Vercel CLI tests directories without a trailing slash, so the upload rules end in none | `apps/veer-wonder-world/DEPLOYMENT.md` §3; `.vercelignore`; `apps/veer-wonder-world/tests/unit/privacy/deploy-config.test.ts`; `tests/browser/wonder-world-live.spec.ts` |
| B36 | Songs are evened out to the loudness of the voice lines, as the voice lines are evened out to one level: each song's own gain takes its gated RMS to 0.083, within the voice lines' gain and peak limits, on a song bus level with the voice bus (1.0). Songs still dip to 0.25 under a voice line, and the bed is unchanged | The owner heard the singing come out quieter than the talking. Computed from each file's EBU R128 loudness and the mixer's gains, against 60 voice lines, the 16 sung tracks played 4 to 6 dB below the average line: songs were only ever turned down, on a 0.7 bus. A 50 ms RMS reads speech louder than a loudness meter does (its windows catch whole syllables), so the song target sits below the voice target (0.125); 0.083 puts every song within 0.4 dB of the average line | `apps/veer-wonder-world/src/runtime/audio-mixer.ts` (`AUDIO_LEVELS.song`, `CLIP_LEVELS.songTargetRms`, `clipGain`); `tests/unit/runtime/audio-mixer.test.ts` "evens songs out to the loudness of speech, on a bus level with the voice" |
| B37 | The main cast's normal maps are stored as JPEG (quality 95, no chroma subsampling) instead of PNG; geometry, materials and the other maps are untouched (every accessor hashed before and after) | The owner asked why the app loads slowly. Five characters carried a 1024 px PNG normal map of 1.1-1.7 MB, about half of each GLB, which brotli cannot shrink; Gogo's was already a JPEG. Each character drops by 0.8-1.1 MB (45%), and a story's model download from a median of 4.4 MB to 2.6 MB (largest 8.7 to 5.8 MB), at a mean normal error of about 1 degree | `apps/veer-wonder-world/tools/jpeg-normal-maps.mjs`; `tools/admit-models.mjs`; `provenance/models/<key>.json` (`processing.normalMapJpeg`, with the previous file); `provenance/portraits.json` (`renderedFrom`) |
| B38 | The build targets Safari 15 (Chrome, Edge and Firefox 100), and the page checks for WebGL 2 and Safari 15.4's JavaScript (`Array.prototype.at`, `Object.hasOwn`, `structuredClone`) before the bundle runs; without them the splash shows a "too old" notice. iPadOS 15.4 or later is the floor | The owner reported that the app does not load on older iPads. The `es2022` build kept class static blocks, which Safari parses only from 16.4, so iPadOS 15 and 16.0-16.3 stopped before drawing anything; the served scripts held 8. The app's locale lookup calls `Object.hasOwn`, so iPadOS 15.0-15.3 would stop at start too. No real old iPad has been tried (section 4.3) | `apps/veer-wonder-world/vite.config.ts`; `index.html`; `tools/check-dist.mjs` (fails on a class static block); `tests/unit/ui/strings.test.ts` |
| B39 | The welcome (O8) stands beside the controls on landscape screens up to 840 px tall, and stacks otherwise. Its rainbow is sized by the window's height (smaller in the two-column layout), with all six character colours; the big line's gradient runs purple, magenta, coral and amber; clouds keep to the corners; the portraits zoom in on each character; the sky is fixed to the window | A review of the live welcome at desktop, tablet and phone sizes found that it scrolled on short landscape screens (63 px at 1280x720, 15 px at 1024x768), that the rainbow, sized by the window's width, ran through the title, that the gradient turned olive between teal and orange on the name itself, that the big line broke into three lines at 320 px, and that clouds sat behind the portraits | `apps/veer-wonder-world/src/ui/start-screen.ts` (hero and panel groups); `src/ui/styles.css` (welcome section and the landscape rules at its end); `tests/browser/wonder-world-start-screen.spec.ts` (13 sizes) |

## 2. Agent-review record (stands in for every human sign-off the PRD names)
Reviewer: build agent (`agent:claude-opus-5.5`), owner instruction 2026-10-29. Each review has two parts:
- **PRD level**, done by the docs unit on 2026-10-29: the rules and the frozen contract `apps/veer-wonder-world/src/types.ts`.
- **Story level**: the 32 stories, reviewed by the parent at integration (section 4.2).

The snapshot below was taken in the docs review pass on 2026-10-29. All 32 stories existed by then, but other units were still editing them, so the parent re-runs every scan on the final files.

### 2.1 SLP and content
- **Replaces.** `01` header (pediatric SLP); `01` §3.1 (pause timing "SLP review required"); `01` §11 (first box); `04` B03; `05` header and E03 "Done"; `06` G8, QA-E07, §8 (SLP review) and §10 (speech-language reviewer); README P0 (pediatric speech-language advisor).
- **Learning loop.** The contract carries `01` §3.1:
  - each beat speaks its `lines` while the named object is visible (`BeatSpec.words`);
  - invites wait `waitMs` (default 5000);
  - every wait ends by itself (`BeatInput`: "Silence never fails");
  - `response` plays after the wait, whatever ended it.
- **No scoring or forcing.** There is no correctness state and no speech or score event (`DirectorEvent`). Any tap target is a good answer, and `microphoneRequired: false` holds for every activity.
- **Target words.** `targetWords` holds 1-3 core words; 4 are allowed for the counting and animal-sound clusters (`05` §6 exception).
- **Letters.** `letterConcept` keeps `letterNameKey` and `phonemeCueKey` as separate keys, one letter per episode (E03 B, E04 A).
- **Counting.** `numberConcept` is fixed to `countMin: 1`, `countMax: 3`, and `countedObjectIds` names one visible object per spoken number.
- **Snapshot, 2026-10-29 review pass** (all 32 stories: 20 episodes and 12 activities; the English pack then held 823 lines and 268 strings, and at the final check 843 lines and 277 strings, 4.2):
  - `rg -n -i '\bwrong\b|try again|say it|repeat after me|good job|well done|\bcorrect\b|incorrect|\bscore|streak|happy birthday|\bmama\b|\bpapa\b|\bveer\b' apps/veer-wonder-world/src/localization` finds 3 hits and none in a line. Two are source comments that forbid the phrase (`whos-at-the-door.ts:2`, `little-birthday-party.ts:2`); the third is the parent-facing note in `en/ui.ts` that the app does not "test, score or diagnose";
  - no line contains a number word above "three";
  - all 81 tap-target lists have at most two targets, and all 81 explicit `waitMs` values are 5000;
  - all 823 line keys match `<code>.<beatId>.<n>`;
  - three stories list four target words: E05 and E11 (counting) and E09 (animal sounds), within the `05` §6 exception.
- **Letter lines in the drafts (E03, E04).** Name and sound are separate lines. E03 has "B. Bee." (`e03.letter.2`), then "B says b-b-ball." (`e03.ball-sound.1`). E04 has "A. Ay." (`e04.letter.2`), then "A says a-a-apple." (`e04.a-sound.1`). The sound is modelled as the stretched start of the word, with no added vowel; an earlier draft's "buh" spelling is gone. Listen to the recorded lines and keep each sound short. This is not a safety issue.
- **Pace of the recorded voice (`01` §9 "voice legible and slower than typical cartoons, in natural speech; no overlapping dialogue; intentional quiet spaces"), measured 2026-10-29 from the 843 clips in `AUDIO_MANIFEST` and the episode timing with recorded audio.**
  - The voices speak at a natural rate: the median line of four or more words runs at about 152 words per minute, including the clip's own lead-in and tail (speed 0.88-0.92, section 3.1).
  - The episodes are slow and quiet by design. A voice line plays during a median 39% of an episode's running time (at most 56%); the rest is action, music, song and pauses. Each line is followed by its hold, and only one voice line plays at a time (`narration-player.test.ts` "never lets two lines overlap"). That makes a median of 51 spoken words per minute of episode (range 43-77).
  - A person still listens on the devices (4.3 item 1).
- **Counted objects in the drafts.** Four stories carry `numberConcept`: E05 (cookies), E11 (balloons), E16 (decorations) and G08 (blocks), each with three `countedObjectIds`.
- **Evidence.** `apps/veer-wonder-world/src/types.ts:95-129,151-168,212-235`; this section.
- **Parent completes (4.2).** Run the content validator (J14) and the scan above on all 20 + 12 stories. Check that E05 counts one visible cookie per number, that E16's tune and lyrics are original, and that E03 and E04 keep letter name and sound in separate lines.
- **Limits.** This is not clinical review. It supports no educational or therapeutic claim (`01` §7 keeps the human SLP rule for any future claim).

### 2.2 Caregiver UX
- **Replaces.** `01` header (caregivers); `06` G8 (caregivers approve story tone and attention demands); `06` §7 (caregiver UX review); `06` §8 (caregiver review item).
- **Checked against `01` §6 at contract level:**
  - start note and parent guidance (`caregiverPromptKey`, `<code>.tip.<n>`);
  - pause and resume (`PAUSE`, `RESUME`);
  - "All done" at any moment (`ALL_DONE`, finished reason `all-done`);
  - finite end with an offline card (`offlinePlayKey`, effect `offline`) and no next-episode effect;
  - caregiver bridge per story (`caregiverBridgeKey`, `<code>.bridge`);
  - settings on the device only, with no identity field (`ParentSettings`).
- **Draft check.** The E17 bridge and tips read as invitations, not tests ("A reach, a look or a sound is a fine answer.", `e17.bridge`).
- **Evidence.** `src/types.ts:211-235,267-278`; `apps/veer-wonder-world/src/localization/en/episodes/sheru-big-adventure.ts`.
- **Parent completes (4.2).** Confirm in the remote run that "All done" works from every beat, that settings clear, and that no screen auto-starts another story (J09, J11, J12).
- **Limits.** No caregiver has used the app. The `06` §8 observation items need a real family, so they stay open (4.3).

### 2.3 Rights and IP
- **Replaces.** `02` §1 (rights clearance) and §2 (originality, licensing, naming/trademark review); `02` §8 (provenance); `03` §10 (rights review); `05` §6 (assets original or licensed); `06` G1 (ART/legal) and §10 (characters original, rights cleared); README P0 (rights strategy).
- **Names.**
  - "Momo", "Lulu", "Sheru", "Peeko" and "GoGo" appear nowhere in the repo outside this app and folder. That includes `docs/workflows/game-names.md`, `tools/site/games.catalog.json` and `docs/workflows/game-inventory.json`.
  - "Lumi" appears only as a driver-name preset seen in a third-party web game (`docs/workflows/crayon-game-reverse-engineering.md:660`, `evidence/crayon-runtime/last-train-to-the-sea/session.json:27`), not as a character.
  - Pip was renamed because of *Pip's Big Leap* (C7).
- **Model prompts.** All 65 prompts in `tools/wonder-assets.json` were scanned (re-run 2026-10-29 after the hat, Momo v3 and the procedural props were added). None names a brand, franchise or existing character. The only capitalised words are colour words ("BRIGHT", "RED", "YELLOW", "BLUE", "GREEN", "BROWN") and the single letters "A" and "B" (the letter props and "A-pose"). The shared style strings forbid text, logos and brand marks.
- **E05.** Momo is an original purple monster (`02` §2; `momo` prompt), not a cookie character.
- **E16.** The `birthday` song has its own lyrics ("Little cake, little cake, a pretend light glows. ...", `src/content/songs.ts`) and a style prompt that asks for "an original birthday melody of its own". `tools/gen-audio.ts` puts "Original children's song" into every sung-song prompt. No line or lyric contains "Happy Birthday"; the only matches are comments that forbid it (2.1). The parent checks the final lyrics.
- **Provenance.**
  - Models carry the license string (the `license` option of `defineModelAssets` in `src/aura-assets.ts`), plus `provenance/models/<key>.json` per file (54 files on 2026-10-29, one per admitted model).
  - Audio carries provider, endpoint, voice, Prism key id, key tier, prompt and date per file (`provenance/audio/*.json`).
  - Family media: none.
- **Rule applied.** Output from free-tier keys is prototype-only and is re-rendered on a paid tier before any commercial release.
- **Parent completes (4.1).** Record the audio files per `tier` value as Prism reports it, and the per-model provenance count. The songs, beds and SFX generated so far report `starter`. Classify each value as paid or free; free and unknown stay prototype-only.
- **Limits.** This is not a trademark search or legal opinion, and the provider terms were not re-read in this run. A trademark search for "Wonder World" and the six names, plus a legal check of provider terms for public redistribution, belong to the publish decision (4.3).

### 2.4 Privacy
- **Replaces.** `01` header (privacy counsel); `06` G7 (static/privacy review); README P0 (approve the family privacy model, no-microphone v0, parent gate, local-only notes).
- **Checked (draft snapshot 2026-10-29):**
  - `rg -n -i 'getUserMedia|SpeechRecognition|webkitSpeech|mediaDevices' apps/veer-wonder-world/src` found 0 hits;
  - `ParentSettings` has no name or identity field;
  - no line, string, route or log text in `src` carries a child name. In the draft snapshot the child's name sat in the guard list `FAMILY_NAMES` in `src/content/schema.ts`, which the bundle imports (finding below); it has since been removed (resolution below);
  - the only external URLs in `src` are the SVG namespace and two parent-facing guidance links (AAP *Media and Young Minds*, ASHA) in `src/ui/parent-panel.ts`; there is no analytics or tracking SDK;
  - P3 stays off (`04` B11 flag).
- **Model approved.** No microphone, no account, settings on the device only and clearable, a parent gate as UX rather than security, no evidence containing a child's image or audio.
- **Finding for the content-core unit.** `MASTER-PROMPT.md` §6 forbids a child name in source and builds. Keep the name out of shipped modules: either take it out of `FAMILY_NAMES`, or move the name check into `tools/validate-wonder-world-content.mjs` or a unit test that is never bundled. Then confirm the built bundle and source maps do not contain it.
- **Resolution (final tree).** `FAMILY_NAMES` holds only generic family words ("mama", "papa" and the like). The validator, the unit tests and the browser specs derive the child's name from the working folder name and pass it in as `guardNames`, so it is never written. A scan of `apps/veer-wonder-world/src` for the bare name finds 0 hits, and the remote build spec finds 0 hits and 0 source maps in the served build (`build-privacy-scan`, 4.2).
- **Parent completes (4.2).** The J07 result, a scan of the built bundle and source maps for the same terms, and the network/storage check of QA-P07 on the remote run.
- **Limits.** This is not legal review. `01` §8 keeps legal review for children's privacy rules (for example COPPA) before any hosted public launch (4.3).

### 2.5 Accessibility
- **Replaces.** `06` G6 (device/manual accessibility checklist) and §7 (accessibility review); `01` §9 checklist sign-off.
- **Checked at design level:**
  - `reducedMotionStage` per beat;
  - `ParentSettings` `reducedMotion`, `highContrast` and `captions`;
  - at most two tap targets per beat (snapshot in 2.1). The content schema enforces it with `MAX_TAP_TARGETS = 2` in `src/content/schema.ts` (`MASTER-PROMPT.md` §6);
  - no camera-shake action exists: stage `camera` only switches between the fixed presets `wide`, `medium`, `close`, `left`, `right` and `high`. The `shake` object action is the shaker toy, not the camera;
  - Graphik Web at 400/500/600 (B15).
- **Parent completes (4.2).** J10 and J13 results; parent controls reachable by keyboard and labelled for screen readers (`src/ui/accessibility.ts`); checks that `glow` never flashes.
- **Limits.** No assistive-technology user tested the app, and touch and screen-reader checks on real devices stay open with the device runs (4.3).

### 2.6 Creative
- **Replaces.** `02` §1 (creative review); `02` §2 character approval deliverables; `02` §8 content approval; `06` §10 creative checklist; README P0 (creative director).
- **Checked:**
  - cast briefs and prompts give friendly, rounded silhouettes ("closed gentle smile, no teeth", no horns for Momo);
  - visual direction follows the 4.5.0 rules of `02` §4 (no vignette, HDRI or `environments.*`, runtime particles off, `warmPrograms`);
  - song patterns are original and finite ("Go / Stop with Lulu", "The Ball Rolls"; no automatic repeat).
- **Model review.** `tools/model-review.json` (reviewer `agent:claude-opus-5.5`) has 65 entries: 54 approved and 11 procedural (B9, B26). Momo v3 replaced v2 once credits returned: a lavender plush monster with a small closed smile and no teeth, as the brief asks (v2 had an open grin with two blunt buck teeth, kept in `artifacts/meshy/wonder-world/_versions/momo-v2`). One deviation stays open: GoGo's face is not visible in the side thumbnail.
- **Lyric reviewed.** The face song's "Mmm, mmm, lips go mmm!" (`src/content/songs.ts`, E01) names the lips once in play. Nothing on screen claims lip movement (the models have no mouths that move, `02` §2), and the line teaches no articulation, so it stays.
- **Parent completes (4.1).** Check the review record against every admitted model (`tools/admit-models.mjs` reads it). Four-side renders stand in for the turnaround and expression sheets of `02` §2. Note which models were regenerated after review.
- **Limits.** This is agent aesthetic judgement; no child or caregiver has seen the characters.

## 3. Reference for this build

### 3.1 Voice casting (ElevenLabs premade voices through Kiro Prism)
Lines use `eleven_multilingual_v2` at `mp3_44100_64`; songs and beds use the music endpoint at `mp3_44100_128`; SFX use sound-generation at `mp3_44100_64` (`apps/veer-wonder-world/tools/gen-audio.ts`). Every file is then loudness-normalised with ffmpeg `loudnorm`, which covers "volume-normalized" in `04` D15: lines at -18 LUFS (mono, 64k), SFX at -24 (mono, 64k), songs at -20 and beds at -28 (stereo, 128k).

| Role (`SpeakerId`) | Voice | Voice id | Speed | Stability | Style |
| --- | --- | --- | --- | --- | --- |
| Narrator (`narrator`) | Bella | `hpp4J3VqNfWAUOO0d1Us` | 0.88 | 0.6 | 0.15 |
| Momo (`momo`) | Will | `bIHbv24MWmeRgasZH58o` | 0.9 | 0.5 | 0.3 |
| Lulu (`lulu`) | Laura | `FGY2WhTYpPnrIDTdsKH5` | 0.9 | 0.45 | 0.35 |
| Lumi (`lumi`) | Matilda | `XrExE9yKIg1WjnnlVkGX` | 0.88 | 0.6 | 0.2 |
| Peeko (`peeko`) | Jessica | `cgSgspJ2msm6clMCkdW9` | 0.92 | 0.45 | 0.35 |
| GoGo (`gogo`) | Liam | `TX3LPaxmHKxFdv7VOQHJ` | 0.9 | 0.5 | 0.3 |
| Baby robot (`robot`, E13) | Callum | `N2lVS1w4EtoT3dr4eOWO` | 0.88 | 0.55 | 0.25 |
| Sheru (`sheru`) | none: barks only (SFX `woof` and the bark bank `woofSoft`, `woofDouble`, `yip`, `arf`, `aroo`, `pant`, `sniffs`, `huff`, B20) | — | — | — | — |

### 3.2 Content model (frozen contract `apps/veer-wonder-world/src/types.ts`)
- **Story files.** Each episode is `src/content/episodes/<slug>.ts` (`export const episode: EpisodeSpec`), and each activity is `src/content/activities/<slug>.ts` (`export const activity: ActivitySpec`).
- **Text.** It lives in `src/localization/en/{episodes,activities}/<slug>.ts` (`export const lines`, `export const strings`). Keys follow B10.
- **Media manifests.** `AUDIO_MANIFEST` has `{ lines, sfx, songs, beds }` tables of `AudioClipRef { url, sha256, durationMs }`. The contract has 16 song ids, 6 music beds and 42 SFX ids (34, plus the eight barks of B20).

How the `03` §3 illustrative interfaces map to the contract:

| `03` §3 (illustrative) | Contract (`src/types.ts`) |
| --- | --- |
| `id`, `version`, `title` | `id` (slug), `version`, `titleKey` (`<code>.title`) |
| `ageIntent`, `modeSupport` | Not per story: all content is early-toddler, and every story plays in both `PlayMode`s (`watch-sing`, `play-together`) given at `START` |
| `worldId`, `castIds`, `assetIds` | `world`, `cast` (`CastMember` with spot and `hidden`), `props` (`PropPlacement` with `asset`, spot, `tint`, `size`) |
| `targetWords`, `supportWords` | Same names (1-3 core words; up to 4 for counting and animal-sound clusters) |
| `letterConcept` | Same shape |
| `numberConcept { countMin, countMax, countedObjectId }` | `numberConcept { countMin: 1, countMax: 3, countedObjectIds }` (one visible object per spoken number) |
| `beats`, `estimatedDurationSec`, `musicKey`, `offlinePlayKey` | `beats` (episodes) or `intro`, `round` × `roundLimit`, `outro` (activities); `estimatedDurationSec`; `music`; `offlinePlayKey` (`<code>.offline`) |
| `rightsReview`, `languageReview` | One `review { language: "approved", rights: "approved", reviewer, date }` (B6) |
| New in the contract | `kind`, `number`, `phase`, `host`, `caregiverBridgeKey` (`<code>.bridge`) |
| `BeatSpec.kind` greeting/hook/demonstrate/invite/consequence/song/outro | `greeting`, `hook`, `model` (was demonstrate), `invite`, `event` (was consequence), `repeat`, `song`, `outro` |
| `sceneStateId`, `cameraPreset`, `animationCueIds` | `stage: StageAction[]` (`enter`, `exit`, `move`, `gesture`, `face`, `show`, `hide`, `object`, `carry`, `sfx`, `song`, `music`, `camera`), `camera`, `reducedMotionStage` |
| `narrationCueKey`, `captionKey` | `lines: LineRef[]` (`speaker`, `key`); the caption is the same locale text |
| `wordMentions [{ wordId, actionObjectId }]` | `words [{ wordId, objectId }]` |
| `durationMs`, `minHoldMs` | `holdMs` after the lines finish; line lengths come from `AUDIO_MANIFEST` (caption timing when audio is missing) |
| `input` none/tap-choice/tap-object/parent-confirm | `input` `none`, `tap { targets }` or `more-or-done { targets }`; a parent confirm is the `PARENT_CONFIRM` event on any waiting beat |
| `waitForChildMs`, `autoAdvanceMs`, `fallbackBeatId`, `nextBeatId` | `waitMs` (default 5000); beats run in order; `response { stage, lines, holdMs }` plays after the wait however it ended |
| `duckMusicDuringSpeech` | No per-beat flag: the mixer ducks music under every line (`03` §4) |
| `caregiverPromptKey` | Same name (`<code>.tip.<n>`) |
| `ActivitySpec` `labelKey`, `mainObjectId`, `action`, `introCue`, `actionCue`, `turnCue`, `outroCue`, `touchTargets`, `options` | `titleKey`; the main object and action are stage `object` actions in `round`; the cues are the `intro`, `round` and `outro` beat lists; targets are per beat; `options { allowTap: true, dragAlternative: "tap", microphoneRequired: false }` |

How the `03` §3 transitions map to `DirectorEvent`:
- `NEXT_BEAT` becomes `LINE_DONE` (a line finished) and `TICK` (holds and timers).
- `USER_TAP` becomes `TAP { target }`, and `PARENT_CONFIRM` keeps its name.
- `TURN_TIMEOUT` is a `TICK` past `waitMs`, with no failure state.
- `PAUSE` and `RESUME` keep their names; the director emits the `pauseMedia` and `resumeMedia` effects.
- `SKIP` and `ALL_DONE` become `SKIP_BEAT` and `ALL_DONE`.
- `AUDIO_UNAVAILABLE` keeps its name.
- `CONTEXT_LOST` has no director event: the app pauses the director while the `createGame` session is `context-lost` (app wiring, `04` A06).
- `START { mode }` and `DISPOSE` open and close a story.

The `03` §3 states map to beat kinds. `intro` is `greeting`, `problem` is `hook`, `model` is `model`, `invited_turn` is `invite`, and `acknowledge` is the invite's `response`. `repeat_with_variation` is `repeat`, `celebration` is `event` or `song`, `outro` is `outro`, and `finished` is the `DirectorPhase` `finished`.

### 3.3 Asset model (`apps/veer-wonder-world/tools/wonder-assets.json`, 65 models)
| Role | Count | Keys |
| --- | --- | --- |
| character | 12 | `momo`, `lulu`, `sheru`, `lumi`, `peeko`, `teddy`, `robot`, `cow`, `sheep`, `duck`, `horse`, `bird` |
| vehicle | 3 | `gogo`, `gogoCarriage`, `car` |
| prop | 42 | `butterfly`, `ball`, `bubbleWand`, `cookie`, `plate`, `mirror`, `door`, `letterB`, `letterA`, `apple`, `banana`, `cake`, `drum`, `shaker`, `toyPiano`, `picnicBasket`, `sponge`, `towel`, `toyBlock`, `lift`, `flower`, `flowerBud`, `bed`, `sink`, `table`, `chair`, `cushion`, `toyBox`, `bench`, `colourMachine`, `storyBox`, `pastryCircle`, `pastrySquare`, `pastryTriangle`, `hat`, `balloon`, `letterBLower`, `letterALower`, `toothbrush`, `sun`, `candleFlame`, `partyHat` |
| background | 8 | `tree`, `bush`, `barn`, `station`, `tunnel`, `house`, `stompStone`, `cloud` |

`MODEL_KEYS` has 65 entries: the 6 characters plus every `PropAssetId` except the procedural `bubble`. Default fitted heights are `MODEL_INFO[key].heightM`. No key is rigged (C6). Eleven keys are drawn procedurally by design (B9, B26), and on 2026-10-29 the other 54 were admitted (`provenance/models/*.json`).

## 4. Build record (the parent fills every `PARENT-FILL`)

### 4.1 Build, models and audio
| Item | Source or command | Result |
| --- | --- | --- |
| Branch and commits | `git log --oneline origin/main..HEAD` on `feat/wonder-world-foundation-20261029` (base `31f8945ad`) | `feat/wonder-world-foundation-20261029` from base `31f8945ad`, starting at `d863e8eb0`; every commit is a Conventional Commit, and the PR lists them all: https://github.com/auraoneai/aura3d/pull/1398 (open, not merged). The app last changed in `f7eab10f7` (the menu portraits); later commits change only the browser specs, docs and evidence |
| Scaffold (`04` F0.1) | `npx -y create-aura3d@4.5.0 mg --template mini-game --no-agent` and `npx -y create-aura3d@4.5.0 eb --template episode-builder --no-agent` in a scratch directory outside the repo (`/tmp`), 2026-10-29 | Run and compared; nothing was written into the repo by the scaffold and no root manifest changed. Adapted from `mini-game`: the `index.html` shell (charset, viewport, one module entry `./src/main.ts`; the app adds `noindex`, `no-referrer`, the licensed fonts and the overlay roots) and the `aura.assets.json` fields (`schema`, `assetBasePath`, `outputDir`, `typegen`; the app lists no entries, B19). Not taken: its sample GLBs, its Playwright specs (the remote specs replace them), its GitHub look-dev workflow (no GitHub Actions in this repo), its `vite.config.ts` and `tsconfig.json` (the app extends the repo root config and `tsconfig.base.json`, B14). From `episode-builder` the app follows the safety defaults: captions on by default (`src/ui/settings-store.ts:70`), a high-contrast caption plate at the bottom (`src/ui/styles.css`), reduced motion from `prefers-reduced-motion`, and no flashes (glows are steady). Not copied: its mouth cards, `primitiveMouthNodeId` and viseme sampling (the models have no mouth morphs, `02` §2), and its dubbing and video-review pipeline |
| Engine version | `apps/veer-wonder-world/node_modules/@aura3d/engine/package.json`; workspace `packages/engine/package.json` | 4.5.0 (published install used for the fast typecheck) and 4.5.0 (workspace `packages/engine`) |
| `noindex` and title | `apps/veer-wonder-world/index.html` | `<meta name="robots" content="noindex" />` present (line 6) and title "Wonder World (prototype)" (line 11). No listing: `rg -i 'wonder.world\|veer-wonder'` over `tools/site/games.catalog.json`, `docs/workflows/game-inventory.json`, `docs/workflows/game-names.md`, `marketing/scripts/build-showcase-routes.mjs` and `marketing/scripts/gen-seo.mjs` finds nothing |
| Models admitted | `MODEL_INFO` in `src/aura-assets.ts` (`admitted: true`) | 54 of 65 admitted. The other 11 (`ball`, `bush`, `stompStone`, `cloud`, `balloon`, `letterBLower`, `letterALower`, `toothbrush`, `sun`, `candleFlame`, `partyHat`) are `PROCEDURAL_MODELS`, drawn from multi-piece scene geometry by design (B9, B26). No other key is missing. |
| Rigged models | `MODEL_INFO[key].rigged` and `.clips` | None. Every `MODEL_INFO[key].rigged` is false and every `.clips` list is empty (C6). |
| Skin check | `pnpm exec aura3d assets validate --skin <glb>` for each rigged model | None rigged. The Lulu rig was evaluated before being rejected: `validate --skin` failed in every clip (895-1,465 of 12,356 triangles past 1.6x, worst 8.5-11.2x, `SKIN_STRETCH`, `SKIN_FLAP`, `SKIN_BIND_MISMATCH`). After `tools/bake-armature-scale.mjs` (lossless: the pre-repair report is identical) and `repair-skin --refit-skeleton`, 297 triangles still stretch past 1.6x, worst 142.9x, and knees bend forward (`SKIN_JOINT_RANGE`). |
| Model review and regenerations | `apps/veer-wonder-world/tools/model-review.json`; `artifacts/meshy/wonder-world/_review/` and `_rejected/` | 54 approved, 11 procedural. Rejected versions are kept in `_rejected/`: `momo-v1`, `gogo-v1`, `gogo-v2`, `peeko-v1`, `ball-v1`, `ball-v1b` (resembled a known capture-ball design), `butterfly-v1`, `drum-v1`, `cookie-v1` (geometry reused), `cookie-v2`, `cake-v1`, `bird-v1`, `tree-v1`, `hat-v1-stale` (a stale first hat task from an exhausted key; the hat was generated again from a fresh preview); Momo v2 is kept in `_versions/momo-v2`. Root cause of the colour misses: the refine texture prompt carried only the generic style; fixed in `tools/meshy-pipeline.mjs`. Recovery without new spend once Meshy's API keys ran dry (26 of 30 return HTTP 402): Momo v2 recoloured purple by a hue shift that keeps the eyes and teeth white; GoGo v3, `toyBox` and `pastrySquare` simplified locally from their refine models; the cookie retextured from v1 (10 credits). Regenerated once credits returned: Momo v3 (new prompt; a closed smile and no teeth, approved as generated with no recolour) and the sun hat v2. Lumi admitted again with a warm-yellow tint after the character sheets (B34; geometry unchanged). Open deviations: GoGo's face is not visible in its review thumbnail; the barn is green (brief: red). |
| Model bytes | `du -ch apps/veer-wonder-world/src/assets/models/*.glb` | 23 MB for 54 GLBs (1024 px textures and normal maps for the main cast; 512 px base colour only for the rest) |
| Meshy credits | `aura3d meshy ledger status` / `list` (ledger `~/.aura3d/meshy-ledger.jsonl`, tag `wonder-world`) | About 2,497 credits by the ledger estimate for `wonder-world` (222 completed tasks: preview 1,420, refine 690, remesh 325, rigging 10, animate 42, retexture 10; generation, regenerations including Momo v3 and the sun hat, the rejected Lulu and Momo rig and clips, one retexture) |
| Audio files | `AUDIO_MANIFEST` table sizes | Lines 843 of 843 line keys (Sheru's barks are SFX), songs 16 of 16, beds 6 of 6, SFX 42 of 42 (907 files) |
| Audio tiers | `provenance/audio/*.json` field `tier` | All 907 files `starter` (paid ElevenLabs plan). 47 lines in the first pass and 26 of 29 lines in the content-fix pass landed on free-tier keys; each was deleted and generated again on the paid key, and `gen-audio.ts` now does that by itself (B29). |
| Audio bytes | `du -ch apps/veer-wonder-world/src/assets/audio` | 22 MB (voice mono 64 kbit/s, normalised to -18 LUFS with a mean-volume correction for clips under 3 s, measured -20.3 ± 1.3 dB; SFX about -26 dB mean; songs -20 LUFS; beds -28 LUFS) |
| Generated files are reproducible | `node apps/veer-wonder-world/tools/gen-aura-assets.mjs && node apps/veer-wonder-world/tools/gen-audio-manifest.mjs && git diff --exit-code apps/veer-wonder-world/src` | Exit 0: `apps/veer-wonder-world/tools/check-all.sh --workspace` regenerates both modules and the rights manifest and finds them current ("== generated files are current") |

### 4.2 Tests, validation and remote runs
| Item | Command | Result |
| --- | --- | --- |
| Typecheck (workspace) | `pnpm exec tsc -p apps/veer-wonder-world/tsconfig.json --noEmit` | 0 errors (2026-10-29, `apps/veer-wonder-world/tools/check-all.sh --workspace`) |
| Typecheck (published 4.5.0) | `(cd apps/veer-wonder-world && ./node_modules/.bin/tsc -p tsconfig.published.json --noEmit)` | 0 errors (same run) |
| Unit tests (J01-J07, content tests) | `(cd apps/veer-wonder-world && ../../node_modules/.bin/vitest run --config vitest.config.ts)` | 24 files, 522 passed, 0 failed (same run) |
| Content validation (J14) | `node apps/veer-wonder-world/tools/validate-wonder-world-content.mjs` | 32 stories validated (20 episodes + 12 activities), 843 lines, 277 strings, 54 admitted models, 907 recorded clips with recorded audio required: 0 errors ("OK: content lint passed") |
| Story-level review scans (2.1, 2.4) | The `rg` commands in 2.1 and 2.4, re-run on the final tree and the built bundle | 2.1 pattern over `src/localization`: 3 hits, none in a line, string or lyric (two source comments that forbid the phrase, `little-birthday-party.ts:2` and `whos-at-the-door.ts:2`, and the parent note in `en/ui.ts` that the app does not "test, score or diagnose"); the same pattern over `src/content/songs.ts`, `sfx.ts` and `music.ts`: 1 hit, a comment (`songs.ts:9`). No number word above "three" in any line. 2.4 microphone pattern over `src`: 0 hits. The built bundle is scanned for the child name and source maps by the build spec (`build-privacy-scan`, 4.2 below) |
| Game checks (B13) | `node apps/veer-wonder-world/tools/game-checks.mjs` (also the last step of `tools/check-all.sh`) | 0 errors, 0 warnings, 15 checks (2026-10-29, after the evidence screenshots were committed; before that `screens-tracked` reported the one expected error, "no screenshots tracked in git") |
| Remote browser specs (J08-J13) | `EXTRA_DIRS="apps/veer-wonder-world" SPECS="tests/browser/wonder-world-*.spec.ts" tools/remote-acr/run.sh`, or `apps/veer-wonder-world/tools/remote-run.sh` | 20 of 20 runs passed: one run per line of the run list in `tests/browser/wonder-world-lib.ts` (21 spec files in 20 runs). Sixteen ran at `7e1986801` (fan-out `20261029T172337Z`), `first-frame-build` again at `2ae4125d1` (`20261029T174544Z`) and the three character sheets at `498c32f63` (`20261029T182623Z`), each with a clean tree. Those three commits differ only in browser spec files (`git diff --stat 7e1986801 498c32f63`), so every run tested the same app; the runs of one fan-out share one image. Run IDs: `wonder-audio-and-pausing-20261029T172337Z`, `wonder-characters-20261029T182623Z`, `wonder-characters-2-20261029T182623Z`, `wonder-characters-3-20261029T182623Z`, `wonder-consumer-smoke-20261029T172337Z`, `wonder-first-frame-build-20261029T174544Z`, `wonder-look-20261029T172337Z`, `wonder-low-motion-20261029T172337Z`, `wonder-low-motion-2-20261029T172337Z`, `wonder-no-speech-required-20261029T172337Z`, `wonder-no-speech-required-2-20261029T172337Z`, `wonder-parent-panel-20261029T172337Z`, `wonder-playback-activities-20261029T172337Z`, `wonder-playback-episodes-20261029T172337Z`, `wonder-playback-episodes-2-20261029T172337Z`, `wonder-stills-20261029T172337Z`, `wonder-stills-2-20261029T172337Z`, `wonder-stills-3-20261029T172337Z`, `wonder-stills-4-20261029T172337Z`, `wonder-touch-and-layout-20261029T172337Z`. Each run's `summary.json` and `acr-run.log` are in `tests/reports/remote-acr/<RUN_ID>/` (local, gitignored); the kept records and screenshots are in `evidence/veer-wonder-world/` (see Evidence folders). The issues the earlier runs found, and their fixes, are the issue log in `evidence/veer-wonder-world/p1/README.md` |
| Build and deploy check | `tests/browser/wonder-world-build.spec.ts` on the remote runner (`apps/veer-wonder-world/tools/remote-run.sh build`): Vite build, then `aura3d check-deploy --dist dist --no-assets --browser --route /` | `wonder-first-frame-build-20261029T174544Z`: content lint exit 0; Vite build 1002 files, 56.5 MB; privacy scan of the served `dist`: 25 text files, 0 source maps, 0 hits; `check-deploy --browser` exit 0: "Deploy check passed. Browser pass: 1 route(s) loaded with no HTTP errors, failed requests or console errors." (records in `evidence/veer-wonder-world/p0/`) |
| Renderer string | Remote run report | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`, HeadlessChrome 147.0.7727.15 on Linux x86_64 (every record's `renderer`). A software WebGL2 result is not real-GPU or device evidence |
| Evidence folders | `evidence/veer-wonder-world/{p0,p1,p2}/` | `evidence/veer-wonder-world/README.md`, `p0/README.md` (build, deploy check, first frame, consumer smoke), `p1/README.md` (J15: runs, route health, pilot stories, touch, audio, low motion, grown-up panel, character sheets, look, issue log; `p1/look-dev.md`) and `p2/README.md` (the other 14 episodes and 9 activities), with the screenshots and JSON records under `<phase>/screens/2026-10-29/<run>/`. No child image or audio: every screenshot is the app's own 3D scene or UI, and no recording is kept. The records name no child: the specs and `tools/extract-remote-evidence.mjs` redact the app folder to `<app>` (a search of the evidence for the name the folder carries finds none) |
| Temporary cloud resources | ACR image tags and anything else created | One ACR image tag per fan-out (`aura3d-playwright:wonder-suite-<stamp>` in `picassostagingacr`, az-auraone-gurbaksh), shared by that fan-out's runs and deleted with `az acr repository delete` once they finished, for every fan-out of 2026-10-29. Afterwards `az acr repository show-tags -n picassostagingacr --repository aura3d-playwright` lists no `wonder-` tag (0, checked after the last run), and none of this build's ACR task runs is still running. Nothing else was created |
| Preview deploy (O6, O7, O8) | `apps/veer-wonder-world/tools/deploy-preview.sh --prod <commit>`; then `apps/veer-wonder-world/tools/remote-run.sh live` | Current production deployment `dpl_2WbTkXTiPBrR6vS867ZnFXB3Xwzw` of commit `a71c82708`, served at both preview addresses (in the Vercel project, not in this repository). It has the welcome (O8) with the layout fixes of B39 and the cloud-browser review's follow-ups, the white button labels, the static splash, the stage boot after the first frame, the build-variable guard, the Safari 15 build target and the browser check of B38 (0 class static blocks in the served scripts), the song levels of B36, the JPEG normal maps of B37 and the 15-minute download cap of B21. Earlier deployments: `dpl_H5yArKAQaUmqpxsx6XE6KoU8SUiq` (`216a19967`), `dpl_Cj4Rj6Q4ph8Zy8TLBipdnq8G1C7Z` (`633f58a73`) and `dpl_8XbRzzj7pe1L3pGhcQT5kdKG2xoY` (`deabb582a`). Clean rollback target, with no welcome name: `dpl_GJbSPpKFmZ9Gcmw6aGcCZe5V4Gbn` (`e992aa822`). The first deployment, whose bundle inlined the deploy host's variables, has been removed. Gates on the deploy host for each deploy: content lint; Vite build; `check-dist` (0 source maps, 0 name hits besides the one welcome literal, 0 host variables, 0 class static blocks, noindex kept); static check-deploy. On both addresses: 200 and `X-Robots-Tag: noindex, nofollow` on every response, `no-cache` on the page, immutable hashed assets and 404 for a missing file; the custom domain has a Let's Encrypt certificate. Independent verification of the first deployment matched all 1,002 served files to the repo by sha256 and found the variable leak that `e992aa822` fixed. Live and remote runs: `evidence/veer-wonder-world/deployments.md` |
| Task IDs done | `04` A, F0, B, C, D, E, F, G, H, I, J | Section 4.4: every task ID with its evidence; PR #1398 lists them (M1). Open: J15 and the art/media device box (device runs, 4.3 item 1); K01-K06 out of scope (P3, off) |

### 4.3 Open acceptance items (the two an agent cannot do, `MASTER-PROMPT.md` §9)
1. **Physical-device runs** (`06` G9, §5 and §8; `03` §10 "phone + tablet"; `04` art/media acceptance). Steps for the owner:
   1. Build the app and serve the built `dist` at a private address the devices can reach. That can be the owner's machine on the local network, or a non-public preview the owner approves. Keep `noindex`, and do not list the URL anywhere. The unlisted preview (O6; its address is in the Vercel project, not in this repository) already serves the merged build, so the devices can open it directly.
   2. On an iPad with Safari (portrait and landscape), an iPhone with Safari, an Android phone with Chrome and desktop Chrome:
      - tap to start sound;
      - play E17 and G03 in Play Together;
      - play one episode in Watch & Sing with no input to the end;
      - press "All done" in the middle of a beat;
      - switch reduced motion, captions and music;
      - send the tab to the background during a line and come back;
      - turn the sound off (mute switch) and check the captions path;
      - tap fast and repeatedly;
      - tap the largest targets one-handed and a little off-centre (`06` QA-A07).
   3. Record each device in `evidence/veer-wonder-world/p1/devices/<device>.md`: model, OS, browser version, the renderer string from `?diag=1`, smoothness, audio, touch and any console error. Use screen recordings without people in them, and no child image or audio.
   4. For a desktop real-GPU capture, add a `wonder-world` entry to `tools/real-gpu/scenarios.json` (`path`, `settleMs`, `steps`). Then run `REAL_GPU_HEADLESS=false REAL_GPU_BASE=<private URL> tools/real-gpu/run.sh wonder-world` on the owner's Mac. Results land in `evidence/real-gpu/<date>/`.
   5. Optional, with caregiver consent: the short co-play observation of `06` §8. Take notes only; record no audio or video by default.
   6. Listen while playing (an agent cannot judge recorded sound by ear):
      - the letter clips `e03.letter.2`, `e03.ball-sound.1`, `e03.little-b.1`, `e03.little-b.2`, `e04.letter.2`, `e04.a-sound.1` and `e04.little-a.1` (`apps/veer-wonder-world/src/assets/audio/en/lines/`): each letter name is the name ("Bee", "Ay"), each sound is short with no added vowel, and the lowercase lines say the name (B30; `06` creative checklist);
      - narration clarity on the phone speaker and on modest headphones (`06` QA-A02);
      - whether the songs, voices, sound effects and motion together stay calm and never overwhelm (`06` §6 "audible mix must be reviewed by human", `06` creative checklist);
      - the pace of E01, E17 and G03. The measurement in section 2.1 ("Pace of the recorded voice") already shows slow, quiet episodes with natural-rate lines; if a line still sounds fast, lower `speed` in `tools/gen-audio.ts` and run it for lines only (843 lines, about 15,200 characters on the paid key).

   Until these runs pass, the label stays `prototype` and the performance baselines of `06` §6 stay unset.
2. **Public release decision** (`MASTER-PROMPT.md` §0.5). It is a separate owner decision. Before any public release:
   - external privacy/legal review for children's privacy rules (`01` §8, `06` §10);
   - a real trademark search for "Wonder World" and the six character names (`02` §1);
   - a legal check of the Meshy and ElevenLabs terms for public redistribution;
   - re-render every free-tier or unknown-tier audio file on a paid tier (C9; none today, all 907 files are `starter`);
   - a human SLP and caregiver review before any educational wording (`01` §7, `06` §8);
   - real-device evidence (item 1);
   - the family's OK for Sheru, the "family-dog-inspired" character (`02` §2), to appear under that name (the build uses no photo, recording or likeness of a real dog);
   - if Punjabi is ever enabled, a native speaker's review of `pa.ts` first (`04` C08; it ships disabled, B16);
   - set `WELCOME_NAME` in `apps/veer-wonder-world/src/personal.ts` to null, so the welcome names no child (O8), and drop the custom domain that carries the name (O7);
   - no efficacy or therapy claim.

   Only after the owner decides: remove `noindex` and add the app to:
   - `docs/workflows/game-names.md`;
   - `tools/site/games.catalog.json`, then run `node tools/site/gen-game-inventory.mjs`;
   - `showcaseRoutes` in `marketing/scripts/build-showcase-routes.mjs`;
   - the sitemap route manifest in `marketing/scripts/gen-seo.mjs`.

   Then run `node marketing/scripts/check-site.mjs` and `aura3d check-deploy --release`.

### 4.4 Task IDs (`04`)
Checked against the final tree. A run ID `wonder-<stem>-<stamp>` is the final remote run of `tests/browser/wonder-world-<stem>.spec.ts` (section 4.2; `first-frame` and `build` share the run `wonder-first-frame-build-<stamp>`). Open: J15 and the art/media device box (both need the device runs, section 4.3 item 1); K01-K06 are P3, out of scope and off (`MASTER-PROMPT.md` §0.1, `04` §L step 5).

**A, F0 (P0 foundation)**
- A01 done: `package.json` scripts and `workspace:*`; `tools/published-deps.json` pins 4.5.0.
- A02 done: strict `tsconfig.json` and `tsconfig.published.json` (both `tsc --noEmit` exit 0); `tests/unit/privacy/source-guards.test.ts` (no casts outside four reviewed).
- A03 done: `vite.config.ts` extends the root config (`base: "./"`, no inlining, no source maps); smoke build `wonder-first-frame-build-20261029T174544Z`.
- A04 done: `index.html` roots, `src/ui/start-screen.ts`; nothing audible before the tap (`tests/unit/runtime/audio-mixer.test.ts`, `wonder-audio-and-pausing-20261029T172337Z`).
- A05 done: `src/main.ts` thin bootstrap; `createGame` from `@aura3d/engine/game` in `src/scenes/stage.ts`.
- A06 done: `createApp` in `src/app.ts` composes everything; `dispose()` on `pagehide`.
- A07 done: `src/types.ts` id and tagged unions; `ParentSettings` has no identity field.
- A08 done: generated `src/aura-assets.ts` (`tools/gen-aura-assets.mjs`); regenerate-and-diff in `tools/check-all.sh` (§4.1).
- A09 done: 54 GLBs with sha256, licence and optimize provenance; module-relative URLs; raw Meshy output in ignored `/artifacts/`.
- A10 done: HDRI looks, no vignette, runtime effects off, `warmPrograms`, `renderPath`; captures `wonder-look-20261029T172337Z`, `wonder-first-frame-build-20261029T174544Z`.
- A11 done: `apps/veer-wonder-world/README.md` (install script c2888a2f6, commands, flow, status, known gaps).
- F0.1 done: §4.1 row "Scaffold (`04` F0.1)"; `wonder-consumer-smoke-20261029T172337Z`.
- F0.2 done: engine 4.5.0 in §4.1; `wonder-first-frame-build-20261029T174544Z` and `wonder-consumer-smoke-20261029T172337Z` with the commit under test in each record (e3a87adab).
- F0.3 done: published typecheck exit 0; imported names in `docs/api/` or `docs/agents/`; `createGame` only from `@aura3d/engine/game`.
- F0.4 done: `wonder-first-frame-build-20261029T174544Z` draws E17's admitted Momo and Sheru GLBs and records the route-health capture.
- F0.5 done: unlock and silent-fallback unit tests; `wonder-audio-and-pausing-20261029T172337Z`, `wonder-no-speech-required-20261029T172337Z`.
- F0.6 done: `evidence/veer-wonder-world/p0/README.md` (build, check-deploy, first-frame, consumer smoke); prototype label.

**B, F1 (runtime)**
- B01 done: `src/runtime/episode-director.ts` pure machine; `tests/unit/runtime/episode-director.test.ts`.
- B02 done: `src/runtime/beat-runner.ts` timing from content; skip test.
- B03 done: 5 s default, 3-8 s setting, no wrong-answer branch; SLP review = §2.1.
- B04 done: 1.4x hit boxes, 128 px rects, shared 400 ms debounce, pointerdown only; `wonder-touch-and-layout-20261029T172337Z`.
- B05 done: `src/runtime/narration-player.ts` play/stop/pause/resume/replay/timing on the shared context.
- B06 done: one `AudioContextManager` lent to `createGame`; SFX through the mixer, not a cue bank (B23).
- B07 done: clips only from `MODEL_INFO` (none, C6); procedural fallback; talking pulse; wait and surprise gestures (B20).
- B08 done: `src/runtime/session-gate.ts`, `src/runtime/pause-reasons.ts`; All done; no auto-next; `wonder-audio-and-pausing-20261029T172337Z`.
- B09 done: current and next story preload; timeouts fall back to stand-ins or caption timing.
- B10 done: `src/runtime/locale.ts` keyed packs with English fallback.
- B11 done: `src/runtime/feature-flags.ts` locked-off flags; `wonder-no-speech-required-20261029T172337Z`.
- B12 done: `src/qa/install-hooks.ts` standard hooks; no private data in `state()`.
- F1.1 done: one tap/confirm dispatcher; per-beat targets replace the fixed verb set (B24).
- F1.2 done: golden director tests; context loss in `tests/unit/runtime/pause-reasons.test.ts`.
- F1.3 done: Aura3D loop, presenter, `createGame`, QA hooks and safety net; SFX via the mixer (B23); no black-frame guard by design.
- F1.4 done: only public `@aura3d/*` imports; `.glb` names only in generated or never-imported files.
- F1.5 done: one key per caption and clip; stale-clip lint; no overlapping lines; `wonder-audio-and-pausing-20261029T172337Z`.
- F1.6 done: no speech, score or correctness event; no microphone or recognition API.

**C (content)**
- C01 done: `validateStory` in `src/content/schema.ts`.
- C02 done: static 20 + 12 catalog; `review: "approved"`; lint before build.
- C03 done: `WordInfo` in `src/content/words.ts`.
- C04 done: `src/content/letters.ts` names, sounds, objects; name never equals sound.
- C05 done: counting fixed at 1-3 in `src/content/numbers.ts`.
- C06 done: `src/content/songs.ts` (ids, lyrics, motions, `SONG_RIGHTS`); song choreography in `src/scenes/stage.ts` (B20).
- C07 done: `src/localization/en/**` holds every line and string.
- C08 done: `src/localization/pa.ts` ships empty and disabled until native review (B16).

**D (characters, worlds, media)**
- D01 done: `src/characters/momo.ts` procedural actor; clips only from `MODEL_INFO`.
- D02 done: `src/characters/lulu.ts` procedural actor; talking pulse, no lip sync.
- D03 done: `src/characters/sheru.ts` unrigged GLB with walk bob, wag, sniff, fetch, carry and bark bank; rights and privacy agent-reviewed (§2.3, §2.4); the family's OK before any release is §4.3 item 2.
- D04 done: `src/characters/peeko.ts` hide, pop and wave.
- D05 done: `src/characters/lumi.ts` float and soft glow, steady in reduced motion; letter and object cues in E03.
- D06 done: `src/characters/gogo.ts` with the admitted `gogo` and `gogoCarriage`; no turning wheels or doors (B25).
- D07 done: `src/characters/character-registry.ts` typed models, permitted clips, procedural fallback (tested).
- D08 done: `src/scenes/meadow.ts`; fixed camera presets; `wonder-first-frame-build-20261029T174544Z`, `wonder-touch-and-layout-20261029T172337Z`.
- D09 done: `src/scenes/music-garden.ts` with the quiet `gardenBed`; `wonder-look-20261029T172337Z`.
- D10 done: `src/scenes/home-nook.ts` generic room; `wonder-look-20261029T172337Z`.
- D11 done: `src/scenes/station.ts` track, station, tunnel; passengers are separate props; `wonder-look-20261029T172337Z`.
- D12 done: `src/scenes/peekaboo-barn.ts` with E02's two doors and slow reveals; `wonder-look-20261029T172337Z`.
- D13 done: `src/scenes/learning-cloud.ts` with E03's letter objects and G08's counted blocks; `wonder-look-20261029T172337Z`.
- D14 done: generated `src/assets/rights-manifest.ts` (B27; `tests/unit/content/rights-manifest.test.ts`).
- D15 done: 907 MP3s from ElevenLabs premade voices via Kiro Prism, loudness-normalised, paid tier, indexed in `src/audio-manifest.ts`.
- D16 done: 54 model and 907 audio provenance records, enforced by the content lint.

**E (UI)**
- E01 done: big highlighted scene targets (1.4x hit box, 128 px minimum); only grown-up controls in corners; `wonder-touch-and-layout-20261029T172337Z`.
- E02 done: the finite, P1-first menu of all 32 stories with no recommendations, each card with its host's portrait (six WebP crops of the remote character sheets `wonder-characters-20261029T163852Z`, `wonder-characters-2-20261029T163852Z` and `wonder-characters-3-20261029T163852Z`; `src/portrait-assets.ts`, `provenance/portraits.json`); `wonder-parent-panel-20261029T172337Z` checks all 32 portraits loaded.
- E03 done: `src/ui/parent-panel.ts` switches, exit, language; `wonder-parent-panel-20261029T172337Z`.
- E04 done: `src/ui/parent-gate.ts` 2 s hold, "not a lock", back-out paths; `wonder-parent-panel-20261029T172337Z`.
- E05 done: `src/ui/offline-card.ts`, no timer, no auto-next; `wonder-audio-and-pausing-20261029T172337Z`.
- E06 done: `src/ui/styles.css` safe areas, large taps, contrast, both orientations, calm motion; `wonder-touch-and-layout-20261029T172337Z`.
- E07 done: `src/ui/parent-wordlist.ts` five catalog words on the device, no claims; `wonder-parent-panel-20261029T172337Z`.
- E08 done: `src/ui/accessibility.ts` labels, focus, live regions; captions live region; `wonder-parent-panel-20261029T172337Z`.

**F, G (P1 stories)**
- F01 done: E01 ah/oh/mmm with gestures and the mirror reflection (B31); `wonder-playback-episodes-20261029T172337Z`, `wonder-stills-20261029T172337Z`.
- F02 done: E02 gentle door reveal, hi/open/bye, point-or-tap tip; `wonder-playback-episodes-20261029T172337Z`.
- F03 done: E09 one animal sound per beat, slow rhythm; `wonder-playback-episodes-20261029T172337Z`.
- F04 done: E17 golden beats, two song rolls on cues, real-ball card; `wonder-first-frame-build-20261029T174544Z`, `wonder-touch-and-layout-20261029T172337Z`, `wonder-playback-episodes-2-20261029T172337Z`.
- F05 done: E06 clap/stomp/go/stop, cued freeze, dance-break tip; `wonder-playback-episodes-20261029T172337Z`.
- F06 done: E05 1-3 count, "One more?", "All gone!", no quiz; `wonder-playback-episodes-20261029T172337Z`.
- G01 done: bubble taps, three in view, finite outro; tap test for all stories; `wonder-no-speech-required-2-20261029T172337Z`.
- G02 done: tap to go and stop, no speech, finite; `wonder-playback-activities-20261029T172337Z`.
- G03 done: tap, roll, fetch, return, more or end, real-ball bridge; `wonder-playback-activities-20261029T172337Z`.

**H, I (P2 stories)**
- H01 done: E03 big B and little b, name apart from sound; `wonder-playback-episodes-20261029T172337Z`.
- H02 done: E04 letter carriage, big A and little a, apple reveal, finite; `wonder-playback-episodes-20261029T172337Z`.
- H03 done: E07 red and blue with a ball each; `wonder-playback-episodes-20261029T172337Z`.
- H04 done: E08 under, out, in and behind; `wonder-playback-episodes-20261029T172337Z`.
- H05 done: E10 apple, banana, eat, more, all done; `wonder-playback-episodes-20261029T172337Z`.
- H06 done: E11 one balloon per spoken number; `wonder-playback-episodes-2-20261029T172337Z`.
- H07 done: E12 circle-plate, square-block, triangle-party hat (B26); `wonder-playback-episodes-2-20261029T172337Z`.
- H08 done: E13 harmless mix-ups, hat, hands, feet; `wonder-playback-episodes-2-20261029T172337Z`.
- H09 done: E14 look and find under, behind, in; `wonder-playback-episodes-2-20261029T172337Z`.
- H10 done: E15 separate episode, three bubbles, three animals; `wonder-playback-episodes-2-20261029T172337Z`.
- H11 done: E16 count three, one candle flame that goes out and relights (B22); `wonder-playback-episodes-2-20261029T172337Z`.
- H12 done: E18 generic friends, no family voices (B17); `wonder-playback-episodes-2-20261029T172337Z`.
- H13 done: E19 wake (sun), wash, eat, brush (toothbrush), sleep; `wonder-playback-episodes-2-20261029T172337Z`.
- H14 done: E20 fixed two-toy micro-stories, no generated speech; `wonder-playback-episodes-2-20261029T172337Z`.
- I01 done: G04 door, three animals with sounds, finite rounds; `wonder-playback-activities-20261029T172337Z`.
- I02 done: G05 both foods offered at once, more, all done; `wonder-playback-activities-20261029T172337Z`.
- I03 done: G06 water, wash, dry by taps; `wonder-playback-activities-20261029T172337Z`.
- I04 done: G07 into the lift, one floor per tap, out; `wonder-playback-activities-20261029T172337Z`.
- I05 done: G08 count three blocks, tumble, repeat; `wonder-playback-activities-20261029T172337Z`.
- I06 done: G09 generic friend at the door, no family pack (B17); `wonder-playback-activities-20261029T172337Z`.
- I07 done: G10 drum, shaker and clap turns; `wonder-playback-activities-20261029T172337Z`.
- I08 done: G11 tap-to-open flowers, no microphone; `wonder-playback-activities-20261029T172337Z`, `wonder-no-speech-required-2-20261029T172337Z`.
- I09 done: G12 show a toy, pause, grown-up confirm, real-toy end; `wonder-playback-activities-20261029T172337Z`.

**J (tests and evidence)**
- J01 done: `tests/unit/runtime/episode-director.test.ts`.
- J02 done: `tests/unit/runtime/turn-taking.test.ts`.
- J03 done: `tests/unit/runtime/touch-router.test.ts`; visible-target lint test.
- J04 done: `tests/unit/runtime/narration-player.test.ts`.
- J05 done: `tests/unit/content/content-schema.test.ts`.
- J06 done: `tests/unit/content/letters-and-counts.test.ts`.
- J07 done: `tests/unit/privacy/no-child-data.test.ts`; bundle scan in `wonder-first-frame-build-20261029T174544Z`.
- J08 done: `wonder-first-frame-build-20261029T174544Z`.
- J09 done: `wonder-playback-episodes-20261029T172337Z`, `wonder-playback-episodes-2-20261029T172337Z`, `wonder-playback-activities-20261029T172337Z`.
- J10 done: `wonder-touch-and-layout-20261029T172337Z`; safe-area CSS unit test (device notches: §4.3 item 1).
- J11 done: `wonder-audio-and-pausing-20261029T172337Z`.
- J12 done: `wonder-no-speech-required-20261029T172337Z`, `wonder-no-speech-required-2-20261029T172337Z`.
- J13 done: `wonder-low-motion-20261029T172337Z`, `wonder-low-motion-2-20261029T172337Z`; SFX guard in `tests/unit/runtime/audio-mixer.test.ts`.
- J14 done: `tools/validate-wonder-world-content.mjs` passes; runs before every build and in `tools/check-all.sh`.
- J15 open: `evidence/veer-wonder-world/p1/README.md` holds the remote evidence, but actual device reports need the physical-device runs (§4.3 item 1).
- J16 done: `apps/veer-wonder-world/DEPLOYMENT.md` (owner, build, checks, hosting, caching, rollback, no-PII logging).

**K (P3 voice, out of scope and off)**
- K01-K06 open: not in this build. `src/runtime/voice-input.ts`, `sound-presence-detector.ts`, `src/ui/voice-permission-dialog.ts` and `tests/browser/voice-permissions.spec.ts` do not exist, `08-optional-voice-validation.md` is not created (as planned), `src/runtime/feature-flags.ts` locks `voiceInput` and `soundPresence` off, and no ASR ships (`tests/unit/privacy/no-child-data.test.ts`).

**Unlabelled boxes** (content lint, art and media, definition of done; numbered in file order)
- Lint-1 done: the content lint resolves beat, word, line, clip, gesture and song-cue references for all 32 stories.
- Lint-2 done: `src/content/schema.ts` target-word, invite, greeting/outro and offline/bridge checks.
- Lint-3 done: letter and counting checks; no translated script ships (B16).
- Lint-4 done: `npm run build` runs the content lint first (b7d081afc); `wonder-first-frame-build-20261029T174544Z`.
- Art-1 done: characters and 48 other models are typed GLBs; the ball, balloon, B20 props and party hat are scene geometry, not production art (B26).
- Art-2 done: `wonder-characters-20261029T182623Z`, `wonder-characters-2-20261029T182623Z`, `wonder-characters-3-20261029T182623Z` (320x568 silhouettes, six poses), `wonder-touch-and-layout-20261029T172337Z` (ball at 390x844).
- Art-3 done: reduced motion, neutral settle, SFX lint and caps; `wonder-low-motion-20261029T172337Z`, `wonder-low-motion-2-20261029T172337Z`.
- Art-4 open: inspection on a physical tablet and phone is §4.3 item 1.
- Art-5 done: owner, licence and provenance records for every shipped file (`src/assets/rights-manifest.ts`, `provenance/`), agent rights review §2.3; the legal check of provider terms for public release is §4.3 item 2.
- M1 done: every file 04 names exists on `feat/wonder-world-foundation-20261029` (the K files aside), and PR https://github.com/auraoneai/aura3d/pull/1398 (open, not merged) lists the task IDs, with this section as the map to files and evidence.
- M2 done: both typechecks exit 0; no casts outside the reviewed list; hashes checked by the lint.
- M3 done: 522 unit tests in 24 files pass; the content lint passes.
- M4 done: `wonder-first-frame-build-20261029T174544Z`, `wonder-stills-20261029T172337Z` to `wonder-stills-4-20261029T172337Z`, `wonder-touch-and-layout-20261029T172337Z`, `wonder-audio-and-pausing-20261029T172337Z`.
- M5 done: unit tests plus `wonder-no-speech-required-20261029T172337Z`, `wonder-no-speech-required-2-20261029T172337Z`, `wonder-low-motion-20261029T172337Z`, `wonder-low-motion-2-20261029T172337Z`, `wonder-parent-panel-20261029T172337Z`.
- M6 done: redacted records in `evidence/veer-wonder-world/{p0,p1,p2}/README.md`; sign-off is the agent review in §2; device proof is J15 and §4.3 item 1.
- M7 done: every status line says in build or prototype (`05` line 2 "BUILT AS A PROTOTYPE"); labels in `06` §1.
