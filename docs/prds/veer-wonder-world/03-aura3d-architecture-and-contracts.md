# PRD 03 — Aura3D Technical Architecture, Runtime, Voice and Content Contracts
Status: **IN BUILD (prototype) on Aura3D 4.5.0; owner decision 2026-10-29** · Owner: Aura3D game/runtime tech lead · Dependencies: repo `llms.txt`, `docs/agents/claims-and-boundaries.md`, `docs/agents/build-a-game.md`, [`04 files`](04-implementation-backlog-by-filename.md)

## 1. Baseline and capabilities (verified 2026-10-24; re-verified 2026-10-29 against the published 4.5.0 typings)
Use the public monorepo https://github.com/auraoneai/aura3d on branch `main` as baseline, but resolve exact commit before starting. Pin **Aura3D 4.5.0** (npm `latest`; `CHANGELOG.md` `## 4.5.0`). The stock Vite build fix (`"readFileSync" is not exported by "__vite-browser-external"`) shipped in 4.1.3 (`CHANGELOG.md` `## 4.1.3`), so the 4.1.2 stock-build defect no longer blocks a consumer build. Inside the monorepo the app uses `workspace:*` dependencies; `apps/*` is not a pnpm workspace member (`pnpm-workspace.yaml` lists `packages/*` and `workers/*`), so build and test it with the root-level commands in `06` section 4. Do not claim a successful consumer build until P0 proves it on the pinned package, and record the resolved commit and engine version in the evidence.

| Requirement | Actual Aura3D documented primitive | Implementation decision |
| --- | --- | --- |
| Typed 3D scenes / camera / lights | `scene`, `model`, `camera`, `looks`, `lights`, `primitives`, `environments`, `raycast` from the root `@aura3d/engine` | Use a fixed-camera authored scene per beat; every world uses a look preset with an HDRI or an `environments.*` node (`02` section 4). No imported `three` or custom renderer |
| Real game lifecycle, HUD, touch, sound | `createGame` from **`@aura3d/engine/game`**; its session states (`GameSessionState`: `booting`, `loading`, `title`, `playing`, `paused`, `results`, `transitioning`, `context-lost`, `disposed`) match section 3 | This is the only allowed `createGame` import. Root one is headless stub |
| Loop, QA & repeatable tests | `createFixedStepLoop`, `readQaParams`, `installQaHooks`, `createCountedRng` from the root `@aura3d/engine`; `warmPrograms`, `createFixedStepPresenter`, `runMotionGate` from `@aura3d/engine/game` | Pure deterministic episode state; replay and screenshot capture; `await warmPrograms(app)` before the first visible frame |
| One audio context | `AudioContextManager` from `@aura3d/engine/audio` is a plain class, not a global | The app owns one manager and passes it on (section 4); no second context |
| Optional procedural SFX/music | `createCueBank` from `@aura3d/engine/audio` | SFX and music only; narration requires new code |
| Sample SFX | `createSampleSlices` from `@aura3d/engine/audio` | Licensed short sound samples, with preload/fallback |
| Character GLBs | `aura3d assets` CLI; `defineModelAssets` and generated typed asset refs | Same origin, SHA-256, provenance and optimized GLBs; don't invent asset names/hashes. Generated `src/aura-assets.ts` with module-relative URLs; a primitive stand-in when a model is missing or `?models=0` (section 5) |
| Skinned animation | `AnimationController` from the root `@aura3d/engine`; `TypedGLBActor` is a type-only export: instances come from `cloneSkinned` and are drawn with `attachRootRenderSource` (both root, `docs/api/skinned-actors.md`) | Unused in this build: no admitted model is rigged (section 5; `07` C6). A rigged model admitted later must pass `aura3d assets validate --skin`; inspect actual skeleton and clip names, prove visuals in browser |
| Child taps on big objects | No `createGame` touch preset fits: they are `twin-stick`, `dpad-2btn`, `dpad-4btn`, `steer-pedals`, `aim-drag`, `flight`, `lane-swipe`, `flippers` | Pointer events on the canvas plus `raycast` feed the app-owned touch router (section 6) |
| Diagnostics | `installSafetyNet` and `installBlackFrameGuard` from `@aura3d/debug` (a separate dependency), `?diag=1`, `app.diagnostics().renderPath` | Retain capture evidence and black-frame gate |
| Game route deploy | `aura3d check-deploy` (`@aura3d/cli` 4.5.0), browser route-health, remote runner | `check-deploy --browser` loads the build in a headless browser, so it runs on the remote runner only. No “works” claims until pass |
| Child audio input / ASR | **No documented built-in toddler ASR** | New optional adapter only in P3, feature off by default |
| Original songs/dialogue | **No documented native toddler narrator** | Recorded voice/audio player, captions and timing layer in app code |
| Parent observation/word list | Not a documented built-in child analytics feature | Simple local parent configuration, not telemetry |

