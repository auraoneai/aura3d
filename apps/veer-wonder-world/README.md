# Wonder World (prototype)

Wonder World is a toddler co-play app built on Aura3D 4.5.0: short 3D cartoon stories and tap games that a grown-up plays alongside a young child. The folder keeps the working name `veer-wonder-world`; the public title is **Wonder World**, and no child's name appears in the app, its routes, its logs or its default lines.

**Status: prototype.** It is play and language exposure, not therapy. It does not test, score, diagnose or teach a child to talk, and nothing here supports an efficacy claim. The route carries `noindex`, it is not in the public site build, catalog, showcase index or sitemap, and publishing it is a separate owner decision ([DEPLOYMENT.md](DEPLOYMENT.md)). The specification is [`docs/prds/veer-wonder-world/`](../../docs/prds/veer-wonder-world/README.md); decisions and results are recorded in [`07-autonomous-decisions-and-build-record.md`](../../docs/prds/veer-wonder-world/07-autonomous-decisions-and-build-record.md).

## What is in it

- Six original characters: Momo (host), Lulu, Sheru (barks only), Peeko, Lumi and GoGo.
- Six worlds: Momo Meadow, Lulu Music Garden, Home Nook, GoGo Station, Peeko Peekaboo Barn, Lumi Learning Cloud.
- 20 episodes (`src/content/episodes/`) and 12 activities (`src/content/activities/`), with their English text in `src/localization/en/`.
- Two modes: **Watch and sing** (the story plays with no input) and **Play together** (the same story, with one or two big things to tap at each turn).
- 53 admitted Meshy models (about 23 MB) and 882 ElevenLabs audio files (826 voice lines, 16 songs, 6 music beds, 34 sound effects; about 22 MB), each with a provenance record.

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
2. **Menu.** The 20 stories and 12 games in canonical order, with no recommendations. If the 3D stage cannot start on the device (no WebGL2, a blocked GPU), the menu says so in a calm status line.
3. **Story.** The stage loads the world (models are preloaded and checked against their sha256; anything missing, slow or broken is drawn as a primitive stand-in), warms its shader programs, fades in and the director starts. Small grown-up controls sit in the top corners: All done; "Your child had a turn" (the parent confirm, enabled only while a turn waits: when the child points, looks or makes a sound, the story answers as for a tap on the glowing object, and nothing is judged); Pause or Resume; Replay word; and the grown-up settings behind a 2-second hold (ordinary UX, not a lock).
4. **Offline card.** The story's real-world activity, with the story's caregiver bridge (`<code>.bridge`) in small type under it. Its button returns to the menu.

## How the code fits together

| File | Role |
| --- | --- |
| `src/main.ts` | Thin bootstrap: the `@aura3d/debug` safety net (no self-heal reload), page switches, saved settings, `createApp`, QA hooks |
| `src/app.ts` | The shell: screens, the per-story runner, director effect routing, pause rules, audio unlock, the story clock |
| `src/qa/install-hooks.ts` | `window.__AURA_WONDER_WORLD__` QA hooks (below) |
| `src/runtime/` | Episode director, beat timing, turn-taking, touch router, narration player, audio mixer, session gate, locale, flags, animation director, model preloader |
| `src/scenes/` | The stage (the one `createGame` from `@aura3d/engine/game`), the six worlds, looks, spots, motion and stand-ins |
| `src/characters/` | The six procedural character actors and their registry |
| `src/ui/` | Start screen, menu, child controls, captions, parent gate and panel, offline card, settings store, styles |
| `src/content/`, `src/localization/` | Story data, the content schema and validators, the word, letter, number, song, sound and music tables, the English pack |
| `src/aura-assets.ts`, `src/audio-manifest.ts` | Generated asset modules (never edited by hand) |

