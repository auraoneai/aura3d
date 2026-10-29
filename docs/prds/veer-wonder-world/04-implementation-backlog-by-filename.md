# PRD 04 — Implementation Backlog BY EXACT PROPOSED FILENAME
Status: **IN BUILD on branch `feat/wonder-world-foundation-20261029` (owner decision 2026-10-29: P0, P1 and P2 built together; P3 out of scope and off)** · Owner: engineering lead · Date: 2026-10-24 · Updated: 2026-10-29
Scope root: `apps/veer-wonder-world/` unless a row explicitly starts at repo root. The documentation in `docs/prds/veer-wonder-world/` **is** committed; the implementation paths below are being built on the feature branch and a task counts as done only with the evidence in section M (build record in [`07`](07-autonomous-decisions-and-build-record.md)). Dependency order: `P0 → P1a vertical slice → P1b pilot → P2 → P3`, run as parallel waves (section L). Link to [architecture](03-aura3d-architecture-and-contracts.md), [content](05-episodes-games-and-curriculum.md) and [QA](06-qa-release-and-execution.md).

## Legend
- **P0** critical SDK/engine feasibility, **P1a** minimal end-to-end playable story, **P1b** six-episode pilot, **P2** twenty-episode/twelve-activity expansion, **P3** optional microphone.
- `BE` engine/game, `FE` UI, `ART` animation, `AUDIO` audio, `EDU` SLP/content, `QA` tests/release.
- Each checklist is an *uncompleted task*. File paths/specifications are implementation targets, not claimed existing APIs.

## A. Bootstrap and shared app files (P0)
| ID | Proposed path | Owner | Detailed task / done condition |
| --- | --- | --- | --- |
| A01 | `apps/veer-wonder-world/package.json` | BE | [ ] Declare workspace app scripts `dev`, `typecheck`, `build`, `test:unit`, `test:browser`; pin Aura3D 4.5.0 (`workspace:*` inside the monorepo; `apps/*` is not a pnpm workspace member, so run the root-level commands of `06` section 4, not `pnpm --filter`); avoid unpublished dependency |
| A02 | `apps/veer-wonder-world/tsconfig.json` | BE | [ ] Strict TS checks with public package exports; fail undocumented imports and type casts (`tsconfig.published.json` checks the same sources against the published 4.5.0 typings) |
| A03 | `apps/veer-wonder-world/vite.config.ts` | BE | [ ] Extend the root `vite.config.ts` the way `apps/showcase-pips-big-leap/vite.config.ts` does; verify base path, asset bundling, same-origin GLBs and routes; no Node-only browser imports; smoke build |
| A04 | `apps/veer-wonder-world/index.html` | FE | [ ] Accessible root target + parent-friendly start/audio prompt; prevent automatic audible playback |
| A05 | `apps/veer-wonder-world/src/main.ts` | BE | [ ] Thin bootstrap mounting `createGame` **from `@aura3d/engine/game`**; install safety/QA; no app logic hidden in entry |
| A06 | `apps/veer-wonder-world/src/app.ts` | BE | [ ] Compose catalog, episode director, scene, narrator, input and parent settings; cleanup on route leave |
| A07 | `apps/veer-wonder-world/src/types.ts` | BE | [ ] Public app-only episode/beat/event/word ids and typed tagged unions; no privacy-sensitive child profile |
| A08 | `apps/veer-wonder-world/src/aura-assets.ts` | ART/BE | [ ] **Generate**, never hand-edit, typed approved GLB asset refs using isolated app CLI workflow (`tools/gen-aura-assets.mjs`, exports `models`, `MODEL_KEYS`, `MODEL_INFO`, `modelRef`); validate hashes/rights |
| A09 | `apps/veer-wonder-world/src/assets/models/<key>.<sha8>.glb` + `apps/veer-wonder-world/provenance/models/<key>.json` (2026-10-29: replaces `public/aura-assets/**`) | ART | [ ] Admit only optimized/owned or redistributable assets with same-origin module-relative paths (`new URL("./assets/models/...", import.meta.url).pathname`), hashes and provenance (`tools/admit-models.mjs`); no raw private files. Raw Meshy output stays in the gitignored `artifacts/meshy/wonder-world/` |
| A10 | `apps/veer-wonder-world/src/scenes/looks.ts` | ART/BE | [ ] Fixed low-stimulus look presets and no accidental post-chain over-darkening; captured evidence. 4.5.0 rules (`02` section 4): every world has a look preset with an HDRI or an `environments.*` node; no `effects.vignette` (the default vignette still darkens; the linear-light one is opt-in via `?linearvig=1` or `__A3D_LINEAR_VIGNETTE__`); `app.effects.runtime = "off"` and bubbles as meshes; check `app.diagnostics().renderPath` under `quality: "auto"`; `await warmPrograms(app)` before the first frame |
| A11 | `apps/veer-wonder-world/README.md` | PM/BE | [ ] Exact local/remote build and validation commands, app flow, no-promise/known-gaps list |