References:
- https://github.com/auraoneai/aura3d/blob/main/docs/api/game-kit.md
- https://github.com/auraoneai/aura3d/blob/main/docs/agents/build-a-game.md
- https://github.com/auraoneai/aura3d/blob/main/docs/api/audio-synth.md
- https://github.com/auraoneai/aura3d/blob/main/docs/api/qa-kit.md
- https://github.com/auraoneai/aura3d/blob/main/docs/api/model-loader.md
- https://github.com/auraoneai/aura3d/blob/main/docs/agents/claims-and-boundaries.md

## 2. Architectural decision: standalone app first
Create a new Vite-based app at `apps/veer-wonder-world/`. Do **not** embed special child-aware behaviour into the generic game kit until proven reusable.

`apps/veer-wonder-world/src/main.ts` is the thin orchestrator. It mounts `createGame`, initializes audio after a user gesture, loads manifests, starts a story controller, and reports QA state. The protagonist, world and episode content are authored outside the entrypoint. A parent UI wraps/settings instead of replacing engine HUD controls.

Conceptual runtime:
`App bootstrap → consent/parent settings → content catalog → episode director → deterministic story state → Aura3D scene/animation + narrator/music + touch renderer → finite outro → offline invitation / exit`.

### Suggested app directory
`apps/veer-wonder-world/`
- `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `public/`
- `src/main.ts`, `src/app.ts`, `src/types.ts`
- `src/runtime/episode-director.ts` (state), `src/runtime/beat-runner.ts`, `src/runtime/turn-taking.ts`, `src/runtime/touch-router.ts`
- `src/runtime/narration-player.ts` (new app-owned module), `src/runtime/audio-mixer.ts`, `src/runtime/voice-input.ts` (optional P3)
- `src/content/catalog.ts`, `src/content/schema.ts`, `src/content/episodes/*.ts`, `src/content/activities/*.ts`, `src/content/words.ts`
- `src/scenes/meadow.ts`, `src/scenes/music-garden.ts`, `src/scenes/station.ts`, `src/scenes/peekaboo-barn.ts`, `src/scenes/learning-cloud.ts`, `src/scenes/home-nook.ts`
- `src/characters/{momo,lulu,sheru,peeko,lumi,gogo}.ts`
- `src/aura-assets.ts` **generated** by `tools/gen-aura-assets.mjs` from the admitted GLBs `src/assets/models/<key>.<sha8>.glb` and their provenance `provenance/models/<key>.json` (2026-10-29: replaces `public/aura-assets/**`; see section 5)
- `src/audio-manifest.ts` **generated** by `tools/gen-audio-manifest.mjs` from `src/assets/audio/{en/lines,songs,music,sfx}/*.mp3` and `provenance/audio/{lines,songs,beds,sfx}.json`
- `src/ui/child-controls.ts`, `src/ui/parent-panel.ts`, `src/ui/episode-menu.ts`, `src/ui/offline-card.ts`, `src/ui/styles.css`
- `src/localization/en/**`: one `episodes/<slug>.ts` or `activities/<slug>.ts` per story exporting `lines` and `strings`, plus the UI and parent strings in `en/ui.ts`, aggregated by `en/index.ts`; `src/localization/pa.ts` stays present but disabled (additional locale pack is gated behind native review)
- `src/qa/install-hooks.ts`, `tests/unit/**`, `tests/fixtures/**`; browser specs live at the repo root as `tests/browser/wonder-world-*.spec.ts`, where the root Playwright config and the remote runner find them
- `evidence/veer-wonder-world/**` (repo root) reports and screenshots **without child personal data**

These paths are being built on the feature branch (owner decision 2026-10-29); a path counts as done only with the evidence in `04` section M. The full by-file acceptance backlog is `04`.

## 3. Session and episode state contracts
### Game session states
Use documented `createGame` game session for lifecycle: `booting`, `loading`, `title`, `playing`, `paused`, `results`, `transitioning`, `context-lost`, `disposed`. A toddler-specific `EpisodeDirector` maintains its **own pure logical state** without overriding game-kit session internals.

### App-owned episode state
`idle → intro → problem → model → invited_turn → acknowledge → repeat_with_variation → celebration → outro → finished`

Transitions:
- `NEXT_BEAT` after completed timed/dialogue beat; cues are preauthored, not generated on-the-fly for v0.
- `USER_TAP`: map one or two semantic targets to named action `pop`, `open`, `go`, etc.
- `PARENT_CONFIRM`: parent indicates child gestured/vocalized; app celebrates story action **without classifying utterance**.
- `TURN_TIMEOUT`: model once more or proceed by default; no failure state.
- `PAUSE` / `RESUME`: freeze timeline, animation/action, music/narration appropriately.
- `SKIP` / `ALL_DONE`: exit immediately with calm ending; no loss/penalty.
- `AUDIO_UNAVAILABLE`: continue visuals, parent captions and touch; not a black screen or deadlock.
- `CONTEXT_LOST`: pause/recover through engine's documented lifecycle; user can always exit.

Guard against double-tap advancing two beats, rapid accidental target activation, late audio callbacks reentering disposed scene, and out-of-order scene/asset load. Every effect must have cleanup.

The frozen contract (`apps/veer-wonder-world/src/types.ts`, 2026-10-29) expresses this progression through authored beat kinds (`greeting`, `hook`, `model`, `invite`, `event`, `repeat`, `song`, `outro`) and the director phases (`DirectorPhase`); the director (`src/runtime/episode-director.ts`) accepts the `DirectorEvent`s `START`, `TICK`, `LINE_DONE`, `TAP`, `PARENT_CONFIRM`, `PAUSE`, `RESUME`, `SKIP_BEAT`, `ALL_DONE`, `AUDIO_UNAVAILABLE` and `DISPOSE`. The mapping from the transitions above is in `07` section 3.2.

### Suggested interfaces (application-defined; illustrative TypeScript, **not** claimed Aura3D API)
The frozen contract `src/types.ts` keeps the intent below under different names (for example `world` for `worldId`, one `review` record for `rightsReview` and `languageReview`, `BeatInput` `tap` and `more-or-done` for `tap-choice`/`tap-object`); `07` section 3.2 maps every field.

`EpisodeSpec`:
- `id` stable string slug; `version` integer; `title` localized key; `ageIntent` 'early-toddler'
- `modeSupport` ['watch-sing','play-together'] initially
- `worldId`; `castIds`; `assetIds`; `targetWords` 1–3; `supportWords` array
- `letterConcept?` { letter, letterNameKey, phonemeCueKey, exampleWordKey } (optional)
- `numberConcept?` { countMin:1, countMax:3, countedObjectId } (optional)
- `beats: BeatSpec[]`; `estimatedDurationSec` 120–240; `musicKey?`; `offlinePlayKey`
- `rightsReview` and `languageReview` approved status; build rejects unapproved release content

`BeatSpec`:
- `id`, `kind` (greeting | hook | demonstrate | invite | consequence | song | outro)
- `sceneStateId`, `cameraPreset`, `animationCueIds`, `narrationCueKey`, `captionKey`
- `wordMentions` [{wordId, actionObjectId}], `durationMs`, `minHoldMs`
- `input`: {type: 'none'|'tap-choice'|'tap-object'|'parent-confirm', targets?: string[]}
- `waitForChildMs?`, `autoAdvanceMs?`, `fallbackBeatId?`, `nextBeatId?`
- `reduceMotionVariant?`, `duckMusicDuringSpeech`, `caregiverPromptKey?`

`ActivitySpec`:
- `id`, `labelKey`, `worldId`, `mainObjectId`, `action`, `roundLimit`
- `introCue`, `actionCue`, `turnCue`, `outroCue`, `touchTargets`, `offlinePlayKey`
- `options` { allowTap:true, dragAlternative:'tap', microphoneRequired:false }

All content must validate at build time and resolve every referenced character/asset/cue/action. Duplicate IDs and missing localization keys are fatal.

## 4. Narration, music and the talking cue (no lip sync)

### Dialogue / music track strategy
- Use a **new app-owned `NarrationPlayer`** with prerecorded compressed audio cues and canonical keyed captions/timestamps.
- Respect browser autoplay rules: first screen prompts a genuine user gesture to unlock audio. Provide readable “Tap to start sound” and silent path when unavailable.
- Audio graph must respect Aura3D's single-`AudioContextManager` pattern; **do not create an independent second AudioContext**. Verified on 4.5.0: `AudioContextManager` (`@aura3d/engine/audio`) is a plain class, not a global, and the app owns one instance. `createGame` passes `browserContext: true` to its sound facade unless told otherwise, which makes a second manager and context, so give it `sound: { browserContext: false, createContext: () => mgr.context, cues }` (`browserContext` combined with `createContext` throws). `createCueBank` makes its own manager unless it gets `{ manager: mgr }`.
- Procedural musical elements and SFX can use `createCueBank`; recorded narration is an app-owned player on the shared context, validated by its unit tests (`04` J04) before use. `GameAudio` cues (the `createGame` `sound` facade) are not used for voice: they add pitch (±0.6 semitone) and gain (±1.5 dB) jitter by default, and `cue()` resolves once playback starts and gives no end-of-playback signal, which the director needs for `LINE_DONE`.
- Preload only current and next beat/audio track; degrade gracefully on poor connections.
- Background music must duck when a voice line plays. Hard-stop/clear narration and cue state on pause, skip, dispose or route change.
- Captions for parent UI are the same exact script text as approved narration in chosen locale.
- Talking cue: the generated models have no mouth morphs, so there are no visemes to map. While a line plays the speaking character gets a gentle squash/bob pulse (no admitted model has a `talk` clip; section 5); it is never called lip sync. A plausible mouth effect is not pronunciation evidence.

### Voice input experiment (P3 only)
1. Parent enables feature; app shows what processing occurs, duration, permissions and easy revoke.
2. `VoiceInputAdapter` capability detects microphone availability, short turn start/end and permission denial; no always-on listening.
3. Phase 1: detect a sound turn (energy/VAD), *not* a word. Respond identically to tap path.
4. Phase 2 exploratory: selected limited-vocabulary commands (go/stop) only with privacy/legal and measured browser-device recognition reliability; always tap fallback.
5. Reject raw child voice retention, speech grading, word counting, inferred age/progress and “perfect pronunciation” responses.
6. Test Safari/iOS and other target browsers explicitly; `SpeechRecognition` is **not Baseline** and some browser modes send audio to server. Do not silently rely on it; reference: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition .

## 5. 3D authoring / assets / animation
- Scaffold from documented `mini-game` or the type-checked `docs/agents/samples/coin-dash/`; favor canonical root APIs and the real `/game` shell.
- Assign scenes **fixed named cameras** with authored beat states. Default one primary hero and at most two prominent child targets.
- Characters and hero vehicles must be licensed typed GLBs; no fake primitive-only hero claims. Use generated `src/aura-assets.ts` or `defineModelAssets`, never raw GLB URL to `model`.
- Every model use has a primitive stand-in of the right size and colour, drawn when the model is not admitted (`modelRef(key)` returns `undefined`) or `?models=0` is set, so the app always runs; the stand-in is a fallback, never a release claim.
- Generate/admit assets **inside the app scope in isolation**, not root CLI regeneration that rewrites monorepo-wide manifests (repo asset workflow warns about large diff/races). Admitted models are `apps/veer-wonder-world/src/assets/models/<key>.<sha8>.glb` with provenance `apps/veer-wonder-world/provenance/models/<key>.json`, referenced by module-relative URLs (`new URL("./assets/models/...", import.meta.url).pathname`, the documented `defineModelAssets` pattern): the repo dev server (`tests/browser/example-dev-server.ts`) maps `/aura-assets/` only to the root `public/` tree, and the Vite build fingerprints module-relative assets.
- Rigs (2026-10-29): Meshy auto-rigging is humanoid only. It was evaluated on Lulu and rejected because `aura3d assets validate --skin` fails in every clip, even after `tools/bake-armature-scale.mjs` and `repair-skin --refit-skeleton` (`02` section 2 rig decision; `07` C6). No admitted model is rigged: `MODEL_INFO[key]` has `rigged: false` and `clips: []` for every key. Every character, animal and prop moves procedurally (hop, sway, squash-stretch, wag as a yaw wiggle, bob, roll, float). Character code still reads `MODEL_INFO[key].clips` and plays a listed clip, falling back to procedural motion for any clip that is missing, so a later rig that passes `validate --skin` needs no code change.
- The generated models have no mouth morphs; the talking cue is the squash/bob pulse of section 4, never called lip sync.
- Inspect skeleton/morph/clip names using `aura3d assets inspect` and `validate-animation` before referencing them.
- Track license, source, rights evidence, hash, model version, triangle/texture budgets; build must fail or mark prototype on admission mismatch.
- Renderer materials, effects and animations verified through captured frames; low-motion alternative strips nonessential FX.
- No dependency on WebGPU for MVP. Support verified WebGL2-based browser path; a WebGPU rendering claim needs separate evidence.

## 6. Touch and screen UX
- A child tap is an **app semantic action** mapped from collision/raycast or generous invisible child-target areas, not a keyboard-game preset. No `createGame` touch preset represents tap-a-big-object (section 1), so taps are pointer events on the canvas resolved with `raycast` by a thin **app-owned target adapter** (`src/runtime/touch-router.ts`; `StageAdapter.pick` in `src/types.ts`).
- No drag required. If drag used (blocks, ball), auto-snap and separate tap option.
- Parent-facing controls: play/pause, sound, captions, back, parent gate, mode, reduce motion and local settings. Child screen has nearly no text.
- Touch action only fires if visible target belongs to current beat; debounce; never advance from a random screen touch.
- Respect safe areas, touch-action, CSS pixel sizes, orientation and DOM overlay / canvas layering.
- Voice / parent-confirm / touch pathways produce one same semantic event and same outcome; no “word correctness” path.

## 7. Content engine and localization
- Episode ids stable across translations; lyrics, captions, voice cues, offline instructions and target words are keyed by locale.
- Build-time content lint: every localized target reference exists, voiced clip metadata has exact duration or timestamp map, no duplicate IDs, every beat has finite escape, every song has clear license/ownership.
- English baseline; additional language packs (e.g. Punjabi if family opts in) must be native-reviewed and voiced. Script cues should reflect natural language rather than translating individual token labels mechanically.
- Store original assets privately/locally until rights cleared. Public repo may contain only redistributable, consent-cleared sample assets.

## 8. Persistence, metrics, logging
- MVP settings: local non-personal preferences (mode, sound, locale, reduce motion, word list), no child identity required.
- No tracking of child speech/microphone, detailed gesture streams or developmental profile.
- QA events may include `sceneReady`, `beatAdvance`, `assetValidation`, `audioUnlockStatus`, `routeHealth` and anonymous aggregate rendering errors, but never spoken text, child name or family voice files.
- Export or delete local parent notes from parent panel; default not to create notes.
- No third-party advertising or analytics SDK.
- Version episode/content manifests; record build version and asset manifest checks in QA evidence.

## 9. Unit/browser integration boundaries
| Module | Pure-test contract | Browser/device proof |
| --- | --- | --- |
| `EpisodeDirector` | Same events+seed → same state; no DOM/date/random | Playback transitions stable |
| `TurnTaking` | Silence and timeouts always progress; never “failed speech” | Visual pause is pleasant/clear |
| `TouchRouter` | Correct semantic action, ignores inactive/stale targets | Child-sized touch targets on iOS/Android |
| `NarrationPlayer` | Cue queue, cancel, duck, pause/resume | Audio unlock, no overlaps, Bluetooth/device mute |
| `CharacterActor` | Valid clip mapping; a clip missing from `MODEL_INFO[key].clips` falls back to procedural motion | Talking pulse/gaze/gesture readable at real size |
| `ContentValidator` | Missing targets/localizations/rights fail | All episodes render without blank beats |
| `OfflineCard` | Every episode has physical activity | End card stops autoplay |
| `VoiceInputAdapter` (P3) | permission denial/deactivation and no retained audio | Cross-device false negative and privacy review |

## 10. P0 engineering exit / architecture checklist
- [x] `mini-game` consumer smoke works on the pinned released SDK, 4.5.0 (the 4.1.2 stock Vite defect was fixed in 4.1.3, `CHANGELOG.md`; inside the monorepo the app builds from `workspace:*` sources); record the resolved commit. Done: remote run `wonder-consumer-smoke-20261029T172337Z` (`tests/browser/wonder-world-consumer-smoke.spec.ts`) scaffolds `create-aura3d@4.5.0 --template mini-game`, installs it with `@aura3d/engine` resolved to 4.5.0, builds it and passes the static `check-deploy`, with a `--browser` pass that may fail only on the template's own missing demo media (`07` B32); resolved commits: tag `v4.5.0` is `6813d5d24`, an ancestor of the branch base `31f8945ad` on `origin/main` (`07` section 4.1).
- [x] `@aura3d/engine/game` real `createGame` mounted; no root stub warning. Done: `src/scenes/stage.ts:54` imports `createGame` from `@aura3d/engine/game` and `:1059` mounts it, and `tests/unit/app/app-flow.test.ts` "the shell reads no wall clock, no randomness and no three.js, and logs nothing" forbids the root import; remote run `wonder-playback-episodes-20261029T172337Z` (`tests/browser/wonder-world-playback-episodes.spec.ts`) fails on any console call from page script, which the root stub's `CREATE_GAME_STUB` warning would be.
- [x] One approved character GLB animates with exact inspected clip names, one audio line and one simple tap (this build: no admitted model is rigged, so the character animates procedurally and its inspected clip list is empty; `07` C6). Done: Sheru's approved GLB (`tools/model-review.json:10-16`) has an empty inspected clip list (`provenance/models/sheru.json:7-8,67`) and moves procedurally (`tests/unit/stage/character-registry.test.ts` "falls back to procedural motion for every clip that is missing at runtime"); remote runs `wonder-characters-2-20261029T182623Z` (`tests/browser/wonder-world-characters-2.spec.ts`: Sheru drawn from its GLB in six poses with a visible talking pulse), `wonder-audio-and-pausing-20261029T172337Z` (`tests/browser/wonder-world-audio-and-pausing.spec.ts`: recorded E17 lines play) and `wonder-touch-and-layout-20261029T172337Z` (`tests/browser/wonder-world-touch-and-layout.spec.ts`: a real tap on the ball ends the E17 wait).
- [x] First frame screenshot, audio unlock, route-health and `?diag=1` evidence saved without child details. Done: remote runs `wonder-first-frame-build-20261029T174544Z` (`tests/browser/wonder-world-first-frame.spec.ts`: first-frame screenshots and the `?diag=1` panel), `wonder-audio-and-pausing-20261029T172337Z` (`tests/browser/wonder-world-audio-and-pausing.spec.ts`: audio unlock on the start tap) and `wonder-first-frame-build-20261029T174544Z` (`tests/browser/wonder-world-build.spec.ts`: `check-deploy --browser` route health) print every record and tool output through `redact()` (`emitJson` in `tests/browser/wonder-world-lib.ts`; `tests/browser/wonder-world-build.spec.ts:29`), and `tools/extract-remote-evidence.mjs` redacts again when it saves them.
- [x] Pure story state with finite progression tested including silence, pause, touch, audio failure and disposal. Done: `tests/unit/runtime/episode-director.test.ts` "completes with no input at all (silent child), playing every response, in the estimated time", "PAUSE freezes every timer and RESUME continues where it stopped", "a double tap advances once; a tap after the wait has ended is ignored", "AUDIO_UNAVAILABLE keeps the story going on timing alone", "DISPOSE stops speech and targets once; every later event returns nothing" and "random event streams never break the safety invariants and always reach an ending"; `src/runtime/episode-director.ts` uses no DOM, clock or randomness.
- [x] Rights review records all voice, music and GLB sample assets (`provenance/models/*.json`, `provenance/audio/*.json`; agent rights review in `07`). Done: 54 `provenance/models/*.json` records cover the 54 admitted GLBs and 907 `provenance/audio/*.json` records (ElevenLabs, all tier `starter`) cover the 907 MP3s, as the content lint requires (`tools/validate-content-entry.ts:91-179`; "OK: content lint passed" on 2026-10-29) and `tests/unit/content/rights-manifest.test.ts` "has one record per admitted model, with its file and sha256" checks; the agent rights review is `07` section 2.3.
- [ ] Parent exit and no-microphone v0 proven on phone + tablet. Open: this needs the physical phone and tablet runs (`07` §4.3 item 1); the remote specs use emulated viewports only.
- [x] Only tested public engine APIs used; no `as any`/`as never` to bypass type errors or undocumented engine internals. Done: `tests/unit/privacy/source-guards.test.ts` "keeps no type assertion beyond the commented allow-list" (four reviewed widenings, no `as any` or `as never`) and `tests/unit/stage/motion.test.ts` "stage code has no clocks, randomness, three.js, raw GLB URLs, unsafe casts or vignette"; engine imports come only from `@aura3d/engine`, `@aura3d/engine/game`, `@aura3d/engine/audio` and `@aura3d/debug`, and `tsc -p tsconfig.published.json --noEmit` against the published 4.5.0 packages exits 0 (2026-10-29).
