# Wonder World (prototype)

Wonder World is a toddler co-play app built on Aura3D 4.6.2: short 3D cartoon stories and tap games that a grown-up plays alongside a young child. The folder keeps the working name `veer-wonder-world`; the public title is **Wonder World**. No child's name appears in the app's routes, logs, story lines or strings; the one exception, at the owner's request, is the start screen's welcome, which takes the name from `WELCOME_NAME` in `src/personal.ts` (07 O8; set it to null to remove it).

**Status: prototype.** It is play and language exposure, not therapy. It does not test, score, diagnose or teach a child to talk, and nothing here supports an efficacy claim. It runs as an unlisted preview, deployed at the owner's request on 2026-10-29. This repository is public, so the address is not written here; see [DEPLOYMENT.md](DEPLOYMENT.md) section 3. Every response carries `noindex`, it is not in the public site build, catalog, showcase index or sitemap, and publishing it is a separate owner decision ([DEPLOYMENT.md](DEPLOYMENT.md)). The specification is [`docs/prds/veer-wonder-world/`](../../docs/prds/veer-wonder-world/README.md); decisions and results are recorded in [`07-autonomous-decisions-and-build-record.md`](../../docs/prds/veer-wonder-world/07-autonomous-decisions-and-build-record.md).

## What is in it

- Seven recurring original characters driven by structured character sheets (`src/characters/sheets/*.json` → `tools/gen-cast.mjs`): Momo (host), Lulu, Sheru (friendly barks only), GoGo, Lumi, Peeko, and Tiko (unhurried little turtle counter and observer).
- Eight worlds: six daytime worlds (Momo Meadow, Lulu Music Garden, Home Nook, GoGo Station, Peeko Peekaboo Barn, Lumi Learning Cloud) plus two calm bedtime worlds (Moonlit Nursery, Starlight Cloud).
- Interactive short episodes (`src/content/episodes/`), tap activities (`src/content/activities/`), and multi-segment long-form broadcast shows (`ShowSpec` in `src/content/shows/`), with English copy in `src/localization/en/`.
- Co-play and broadcast modes: **Watch and sing** (plays with zero required input), **Play together** (the same story with one or two generous tap targets at each turn), and **Broadcast** (`?broadcast=1`, 16:9 1920×1080 linear episode playback with UI chrome hidden and `invite` beats held as timed `PAUSE` beats).
- 73 original sculpted procedural `@aura3d/engine` stage rigs (`src/scenes/procedural-rigs/`, catalogued in `tools/wonder-assets.json` — zero external `.glb` files) and paid-tier ElevenLabs audio files (voice lines, original songs, music beds, and sound effects generated via Kiro Prism), each backed by a build-verified provenance and rights record (`src/assets/rights-manifest.ts`).

## Safety rules the code holds

- No microphone, no speech recognition and no scoring. The voice-input flags in `src/runtime/feature-flags.ts` are locked off, and `tests/unit/privacy/no-child-data.test.ts` (J07) fails if a microphone API appears anywhere in `src/`.
- Silence always completes a story: every wait ends by itself after the parent's waiting time (default 5 s), with no "wrong" or "try again" path.
- At most two tap targets at a time, each a large, generous hit area.
- "All done" works from every screen and every beat and ends on a calm offline-play card ("All done! Now try ..."). Nothing ever plays the next story by itself.
- Leaving the tab pauses the story. Coming back keeps it paused until a grown-up taps Resume.
- No flashing, camera shake or startling sound: looks have no vignette, glows fade in and out, the camera eases between fixed framings, and sound effects sit below speech.
- No account, no analytics, no ads, no purchases and no network call besides the app's own same-origin files. Parent settings stay on the device and can be cleared in the parent panel.

## App flow

1. **Start screen.** A grown-up reads the short note, picks a mode and taps "Tap to start". That tap is the only thing that unlocks sound; if sound cannot start, the stories run on captions with a short notice.
2. **Menu.** Stories and games in canonical order, with no algorithmic recommendations. If the 3D stage cannot start on the device (no WebGL2, a blocked GPU), the menu says so in a calm status line.
3. **Story.** The stage builds the world from sculpted procedural `@aura3d/engine` rigs (or lightweight primitive stand-ins when `?models=0`), warms its shader programs, fades in and the director starts. Small grown-up controls sit in the top corners: All done; "Your child had a turn" (the parent confirm, enabled only while a turn waits: when the child points, looks or makes a sound, the story answers as for a tap on the glowing object, and nothing is judged); Pause or Resume; Replay word; and the grown-up settings behind a 2-second hold (ordinary UX, not a lock).
4. **Offline card.** The story's real-world activity, with the story's caregiver bridge (`<code>.bridge`) in small type under it. Its button returns to the menu.