### P0 foundation gate
- [ ] F0.1 Run documented app scaffold (`create-aura3d --template mini-game`) **in a scratch directory** and adapt checked files into repo app; do not overwrite unrelated root manifests. Also read the `episode-builder` template (`packages/create-aura3d/templates/episode-builder`, labelled example/experimental) for caption timing, reduced-motion and child-safe defaults; do not copy its viseme/mouth examples, because these models have no mouth morphs.
- [ ] F0.2 Demonstrate pinned SDK build/launch on Aura3D 4.5.0 (npm `latest`). The 4.1.2 stock Vite failure was fixed in 4.1.3 (`CHANGELOG.md` `## 4.1.3`); inside the monorepo the app builds from `workspace:*` sources. Record the resolved commit and engine version.
- [ ] F0.3 Verify all imported APIs against `docs/agents/api-surface.md`, `docs/api/game-kit.md` and the published 4.5.0 typings (`tsconfig.published.json`); root `createGame` stub must not be used.
- [ ] F0.4 Render one licensed, typed character model and first frame with route-health capture.
- [ ] F0.5 Exercise audio unlock after genuine gesture and silent fallback; no mic in P0.
- [ ] F0.6 Save redacted proof in repo-approved `evidence/veer-wonder-world/p0/` and label status prototype.

## B. Game/language runtime (P1a)
| ID | Proposed path | Owner | Detailed task / done condition |
| --- | --- | --- | --- |
| B01 | `src/runtime/episode-director.ts` | BE | [ ] Pure deterministic finite-state story machine; NEXT, TOUCH, PARENT_CONFIRM, TIMEOUT, PAUSE, RESUME, END, DISPOSE |
| B02 | `src/runtime/beat-runner.ts` | BE | [ ] Drive authored cue timing from content, not loose setTimeout webs; cancel/skip safely |
| B03 | `src/runtime/turn-taking.ts` | BE/EDU | [ ] Wait for child/caregiver; 4–6s **configurable initial proposal** reviewed by SLP (this build: 5 s default, agent review in `07`); timeout proceeds without “incorrect” state |
| B04 | `src/runtime/touch-router.ts` | BE/FE | [ ] Huge semantic hit targets, tap and parent-confirm actions; ignore stale double taps; drag optional |
| B05 | `src/runtime/narration-player.ts` | AUDIO/BE | [ ] Recorded narration queue keyed by beat/locale; play/pause/cancel/replay; exposed cue timing for the talking pulse/gesture; plays on the shared context, not through `GameAudio` cues (they add pitch/gain jitter and give no end-of-playback signal) |
| B06 | `src/runtime/audio-mixer.ts` | AUDIO | [ ] One audio-owner integration: one `AudioContextManager` shared with `createGame` (`sound: { browserContext: false, createContext: () => mgr.context, cues }`) and `createCueBank({ manager })`; speech ducking, capped levels, music off, no overlap; browser unlock |
| B07 | `src/runtime/animation-director.ts` | ART/BE | [ ] Actor clip map and gaze/talk/idle/wait events; verify exact imported animation names (`MODEL_INFO[key].clips`); a missing clip falls back to procedural motion; talking is a squash/bob pulse, not lip sync |
| B08 | `src/runtime/session-gate.ts` | BE/FE | [ ] Pause on hide, “all done,” manual next, finite episode ending; no auto-next |
| B09 | `src/runtime/asset-preloader.ts` | BE | [ ] Preload current+next required same-origin assets; missing model/audio fallback without deadlock |
| B10 | `src/runtime/locale.ts` | EDU/BE | [ ] Keyed scripts and language pack selection; no hard-coded English in reusable logic |
| B11 | `src/runtime/feature-flags.ts` | BE | [ ] Explicit OFF-by-default `voiceInput` flag and optional future modules; no accidental mic prompt |
| B12 | `src/qa/install-hooks.ts` | QA/BE | [ ] `installQaHooks` standard ready/state/reset/replay/stepFrames/routeHealth; snapshots omit private data |