**Time.** One story clock moves in fixed 50 ms steps (`createFixedStepLoop`), only while a story runs and nothing pauses it. Each step ticks the episode director, then the clock, which also drives the narration player's caption timing. The stage animates every frame on that clock as presented by `createFixedStepPresenter`, so motion is smooth at any refresh rate and never drifts from the story. No app code reads a wall clock or a random number.

**Audio.** One `AudioContextManager`, owned by the mixer (`src/runtime/audio-mixer.ts`) and lent to `createGame` through `mixer.gameSoundOptions()`. Recorded voice lines play through the app's narration player on that context, never through `GameAudio` cues. Music ducks under speech.

**Talking.** The models have no mouth morphs, so a character "talks" with a gentle squash-and-bob pulse while its line plays. It is never called lip sync.

## Checks

From the app folder, everything that runs locally (no browser, no monorepo-wide build):

```bash
cd apps/veer-wonder-world
./node_modules/.bin/tsc -p tsconfig.published.json --noEmit      # against the published 4.5.0 typings
./node_modules/.bin/vitest run --config vitest.config.ts         # unit tests, including J01-J07
node tools/validate-wonder-world-content.mjs                     # J14: every story, line, word, asset and rights record
node tools/game-checks.mjs                                       # the repo's per-game static checks, for this unlisted prototype
tools/check-all.sh                                               # all of the above, plus the generated-files diff
tools/check-all.sh --workspace                                   # also the strict typecheck against the workspace sources
```

From the repo root, the same strict checks the build record uses:

```bash
pnpm exec tsc -p apps/veer-wonder-world/tsconfig.json --noEmit
node apps/veer-wonder-world/tools/gen-aura-assets.mjs && node apps/veer-wonder-world/tools/gen-audio-manifest.mjs && git diff --exit-code apps/veer-wonder-world/src
```

Browser specs (J08-J13) and the production build with `aura3d check-deploy --browser` run only on the remote runner, never on a developer Mac:

```bash
apps/veer-wonder-world/tools/remote-run.sh                         # every tests/browser/wonder-world-*.spec.ts
apps/veer-wonder-world/tools/remote-run.sh first-frame touch-and-layout
apps/veer-wonder-world/tools/remote-run.sh build                   # Vite build, served-bundle privacy scan, check-deploy --browser
apps/veer-wonder-world/tools/remote-run.sh look                    # look-dev frames of the six worlds (src/scenes/LOOK-BRIEF.md)
```

Results land in `tests/reports/remote-acr/<RUN_ID>/`; copy what you keep into `evidence/veer-wonder-world/`. Software WebGL2 results are not real-GPU or device evidence.

## Running it

The repo dev server used by the browser specs serves the app at `/apps/veer-wonder-world/index.html` and bundles `src/main.ts` with esbuild. A developer can also run `pnpm exec vite apps/veer-wonder-world` from the repo root (`vite.config.ts` extends the root config, so `@aura3d/*` resolves to the workspace sources and the shared `/fonts/` and `/hdri/` files are served).

Page switches:

| Switch | Effect |
| --- | --- |
| `?story=<id or code>` | Opens that story right after start (`sheru-big-adventure` or `e17`) |
| `?mode=watch-sing` or `?mode=play-together` | The mode for this page load |
| `?autostart=1` | No start screen; sound stays locked until the first real tap |
| `?manual=1` | No live loop: only QA calls move story time (deterministic captures) |
| `?models=0` | Primitive stand-ins instead of the admitted models |
| `?modelWaitMs=N` | How long a story load waits for its models before drawing stand-ins (default 10 s, clamped to 1-300 s): for captures on slow software WebGL2 |
| `?reducedMotion=1` | Calm motion for this page load |
| `?audio=0` | No sound at all: captions and caption timing |
| `?seed=N` | Recorded in the QA hooks (the content is deterministic) |
| `?diag=1` | The diagnostics panel (renderer, draw calls, shader and context-loss errors) |

## QA hooks