## How the code fits together

| File | Role |
| --- | --- |
| `src/main.ts` | Thin bootstrap: the `@aura3d/debug` safety net (no self-heal reload), page switches (including `?broadcast=1`), saved settings, `createApp`, QA hooks |
| `src/app.ts` | The shell: screens, the per-story and `ShowSpec` broadcast runner, director effect routing, pause rules, audio unlock, the story clock |
| `src/qa/install-hooks.ts` | `window.__AURA_WONDER_WORLD__` QA hooks (`advanceTo`, `eventLog`, and standard/story controls below) |
| `src/runtime/` | Episode director, beat timing, turn-taking (including broadcast `PAUSE` beats), touch router, narration player, audio mixer, event log, session gate, locale, flags, animation director |
| `src/scenes/` | The stage (the one `createGame` from `@aura3d/engine/game`), the eight worlds, sculpted procedural rigs (`src/scenes/procedural-rigs/`), articulated sub-part drivers, looks, spots, motion and stand-ins |
| `src/characters/` | Data-driven character sheets (`src/characters/sheets/*.json`), generated cast table (`src/characters/generated-cast.ts`), and the seven procedural character profiles and registry |
| `src/ui/` | Start screen, menu, child controls, captions, parent gate and panel, offline card, settings store, styles |
| `src/content/`, `src/localization/` | Episode, activity and multi-segment `ShowSpec` show data, the content schema and validators, the word, letter, number, song, sound and music tables, the English pack |
| `src/aura-assets.ts`, `src/audio-manifest.ts`, `src/characters/generated-cast.ts`, `src/assets/rights-manifest.ts` | Generated asset, cast and rights modules (never edited by hand) |

**Time.** One story clock moves in fixed 50 ms steps (`createFixedStepLoop`), only while a story runs and nothing pauses it. Each step ticks the episode director, then the clock, which also drives the narration player's caption timing. The stage animates every frame on that clock as presented by `createFixedStepPresenter`, so motion is smooth at any refresh rate and never drifts from the story. No app code reads a wall clock or a random number.

**Audio.** One `AudioContextManager`, owned by the mixer (`src/runtime/audio-mixer.ts`) and lent to `createGame` through `mixer.gameSoundOptions()`. Recorded voice lines play through the app's narration player on that context, never through `GameAudio` cues. Music ducks under speech.

**Talking.** Every speaking character rig carries an articulated procedural `jaw` or `beakLower` sub-part (plus `cheekPuff`, eyelids, and gentle head/body motion). Spoken lines drive mouth openness from precomputed ElevenLabs character-alignment viseme tracks (`/with-timestamps`), falling back automatically to the 20 Hz RMS speech-envelope curve when alignment data is absent, and resting closed in silence. This is stylized cartoon mouth articulation, never a clinical articulatory or speech-therapy model.

## Checks

The local checks use the published 4.6.2 packages, not the workspace. Install them once from the repo root:

```bash
apps/veer-wonder-world/tools/install-published-deps.sh   # tools/published-deps.json -> artifacts/wonder-deps/, linked as node_modules
```

The app's own `package.json` uses `workspace:*`, which npm cannot install, so the set lives in `tools/published-deps.json`. The monorepo checks below (`pnpm exec tsc`, the root vitest) need only the root `pnpm install`.

From the app folder, everything that runs locally (no browser, no monorepo-wide build):

```bash
cd apps/veer-wonder-world
./node_modules/.bin/tsc -p tsconfig.published.json --noEmit      # against the published 4.6.2 typings
./node_modules/.bin/vitest run --config vitest.config.ts         # unit tests, including J01-J07
node tools/validate-wonder-world-content.mjs                     # J14: every story, line, word, asset and rights record
node tools/game-checks.mjs                                       # the repo's per-game static checks, for this unlisted prototype
tools/check-all.sh                                               # all of the above, plus the generated-files diff
tools/check-all.sh --workspace                                   # also the strict typecheck against the workspace sources
```

From the repo root, the same strict checks the build record uses:

```bash
pnpm exec tsc -p apps/veer-wonder-world/tsconfig.json --noEmit
node apps/veer-wonder-world/tools/gen-cast.mjs && node apps/veer-wonder-world/tools/gen-aura-assets.mjs && node apps/veer-wonder-world/tools/gen-audio-manifest.mjs && node apps/veer-wonder-world/tools/gen-rights-manifest.mjs && git diff --exit-code apps/veer-wonder-world/src
```

Browser specs (J08-J13) and the production build with `aura3d check-deploy --browser` run only on the remote runner, never on a developer Mac. One run takes the spec files named by their stems; the runner stops a run at 60 minutes, so run one line of the list in `tests/browser/wonder-world-lib.ts` per run (22 spec files in 21 runs):

```bash
apps/veer-wonder-world/tools/remote-run.sh first-frame build       # first frame, Vite build, served-bundle privacy scan, check-deploy --browser
apps/veer-wonder-world/tools/remote-run.sh touch-and-layout
apps/veer-wonder-world/tools/remote-run.sh start-screen            # the welcome fits and stays clear at 13 screen sizes
apps/veer-wonder-world/tools/remote-run.sh look                    # look-dev frames of the six worlds (src/scenes/LOOK-BRIEF.md)
```

Results land in `tests/reports/remote-acr/<RUN_ID>/`; copy what you keep into `evidence/veer-wonder-world/`. Software WebGL2 results are not real-GPU or device evidence.