### P1a runtime checklist
- [ ] F1.1 Define finite semantic event ids `GO` / `STOP` / `OPEN` / `POP` / `MORE` / `FETCH` and one unified dispatcher for touch/parent pathways.
- [ ] F1.2 Code transition table and golden deterministic tests for every transition including silent/no-response, pause/restart, audio failure, context loss, repeated touch.
- [ ] F1.3 Do not hand-roll generic engine loop, HUD, QA hooks, safety net, SFX bank or black-frame guard; use actual documented Aura3D helpers.
- [ ] F1.4 Never import `three`, `GLTFLoader`, private engine packages or raw GLB strings into runtime.
- [ ] F1.5 Ensure narrator/caption words exactly match approved content and visual event; no two characters speaking over each other.
- [ ] F1.6 No automated word score, correct pronunciation enforcement, or runtime speech inference.

## C. Content schemas and base curriculum (P1a)
| ID | Proposed path | Owner | Detailed task / done condition |
| --- | --- | --- | --- |
| C01 | `src/content/schema.ts` | BE/EDU | [ ] `EpisodeSpec`/`BeatSpec`/`ActivitySpec` runtime validator; reject missing target words/actions/audio/rights |
| C02 | `src/content/catalog.ts` | BE | [ ] Explicit available episode/activity manifest; never list unapproved or missing content |
| C03 | `src/content/words.ts` | EDU | [ ] Target vocabulary, category, clear model phrase, optional extension, related episodes and offline prompt |
| C04 | `src/content/letters.ts` | EDU | [ ] Letter name, first sound, object mapping; never equate symbol name with phoneme |
| C05 | `src/content/numbers.ts` | EDU | [ ] Explicit quantity/object count sequences 1–3 before 1–5/1–10 expansions |
| C06 | `src/content/songs.ts` | AUDIO/EDU | [ ] Track ids, short original lyrics, motion/audio timing, content review/rights record |
| C07 | `src/localization/en/**` (2026-10-29: one `episodes/<slug>.ts` or `activities/<slug>.ts` per story exporting `lines` and `strings`, aggregated by `en/index.ts`; replaces `src/localization/en.ts`) | EDU | [ ] All narration/captions/parent guidance; avoid unscripted LLM dialogue in MVP |
| C08 | `src/localization/pa.ts` | EDU | [ ] **P2 optional**, native reviewed Punjabi content, not autogenerated copy; do not turn on until approved |

### Content lint checklist
- [ ] All references resolve (beat → word → localized phrase → approved recorded audio → animation cue).
- [ ] Each episode has 1–3 primary target words, no target word unrelated to onscreen action, at least one natural pause, finite ending and offline bridge.
- [ ] Letters use validated names and phonemes; counting matches actual objects; translated scripts reviewed naturally.
- [ ] Build fails on missing rights, missing audio, missing objects, missing translations or unreachable beat.