`installQaHooks("wonder-world", ...)` publishes `window.__AURA_WONDER_WORLD__` (first boot error in `__AURA_WONDER_WORLD_ERROR__`):

- standard: `ready()`, `state()`, `stepFrames(n)` (n fixed 50 ms steps), `reset(seed?)`, `replay(script)`, `begin()`, `traceRow()`, `frame()`, `pixels()`, `info()`, `routeHealth()`, `nodeCount()`;
- Wonder World: `startStory(id, mode)`, `advance(ms)`, `runToEnd(maxMs?)`, `tap(targetId)`, `parentConfirm()`, `pause()`, `resume()`, `allDone()`, `skipBeat()`, `setReducedMotion(on)`, `targetRects()` (viewport CSS px), `diagnostics()`.

`state()` is plain JSON with no child data: `{ screen, storyId, director, targets, speaking, speaker, audio: { unlocked, available }, settings, stage: { drawCalls, nodes, modelsEnabled }, micRequested: false, errors }`. `speaking` is the key of the line being heard, `null` between lines and while paused. With `?manual=1`, lines end on story time only, so a QA run gives the same result every time even when sound is unlocked.

## Assets and audio

**Models.** Meshy text-to-3D through Kiro Prism, from the 59 prompts in `tools/wonder-assets.json`:

1. `node tools/meshy-pipeline.mjs` runs preview, refine and remesh, records every job in the Meshy ledger (`--game wonder-world`) and downloads each thumbnail into `artifacts/meshy/wonder-world/<key>/` (gitignored). It is resumable and waits on existing task ids instead of paying twice.
2. Every thumbnail is reviewed by eye; the verdict (approve, reject, tint or procedural) goes into `tools/model-review.json`.
3. `node tools/admit-models.mjs` optimizes, tints, inspects and copies each approved model to `src/assets/models/<key>.<sha8>.glb`, writes `provenance/models/<key>.json` and regenerates `src/aura-assets.ts` (`tools/gen-aura-assets.mjs`).

No model is rigged: Meshy rigging is humanoid only, the Lulu rig failed `aura3d assets validate --skin`, and every character, animal and prop moves procedurally. Six keys (`ball`, `bush`, `hat`, `stompStone`, `cloud`, `balloon`) are drawn from scene geometry by design. Every model has a primitive stand-in of the right size and colour, so the app runs while a model is missing or with `?models=0`; a stand-in is never a release claim.

**Audio.** ElevenLabs through Kiro Prism (premade voices; the cast is in `07` section 3.1): `./node_modules/.bin/tsx tools/gen-audio.ts` writes `src/assets/audio/{en/lines,songs,music,sfx}/*.mp3` and `provenance/audio/*.json` (provider, voice, prompt, Prism key id and tier, date), then `node tools/gen-audio-manifest.mjs` regenerates `src/audio-manifest.ts` with each file's sha256 and ffprobe duration. Never print `PRISM_API_KEY`. Output from free-tier keys is prototype-only and must be re-rendered on a paid tier before any commercial release.

All media URLs are module-relative (`new URL("./assets/...", import.meta.url)`): Vite fingerprints them, and the repo dev server resolves them without the root `public/` tree.

## Known gaps

- No physical-device runs yet (iPad and iPhone Safari, Android Chrome); every browser result so far is software WebGL2 on the remote runner. The label stays `prototype` until those runs pass (`07` section 4.3).
- No public release: that needs the owner's decision, an external privacy and legal review, a trademark search, a check of the provider terms and a human SLP and caregiver review (`07` section 4.3).
- Open model deviations: Momo has an open grin with two blunt teeth (brief: small closed smile), GoGo's face is not visible in its review thumbnail and the barn came out green (brief: red).
- English only: the Punjabi pack stays off until a native review. No family greeting packs are built.
- The engine requests the look HDRIs at `/hdri/` and the font stylesheet names `/fonts/`, so a deployed `dist/` must be served at an origin root.