The unlisted preview is hosted on **Cloudflare Pages** as the canonical production host (`aura3d-wonder-world` project, `https://aura3d-wonder-world.pages.dev` and the owner's custom domain in the `auraone.ai` zone; **prefer Cloudflare Pages over Vercel and do not deploy to Vercel**). Build and deploy with:

```bash
bash apps/veer-wonder-world/tools/deploy-build.sh
wrangler pages deploy apps/veer-wonder-world/dist --project-name aura3d-wonder-world --branch main
```

(Legacy script `apps/veer-wonder-world/tools/deploy-preview.sh --prod` is retained only for unit-test compatibility; see DEPLOYMENT.md section 3). Afterwards `apps/veer-wonder-world/tools/remote-run.sh live` opens the deployed address on the remote runner and checks its hosting rules. That spec file is outside the 20-run suite above.

## Running it

The repo dev server used by the browser specs serves the app at `/apps/veer-wonder-world/index.html` and bundles `src/main.ts` with esbuild. A developer can also run `pnpm exec vite apps/veer-wonder-world` from the repo root (`vite.config.ts` extends the root config, so `@aura3d/*` resolves to the workspace sources and the shared `/fonts/` and `/hdri/` files are served).

Page switches:

| Switch | Effect |
| --- | --- |
| `?story=<id or code>` | Opens that story or `ShowSpec` show right after start (`sheru-big-adventure`, `e17`, or a show id) |
| `?mode=watch-sing` or `?mode=play-together` | The interactive play mode for this page load |
| `?broadcast=1` | Broadcast mode: hides all UI chrome, strips `WELCOME_NAME`, locks 16:9 1920×1080 framing, disables input routing, and turns `invite` beats into timed `PAUSE` beats |
| `?autostart=1` | No start screen; sound stays locked until the first real tap |
| `?manual=1` | No live loop: only QA calls (`advance`, `advanceTo`, `stepFrames`) move story time (deterministic captures) |
| `?models=0` | Lightweight primitive stand-ins instead of the full sculpted procedural rigs |
| `?modelWaitMs=N` | Stage readiness timeout in ms (default 10 s, clamped to 1-300 s): for captures on slow software WebGL2 |
| `?reducedMotion=1` | Calm motion for this page load |
| `?audio=0` | No sound at all: captions and caption timing |
| `?seed=N` | Recorded in the QA hooks (the content is deterministic) |
| `?diag=1` | The diagnostics panel (renderer, draw calls, shader and context-loss errors) |

## QA hooks

`installQaHooks("wonder-world", ...)` publishes `window.__AURA_WONDER_WORLD__` (first boot error in `__AURA_WONDER_WORLD_ERROR__`):

- standard: `ready()`, `state()`, `stepFrames(n)` (n fixed 50 ms steps), `reset(seed?)`, `replay(script)`, `begin()`, `traceRow()`, `frame()`, `pixels()`, `info()`, `routeHealth()`, `nodeCount()`;
- Wonder World: `startStory(id, mode)`, `advance(ms)`, `advanceTo(tMs)`, `eventLog()`, `runToEnd(maxMs?)`, `tap(targetId)`, `parentConfirm()`, `pause()`, `resume()`, `allDone()`, `skipBeat()`, `setReducedMotion(on)`, `targetRects()` (viewport CSS px), `diagnostics()`.

`state()` is plain JSON with no child data: `{ screen, storyId, director, targets, speaking, speaker, audio: { unlocked, available }, settings, stage: { drawCalls, nodes, modelsEnabled }, micRequested: false, errors }`. `speaking` is the key of the line being heard, `null` between lines and while paused. With `?manual=1`, lines end on story time only, so a QA run gives the same result every time even when sound is unlocked.

## Assets and audio

**Sculpted procedural rigs and data-driven cast.** All 73 stage assets (`MODEL_KEYS` in `tools/wonder-assets.json`) are original multi-lobe sculpted procedural `@aura3d/engine` rigs in `src/scenes/procedural-rigs/` — the app ships zero external `.glb` files (replacing the retired prototype Meshy GLB pipeline):

1. **Data-driven cast (`src/characters/sheets/*.json`).** Each of the 7 recurring cast characters (`momo`, `lulu`, `sheru`, `gogo`, `lumi`, `peeko`, `tiko`) has a structured JSON character sheet defining display metadata, home world, palette colour, ElevenLabs voice config (`null` for `sheru`), banter role/catchphrases/foils/banned behaviours, and rig traits. `node tools/gen-cast.mjs` validates every sheet and generates `src/characters/generated-cast.ts` (wired through `src/characters/character-registry.ts`).
2. **Procedural stage rigs (`src/scenes/procedural-rigs/`).** Cast rigs (`cast-rigs.ts`, `tiko-rig.ts`), animal rigs, props, and world landmarks are built from organic lathes, curved limbs, and material crafts (`plush`, `felt`, `wood`, `clay`, `lacquer`) with articulated sub-parts (`jaw` / `beakLower`, `eyelidL` / `eyelidR`, `cheekPuff`, limbs, wheels, wings, tails) driven deterministically by `src/scenes/articulated-actors.ts`.
3. **Asset & rights codegen.** `node tools/gen-aura-assets.mjs` generates `src/aura-assets.ts` (`MODEL_KEYS`, `MODEL_INFO` with `procedural: true` for all 73 keys), and `node tools/gen-rights-manifest.mjs` generates `src/assets/rights-manifest.ts` (`MODEL_RIGHTS = []`, 73 `PROCEDURAL_RIGHTS` records, environment HDRIs, character portraits, and audio provenance). Lightweight primitive stand-ins remain available under `?models=0` for fallback testing; a stand-in is never a release claim.

**Audio.** ElevenLabs through Kiro Prism (`/v1/voice/elevenlabs`), with cast voice IDs and synthesis settings read canonically from `src/characters/sheets/*.json`: `./node_modules/.bin/tsx tools/gen-audio.ts` renders `src/assets/audio/{en/lines,songs,music,sfx}/*.mp3`, saves character-level timestamp alignments (`/with-timestamps`) for timed jaw/beak visemes alongside spoken lines (with a 20 Hz RMS envelope fallback), and writes paid-tier provenance records in `provenance/audio/{lines,songs,beds,sfx}.json` (provider, endpoint, voice, prompt, Prism key id, paid plan tier, date). `node tools/gen-audio-manifest.mjs` regenerates `src/audio-manifest.ts` with each file's sha256, measured duration, speech envelope, and optional viseme track, and `node tools/gen-rights-manifest.mjs` verifies that every shipped audio record comes from a paid ElevenLabs tier (never free-tier). Never print `PRISM_API_KEY`.

All bundled audio and portrait assets resolve from same-origin module-relative paths so Vite fingerprints them cleanly without relying on the root `public/` tree.

## Known gaps

- No physical-device runs yet (iPad and iPhone Safari, Android Chrome); browser regression runs use the remote runner, and the label stays `prototype` until physical-device runs pass (`07` section 4.3).
- No public release: that needs the owner's decision, an external privacy and legal review, a trademark search, a check of the provider terms and a human SLP and caregiver review (`07` section 4.3).
- English only in active rotation: the Punjabi pack stays off until a native speaker review. No family greeting packs are built.
- The engine requests the look HDRIs at `/hdri/` and the font stylesheet names `/fonts/`, so a deployed `dist/` must be served at an origin root.