## D. Characters, scenes and approved media
| ID | Proposed path | Owner | Detailed task / done condition |
| --- | --- | --- | --- |
| D01 | `src/characters/momo.ts` | ART/BE | [ ] Procedural actor (the Meshy humanoid rig was rejected, `07` C6): bounce, sway, point-lean for pointing, squash-stretch, wave, wait and react. The library clip names (`idle`, `walk`, `run`, `wave`, `talk`, `happyJump`, `cheer`, `sway`, `mirror`, `pickUp`, `lookAround`, `sleep`, `drink`, `wakeUp`, `jazzHands`, `shrug`) stay as candidates and play only when `MODEL_INFO.momo.clips` lists them; validates exact clips |
| D02 | `src/characters/lulu.ts` | ART/BE | [ ] Procedural actor (rig rejected, `07` C6): slow dance sway, stomp hop, clap pulses and freeze. The clip names (`idle`, `walk`, `run`, `dance`, `hop`, `cheer`, `wave`, `talk`, `sway`, `jazzHands`, `happyJump`, `funnyDance`) stay as candidates for `MODEL_INFO.lulu.clips`; talking pulse (no mouth morphs, no lip sync) |
| D03 | `src/characters/sheru.ts` | ART/BE | [ ] Stylized canine GLB, not rigged (Meshy rigging is humanoid only): procedural walk bob, wag, sniff, fetch/carry/return + bark cues; family privacy/rights review |
| D04 | `src/characters/peeko.ts` (renamed from `pip.ts`: Pip is the hero of the live game *Pip's Big Leap*) | ART/BE | [ ] P2 (built now) chick hide/pop/wave actor, procedural |
| D05 | `src/characters/lumi.ts` | ART/BE | [ ] P2 (built now) glowing star with letter/object cue mapping and reduced glow; procedural float, soft glow that never flashes |
| D06 | `src/characters/gogo.ts` | ART/BE | [ ] P2 (built now) train body/wheels/doors and passenger cues; procedural; models `gogo` and `gogoCarriage` |
| D07 | `src/characters/character-registry.ts` | BE | [ ] Character id to typed model + permitted animation list; missing clip falls back to procedural motion (tested) |
| D08 | `src/scenes/meadow.ts` | ART | [ ] P1 ball, bubbles and toy garden; camera locked, visible hit targets |
| D09 | `src/scenes/music-garden.ts` | ART | [ ] P1 stomp/clap stage with quiet background |
| D10 | `src/scenes/home-nook.ts` | ART | [ ] P1 simple prop set for picnic/daily objects, generic non-identifying home |
| D11 | `src/scenes/station.ts` | ART | [ ] P2 GoGo track/tunnel and one-to-one countable passengers |
| D12 | `src/scenes/peekaboo-barn.ts` | ART | [ ] P2 barn with two doors and gentle reveal |
| D13 | `src/scenes/learning-cloud.ts` | ART | [ ] P2 letters/numbers with animated associated real objects |
| D14 | `src/assets/rights-manifest.ts` | ART/PM | [ ] Build-readable license/owner/review records; no private PII in public files |
| D15 | `src/assets/audio/{en/lines,songs,music,sfx}/*.mp3` (2026-10-29: replaces `public/audio/en/{dialogue,songs,sfx}/**`) | AUDIO | [ ] Approved compressed voiced lines/original songs/music beds/SFX from ElevenLabs through Kiro Prism (`tools/gen-audio.ts`), indexed by the generated `src/audio-manifest.generated.ts` (`tools/gen-audio-manifest.mjs`: module-relative URL, sha256, ffprobe duration); volume-normalized; no unconsented family recordings |
| D16 | `provenance/models/<key>.json` and `provenance/audio/{lines,songs,beds,sfx}.json` (2026-10-29: replaces `public/aura-assets/provenance/**`) | ART | [ ] Per-asset origin, SHA, optimization/admission evidence, generation rights (provider, voice, prompt, Prism key id and tier, date for audio) |

### Art / media acceptance
- [ ] Every primary subject uses typed approved GLB (no primitive-only substitute in a production claim).
- [ ] Character silhouette, facial expression and target prop recognizable on small mobile viewport.
- [ ] Low-motion variant and neutral expression path; no sudden scream/bark/strobe/jerky camera.
- [ ] Audio cues and talking-pulse/gaze gestures inspected on physical tablet and phone, not just mocked.
- [ ] Media bundle has ownership, release rights and provenance records.

## E. User interface and parent controls (P1a / P1b)
| ID | Proposed path | Owner | Detailed task / done condition |
| --- | --- | --- | --- |
| E01 | `src/ui/child-controls.ts` | FE | [ ] Big obvious primary touch object; no text instructions necessary for child |
| E02 | `src/ui/episode-menu.ts` | FE | [ ] Finite episode and activity thumbnails with familiar characters (the six P1 episodes first; all 20 + 12 once each passes content validation, owner decision 2026-10-29), parent-start, no infinite recommendations |
| E03 | `src/ui/parent-panel.ts` | FE | [ ] Settings + session exit + captions + mute/music + motion + language; accessible controls |
| E04 | `src/ui/parent-gate.ts` | FE | [ ] Distinguish parent-only settings from play, with recoverable entry; not a security guarantee |
| E05 | `src/ui/offline-card.ts` | FE/EDU | [ ] “All done; now try ...” physical task; app stops playback and does not auto-next |
| E06 | `src/ui/styles.css` | FE | [ ] Mobile-first safe areas, large taps, clear overlays, portrait/landscape, reduced-motion/high contrast |
| E07 | `src/ui/parent-wordlist.ts` | FE/EDU | [ ] Local shortlist of selected words, no automated learning claims |
| E08 | `src/ui/accessibility.ts` | FE | [ ] Screen-reader text, captions and keyboard parent navigation, audio/calm controls |

## F. **P1 six episodes**, each its own explicit content file
| ID | File | Primary owner | Core acceptance |
| --- | --- | --- | --- |
| F01 | `src/content/episodes/momo-magic-mouth.ts` | EDU/AUDIO | [ ] Sound play, gestures and model of “ah/oh/mmm”; no tongue/lip accuracy scoring |
| F02 | `src/content/episodes/peekaboo-palace.ts` | EDU/ART | [ ] Gentle hide/reveal, “hi/open/bye”, parent gesture opportunity |
| F03 | `src/content/episodes/baby-animal-orchestra.ts` | EDU/AUDIO | [ ] “moo/baa/quack/woof” paired with animal + rhythm; not auditory overload |
| F04 | `src/content/episodes/sheru-big-adventure.ts` | EDU/ART | [ ] Ball/go/more fetch *chapter* in canonical Sheru’s Big Adventure E17; golden pilot with real-ball endcard |
| F05 | `src/content/episodes/lulu-dino-dance.ts` | EDU/AUDIO | [ ] Clap/go/stop/stomp and optional physical dance breaks |
| F06 | `src/content/episodes/counting-cookies.ts` | EDU/ART | [ ] Cookie visible count 1–3, “one more/eat/all gone”; no speed quiz |

## G. **P1 three interactive activities**
| ID | File | Core interaction | Done condition |
| --- | --- | --- | --- |
| G01 | `src/content/activities/bubble-garden.ts` | Make/pop bubbles, “more” | [ ] All taps work with speech off; three bubbles → finite outro |
| G02 | `src/content/activities/gogo-train.ts` | Go/stop/passenger (GoGo is built now: the generated `gogo`/`gogoCarriage` models, with a primitive train stand-in while a model is missing; label prototype) | [ ] Start/stop controllable; no required speech; safe automatic finish |
| G03 | `src/content/activities/sheru-ball.ts` | Roll/fetch/another turn | [ ] One tap → ball roll → fetch → return → repeat or end; real-ball bridge |

## H. P2: fourteen additional episodes (one source file each)
These are the **other fourteen** entries in the canonical twenty of `05`; the P1 six are E01/E02/E05/E06/E09/E17. Owner decision 2026-10-29: H and I are built in the same run as P1.
- [ ] H01 `src/content/episodes/alphabet-zoo.ts` — animal + isolated letter/word/sound; not 26 fast symbol flashes (E03).
- [ ] H02 `src/content/episodes/gogo-abc-train.ts` — letter carriage, associated object reveal, finite story (E04).
- [ ] H03 `src/content/episodes/magic-colour-machine.ts` — colour + familiar concrete object (E07).
- [ ] H04 `src/content/episodes/wheres-sheru.ts` — search; in/out/under/behind (E08).
- [ ] H05 `src/content/episodes/momos-hungry-belly.ts` — food nouns, eat/more/all done (E10).
- [ ] H06 `src/content/episodes/number-balloon-rescue.ts` — one-to-one count of three balloons (E11).
- [ ] H07 `src/content/episodes/magic-shape-bakery.ts` — circle/square/triangle shape-object pairing (E12).
- [ ] H08 `src/content/episodes/silly-robot-factory.ts` — body/clothing words; harmless mismatched props (E13).
- [ ] H09 `src/content/episodes/lost-teddy-adventure.ts` — look/find/under with short journey (E14).
- [ ] H10 `src/content/episodes/momo-bubble-universe.ts` — bubble/reveal/noun/pop/more; separate **episode** from Bubble Garden activity (E15).
- [ ] H11 `src/content/episodes/little-birthday-party.ts` — cake/candle/blow and visible count (E16).
- [ ] H12 `src/content/episodes/whos-at-the-door.ts` — greetings; no family voices without consent (E18).
- [ ] H13 `src/content/episodes/momos-day.ts` — wake/wash/eat/brush/sleep routines (E19).
- [ ] H14 `src/content/episodes/little-story-machine.ts` — preapproved 2-noun + action micro-stories; no on-the-fly LLM speech (E20).

## I. P2: nine additional interactive activities (12 total)
- [ ] I01 `src/content/activities/peekaboo-animal-barn.ts` — touch-open door, names/animal sounds, finite 3 reveals.
- [ ] I02 `src/content/activities/teddy-snack-picnic.ts` — choice of 2 foods, feed Teddy, “more/all done.”
- [ ] I03 `src/content/activities/splashy-car-wash.ts` — water/sponge/towel with tap fallback.
- [ ] I04 `src/content/activities/little-lift.ts` — in/out/up/down, one level per tap.
- [ ] I05 `src/content/activities/build-and-tumble.ts` — count 1–3 blocks, tower fall, repeat.
- [ ] I06 `src/content/activities/family-doorbells.ts` — generic door greetings; optional family packs handled privately/local (this build: generic friends only, no family voices or names; no family pack is built).
- [ ] I07 `src/content/activities/bears-little-band.ts` — tap/take turns, clapping, musical rhythms.
- [ ] I08 `src/content/activities/magic-sound-garden.ts` — v0 **tap-to-open flower**; audio-reaction version only P3 gated.
- [ ] I09 `src/content/activities/find-my-real-toy.ts` — show toy then pause app; parent confirms physical play and end.

## J. QA, release, rights and evidence (P0–P2)
| ID | Path | Acceptance task |
| --- | --- | --- |
| J01 | `tests/unit/runtime/episode-director.test.ts` | [ ] Deterministic transitions and timeouts; all states and no-speech path |
| J02 | `tests/unit/runtime/turn-taking.test.ts` | [ ] No wrong-answer branches, timeout auto-progress, cancel safety |
| J03 | `tests/unit/runtime/touch-router.test.ts` | [ ] Debounce, visible-target-only, tap equivalence, parent confirm |
| J04 | `tests/unit/runtime/narration-player.test.ts` | [ ] Queue/stop/duck/mute/pause; no dangling audio on unmount |
| J05 | `tests/unit/content/content-schema.test.ts` | [ ] Unique IDs, all references, rights, valid finite story graphs, translations |
| J06 | `tests/unit/content/letters-and-counts.test.ts` | [ ] Correct phoneme/name mapping, one-to-one counted visible items |
| J07 | `tests/unit/privacy/no-child-data.test.ts` | [ ] No PII in logs/telemetry/prod bundles, raw mic handling absent P1 |
| J08 | repo root `tests/browser/wonder-world-first-frame.spec.ts` | [ ] Non-black render on remote WebGL2, expected cast/object and screenshot |
| J09 | repo root `tests/browser/wonder-world-episode-playback.spec.ts` | [ ] All 6 P1 watch modes and three interactive activities finish (then every one of the 20 episodes and 12 activities, owner decision 2026-10-29) |
| J10 | repo root `tests/browser/wonder-world-touch-and-layout.spec.ts` | [ ] Touch on narrow/portrait tablet, orientation safe areas, no blocking overlay |
| J11 | repo root `tests/browser/wonder-world-audio-and-pausing.spec.ts` | [ ] Start gesture, mute, background/foreground, skip, no overlapping voice |
| J12 | repo root `tests/browser/wonder-world-no-speech-required.spec.ts` | [ ] Every story/activity completes with microphone disabled and zero child sounds |
| J13 | repo root `tests/browser/wonder-world-low-motion.spec.ts` | [ ] Reduced animation, no flashing and SFX volume guard |
| J14 | `tools/validate-wonder-world-content.mjs` | [ ] CI lint for content references/rights, all episodes reachable, captions/audio keys |
| J15 | repo root `evidence/veer-wonder-world/p1/README.md` | [ ] Build/version, route-health, redacted captures, actual device reports, issue log |
| J16 | `apps/veer-wonder-world/DEPLOYMENT.md` | [ ] Deployment steps, cache/assets, rollback, no-PII logging and owner |

The browser specs J08-J13 sit at the repo root because the root `playwright.config.ts` matches `tests/browser/**/*.spec.ts` and the remote runner runs them with `EXTRA_DIRS="apps/veer-wonder-world" SPECS="tests/browser/wonder-world-*.spec.ts" tools/remote-acr/run.sh` (2026-10-29; the table used app-relative paths before).

## K. P3 OPTIONAL voice module — explicit separate go/no-go
- [ ] K01 `src/runtime/voice-input.ts` — parent opt-in, short turn mic, visible indicator, permission errors, no storage, touch fallback.
- [ ] K02 `src/runtime/sound-presence-detector.ts` — distinguish “a sound happened” from “said word X”; cap sensitivity; adult noise caveat.
- [ ] K03 `src/ui/voice-permission-dialog.ts` — honest privacy implications, on/off, revocation; no coercive UX.
- [ ] K04 `tests/browser/voice-permissions.spec.ts` — permission denial, unsupported Safari, false negative, immediate stop/dispose.
- [ ] K05 `docs/prds/veer-wonder-world/08-optional-voice-validation.md` — **not created yet**; future privacy/accuracy device matrix/SLP review prior to enabling. (Renamed from `07-optional-voice-validation.md` on 2026-10-29: `07` is now the decision and build record.)
- [ ] K06 Do not ship word-level ASR without browser/device evidence, informed consent, no-retention proof and privacy/legal approval.

## L. Implementation order with dependency edges
**Owner decision 2026-10-29.** Steps 1 to 4 run in one build as parallel waves (`MASTER-PROMPT.md` section 5): wave 0 freezes the contract `src/types.ts`, the asset key list and the line-key scheme (`e01`-`e20`, `g01`-`g12`); wave 1 builds every unit with disjoint file ownership; wave 2 adds the audio media and the app shell and QA once their inputs exist; wave 3 integrates and verifies. The edges below still order verification: the P1a golden slice (E17 + G03) is verified first. Step 5 stays out of scope and off. No public release happens in this run (`07`).

1. **P0** A01–A11 + J08 foundation; prove SDK import, GLB, build and first-frame evidence.
2. **P1a** B01–B12, C01–C07, D01/D03/D08, E01/E03/E05/E06, F04, G03, J01–J07/J09/J11/J12: golden Momo–Sheru ball story and touch play.
3. **P1b** D02/D09/D10, F01/F02/F03/F05/F06, G01/G02, E02/E04/E07/E08, remaining QA + music. Release only after `06`.
4. **P2** Characters D04–D06, worlds D11–D13, all H/I additions, approved locale (English; `pa.ts` stays disabled until native review) and 20-episode catalog.
5. **P3** K01–K06 independent experiment, no launch dependency.

## M. Definition-of-done template per implemented source file
- [ ] Named file exists in repo on feature branch; links back to PRD task ID in PR.
- [ ] Strict TypeScript passes; public Aura3D API use confirmed; no undefined GLB refs or unreviewed assets.
- [ ] Unit test covers transitions/edge cases; content files pass referential and rights validation.
- [ ] Target route captured, scene not blank, character/audio/tap semantically correct.
- [ ] Parent control, silent-child/no mic, reduced motion and no-autoplay constraints remain intact.
- [ ] Redacted artifacts saved for remote/real-device proof; owner + reviewer sign off (this build: the reviewer is the recorded agent review in `07`, owner instruction 2026-10-29).
- [ ] Status changed only after evidence; docs distinguish planned, prototype, pilot and production.
