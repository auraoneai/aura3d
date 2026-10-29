# PRD 06 — QA Gates, Validation Matrix, Release, Evidence and Execution Plan
Status: **QA PLAN IN USE for the 2026-10-29 build; no result is claimed in this file** (results go to the build record in [`07`](07-autonomous-decisions-and-build-record.md) section 4 and to `evidence/veer-wonder-world/`) · Owners: QA, child UX lead, Aura3D engineer, pediatric SLP reviewer, privacy and asset rights owner (for this build the SLP, caregiver, rights and privacy sign-offs are recorded agent reviews, owner instruction 2026-10-29; agent review is not clinical or legal review and relaxes no gate)
Dependencies: [product](01-product-learning-and-safety.md), [architecture](03-aura3d-architecture-and-contracts.md), [by-file tasks](04-implementation-backlog-by-filename.md), [canonical content](05-episodes-games-and-curriculum.md)

## 1. Release philosophy
An Aura3D game compiling or showing a screenshot is **not** enough. A new route earns its status only through: tested API/build, validated typed assets, real visible 3D frames, story completion, child-safe audio/touch behaviour, no-microphone operation, caregiver comprehension, cross-device proof and documented rights.

Labels:
- **Roadmap**: specified only (the PRD state until 2026-10-29).
- **Prototype**: rendered but incomplete content/QA (the label of the 2026-10-29 build until the gates below pass on real devices).
- **Pilot**: six episodes and three games work on agreed real devices, limited trusted-caregiver evaluation and all gates green.
- **Production**: separate explicit legal/privacy/security/accessibility, hosting and measured device sign-offs. No automatic promotion from pilot.

## 2. Hard blocking gates
| Gate | Requirement | Evidence / owner | Status (2026-10-29 build; results in `07` section 4) |
| --- | --- | --- | --- |
| G0 Build integrity | Fixed and verified Aura3D package/commit builds consumer Vite app, correct `/game` import, no type bypass | `pnpm/npm` typecheck/build log + source review / BE | In progress: Aura3D 4.5.0, root-level commands (section 4) |
| G1 Asset provenance | Every hero GLB and recorded song/VO is owned/licensed, optimized, hashed and admitted; clips inspected | Rights manifest + CLI reports / ART/legal | In progress: provenance per file; rights is agent review, owner instruction (`07`) |
| G2 Rendering | Expected characters/objects visible in first frame and all interaction beats; no black frames/blank models | Route-health + screenshots + diagnostics / QA | In progress: remote software WebGL2 only, which is not real-GPU evidence |
| G3 Interaction | P1 activities usable with single tap; every episode watch-only completes, with zero child input | Deterministic unit and remote browser specs / QA | In progress (all 20 episodes and 12 activities, owner decision) |
| G4 Audio | Narration intelligible; no two voice lines collide; browser gesture unlock, mute and no-sound fallback work | Real-device audio checklist / AUDIO/QA | In progress for automated checks; the real-device checklist is an open acceptance item (`07`) |
| G5 Child safety | No speech prerequisite, grading or ASR; calm visuals, no flashing/startling, offline end card and all-done | Manual review + code guard / EDU/QA | In progress: code guard plus agent review, owner instruction (`07`) |
| G6 Accessibility | Parent screen-reader/keyboard controls, captions, large touch, reduced motion and contrast | Device/manual accessibility checklist / FE/QA | In progress: agent review plus remote specs; device checks are open (`07`) |
| G7 Privacy | No child audio collection, identifiers in logs or public assets, nor third-party tracking; optional local settings clearable | Static/privacy review / security | In progress: J07 plus agent privacy review (`07`) |
| G8 Expert review | SLP reviews targets, pauses and language claims; caregivers approve story tone and attention demands | Signed content review note / PM/SLP | Agent review, owner instruction 2026-10-29 (record in `07` section 2; not a clinical review) |
| G9 Real hardware | iPad + iPhone Safari, Android Chrome and one desktop path tested; software WebGL2 isn't real-GPU performance proof | Device build/version/frames/audio/touch receipts / QA | Open: physical-device runs are an owner action (`07` section 4) |
| G10 Deployment | Correct cache/asset paths, safe rollback, no autoplay-next and redacted evidence | Staging run + check-deploy + rollback / BE | No public deploy in this run (owner decision); `check-deploy --browser` on the remote runner only |

If a gate is red, mark prototype and publish **no “ready for children” or “improves speech” claim**.

## 3. Functional test cases (must be automated where possible)

### Episode / content state
- [ ] QA-E01 Each of six P1 episodes has an intro, problem, visible modelled word, optional child turn, resolution and finite exit.
- [ ] QA-E02 Every P1 Watch & Sing episode finishes without ANY touch or voice input.
- [ ] QA-E03 Every Play Together episode finishes with touch only; caregiver can skip turn.
- [ ] QA-E04 At an invitation, zero response never creates “wrong,” “try harder,” locked screen or negative label.
- [ ] QA-E05 Tap during narration does not double-advance; taps after route exit are ignored.
- [ ] QA-E06 All content references resolve: word → cue → animation/target/caption/localization; no unreachable beats.
- [ ] QA-E07 Letters feature correct letter name, example initial sound and meaningful object; SLP/educator signs off (this build: agent review in `07`, owner instruction 2026-10-29).
- [ ] QA-E08 Spoken counts match **visible, discretely counted objects** for 1–3.
- [ ] QA-E09 End card suggests an appropriate real-world play action and stops autoplay.
- [ ] QA-E10 Parent has a finite exit path from any beat, including when audio/asset load fails.
- [ ] QA-E11 Catalog includes only approved asset/script bundles; P2 unavailable content does not surface.
- [ ] QA-E12 Music off, captions on, reduced motion and locale settings persist as specified without child tracking.

### Audio, music, animation and interaction
- [ ] QA-A01 On first interaction, narration either unlocks correctly or provides an explicit silent alternative.
- [ ] QA-A02 Music ducks during dialog; narration is clear on phone speakers and modest headphones.
- [ ] QA-A03 No audio overlap during rapid tapping, pause/resume, browser tab hide, route switch or audio failure.
- [ ] QA-A04 SFX short and not startling; no very loud animal sounds or playback at unexpectedly different gain.
- [ ] QA-A05 Talking pulse/gaze/pointing animation aligns to relevant character speaking (no mouth morphs, no lip-sync claim); low-motion version still shows meaning.
- [ ] QA-A06 No camera shake or movement requiring eye tracking; camera remains bounded to scene.
- [ ] QA-A07 Largest child targets tested for one-handed and imprecise taps on actual devices; drags have tap alternative.
- [ ] QA-A08 Parent gate and overlay never obscure only child action or trap user.
- [ ] QA-A09 Pause/resume restores correct visual + audio beat exactly once; early disposal terminates all pending media.

### Privacy / child safety
- [ ] QA-P01 Verify child mic permission is never requested in P0/P1/P2; P3 feature flag is OFF in released build.
- [ ] QA-P02 No code records/transcribes child speech, assumes a sound equals a word or grades pronunciation.
- [ ] QA-P03 No photos, named child identifiers, private voice packs or identifiable notes in repository/build/source maps/capture.
- [ ] QA-P04 No ads, social sharing, progress streaks, infinite autoplay, purchase prompts or “just one more” manipulation.
- [ ] QA-P05 Family audio/local voice pack import remains private and requires consent and deletion controls.
- [ ] QA-P06 Optional parent notes local-only, opt-in, non-diagnostic and removable.
- [ ] QA-P07 Test privacy with browser devtools: network, storage, logs, error reporting and third-party requests.
- [ ] QA-P08 Review accessibility for audio-muted, low-motion, high contrast and keyboard parent interaction.

## 4. Deterministic game runtime / Aura3D verification
Use the repository's published documented pipeline; **commands are instructions for after implementation, not evidence run**.

1. Read `llms.txt`, `docs/agents/claims-and-boundaries.md`, `docs/agents/build-a-game.md`, `docs/agents/new-game-checklist.md`, `docs/agents/lessons-learned.md`, `docs/agents/effects-and-scene-kits.md`, `docs/api/auravoice-bridge.md` and current public exports. Use `warmPrograms` (await it before the first visible frame), `createFixedStepPresenter` (present between fixed steps) and `runMotionGate` (motion check), all from `@aura3d/engine/game`.
2. Build/typecheck from the worktree root with root-level commands. `apps/*` is not a pnpm workspace member (`pnpm-workspace.yaml` lists only `packages/*` and `workers/*`), so `pnpm --filter <app>` does not reach the app. The full list is `MASTER-PROMPT.md` section 8:
   ```bash
   pnpm exec tsc -p apps/veer-wonder-world/tsconfig.json --noEmit
   (cd apps/veer-wonder-world && ../../node_modules/.bin/vitest run --config vitest.config.ts)
   node apps/veer-wonder-world/tools/validate-wonder-world-content.mjs
   node apps/veer-wonder-world/tools/gen-aura-assets.mjs && node apps/veer-wonder-world/tools/gen-audio-manifest.mjs && git diff --exit-code apps/veer-wonder-world/src
   ```
3. Unit-test pure episode director, timeouts, touch routing and content validator; **no Date/Math.random or DOM in pure sim**; use `createCountedRng` only if randomness is required.
4. Implement `installQaHooks` and `readQaParams`; capture initial state and after scripted tap, zero-input timeout, pause, restart, dispose and end. Assertions: deterministic snapshots.
5. Use `installSafetyNet` (and `installBlackFrameGuard`) from `@aura3d/debug` for diagnostics, including `?diag=1`; run non-black render/route-health checks on every P1 route. Run the static game checks of `node tools/game-checks/run.mjs <slug>`; the runner resolves only live games in `docs/workflows/game-inventory.json`, which this unlisted prototype must not join (owner decision 2026-10-29). `node apps/veer-wonder-world/tools/game-checks.mjs` therefore runs the same per-game checks (`GAME_CHECKS`) against the app as an unlisted entry (`07` B13).
6. Validate typed GLB manifests, sha256 and licenses via supported `aura3d assets validate` workflow; inspect animation clips before relying on them (no admitted model has clips, because the Meshy rig was rejected, `07` C6); run `pnpm exec aura3d assets validate --skin <glb>` on any rigged model admitted later.
7. Remote-browser runs in monorepo: `EXTRA_DIRS="apps/veer-wonder-world" SPECS="tests/browser/wonder-world-*.spec.ts" tools/remote-acr/run.sh` (serverless ACR Tasks on `az-auraone-gurbaksh`; logs in `tests/reports/remote-acr/<RUN_ID>/`). `apps/veer-wonder-world/tools/remote-run.sh [spec stems]` sets the same variables and deletes the run image afterwards (`KEEP_IMAGE=0`). Avoid assuming local Playwright or Docker permitted; repo expects remote browser runs.
8. `check-deploy` from `@aura3d/cli` 4.5.0 on the built app, run from `apps/veer-wonder-world`: `aura3d check-deploy --dist <dist>` for the static check, and `aura3d check-deploy --dist <dist> --browser --route /` only on the remote runner (it loads the build in a headless browser). The app's `aura.assets.json` lists no entries (the file must exist, or check-deploy fails), so the static pass checks no model files; `07` B19 records what covers them. The repo-root spec `tests/browser/wonder-world-build.spec.ts` (`apps/veer-wonder-world/tools/remote-run.sh build`) builds the app with Vite and runs `check-deploy --dist dist --no-assets --browser --route /` from the app folder on the remote runner. Never call a source-only prototype “deployed”.
9. Capture relevant screenshots and evidence reports under `evidence/veer-wonder-world/{p0,p1,p2}/` with commit SHA, engine version, viewport, renderer string, test device and known gaps. Software WebGL2 results are not real-GPU or device evidence; say so wherever they appear. Never include real child image or child audio.
10. Real hardware pass: after passing software WebGL2, run on actual supported devices and note GPU/browser and audio/touch outcome. For a real-GPU desktop capture, add a scenario to `tools/real-gpu/scenarios.json` (`path`, `settleMs`, `steps`) and run `tools/real-gpu/run.sh` with `REAL_GPU_BASE` pointing at a non-public preview or a locally served build (the default base is the production site, where this app is not deployed); it opens a real Chrome window, so the owner runs it on a Mac or it runs on a GPU VM; an agent never runs it on the Mac (`tools/real-gpu/README.md`).

**Version guard**: pin Aura3D 4.5.0 (npm `latest`; `CHANGELOG.md` `## 4.5.0`). The 4.1.2 stock Vite Node-import build issue (`"readFileSync" is not exported by "__vite-browser-external"`) was fixed in 4.1.3 (`CHANGELOG.md` `## 4.1.3`), and 4.5.0 includes the fix; inside the monorepo the app builds from `workspace:*` sources. The first gate (G0) must still prove a build on the pinned version. Record the resolved version and commit in the evidence; **do not pretend “latest” implies fixed** for any defect found later.

## 5. Device/browser matrix (required before pilot)
| Device / mode | Need to test | Evidence |
| --- | --- | --- |
| Physical iPad Safari portrait | Tap, audio unlock after gesture, text/captions, target size, resume, fixed camera, asset memory | Screen capture + route-health + human review |
| Physical iPad Safari landscape | Same plus overlays/safe-area, rotation and pauses | Screenshots + interaction log |
| Physical iPhone Safari portrait | Smallest supported action targets, fixed scenes, sound/mute, silent experience | Video or visual QA + logging without PII |
| Android phone Chrome | WebGL2 render, tap timing, pause/background, audio, fast repeated tap | Capture + logs |
| Desktop Chrome | Keyboard parent panel, pause, captions, deterministic hooks | Remote Playwright + screenshot (software WebGL2); real-GPU capture through `tools/real-gpu` (section 4 step 10) |
| Reduced-motion mode | Every above where feasible, no non-essential bouncing/FX | Side-by-side captures |
| Low resource network/device | Missing/slow media gracefully falls back; no blank scenes/deadlocked state | Network throttle + logs |
| Browser denies audio | Can proceed with child-safe visuals and parent captions; no repeated nag | Manual test |
| Browser does not support microphone | P1 unaffected, all activities complete | No-mic test |

No inferred microphone compatibility from generic desktop tests. P3 requires **additional** consent/provider-specific/privacy and cross-device tests.

## 6. Proposed performance budgets (not measurements)
These are starting targets to validate and change from device evidence:
- **Frame rate**: aim stable ~30 FPS during interactive scenes on baseline physical tablet; no frame freeze longer than a meaningful beat; avoid real-time particle overload.
- **Input acknowledgement**: aim visible response within ~150 ms after tap on tested device, except when an authored “anticipation” beat is intentionally paced.
- **Assets**: total pilot optimized 3D model/media data initially target around **25 MB or less** for game art where feasible, use streaming compressed voice tracks. Actual size budget depends on load tests; separate audio estimate.
- **Memory**: dispose unused scenes, stop audio and release textures across multiple episode plays; run a repeat-cycle memory inspection.
- **Audio**: maintain a single audio-owner policy and ensure no overlapping narrator lines; audible mix must be reviewed by human.
- **Start**: measure cold/warm first meaningful frame on mobile; set final threshold only from selected test devices and network conditions, not unsupported guesses.

Repo asset workflow suggests keeping models reasonably small and all model assets for a game around ~25MB. These are **targets**, not validated P1 results. Never use software WebGL2 frame time as a real-GPU benchmark.

## 7. Evidence package / release receipt
A completed pilot PR should link:
- Commit SHA and exact engine package/version, platform/browser build identifiers.
- Passing strict build, unit and browser logs.
- Five sample route screenshots: Momo first frame, invite beat, visible Sheru fetch, Lulu music action, counting cookies with 1–3 objects; low motion before/after.
- One fully recorded synthetic **game** playback without any child speech (no real child data).
- Audio QA matrix: narration audible, SFX/music ducking, pause/resume, all-done, blocked audio.
- Asset rights CSV/JSON/manifest, actual inspected GLB animation clip list.
- Accessibility review, caregiver UX review, SLP content review signoff, privacy inspection (this build: the agent-review records in `07` section 2, owner instruction 2026-10-29).
- Risk list and unresolved limitations (including anything only proven in software WebGL2).
- Staging URL, route-health JSON and rollback procedure once deployment is separately approved.
- “No emails sent / no external voice data transmitted” only if verified; no presumed privacy claim without checking network/request paths.

## 8. Human evaluation (research, not treatment efficacy)
Owner decision 2026-10-29: the caregiver and SLP review items below are agent reviews for this build (`07` section 2). The observation items need a real caregiver and child with consent, so an agent cannot do them; they stay open with the physical-device runs (`07` section 4) and gate the `pilot` label, not the prototype.

Pre-pilot:
- [ ] Caregiver reviews characters for warmth, clarity, pace, overstimulation and ability to stop.
- [ ] SLP reviews model/pause/respond approach, everyday word targets and alphabet/number presentation.
- [ ] Observe a **short co-play session** with caregiver invitation and consent; default no video or audio recording.
- [ ] Ask whether child engages with a familiar character, points/gestures, notices named object, voluntarily participates, and enjoys moving to real toy play.
- [ ] Note opportunities for caregiver to talk and pause; do not increase screen time as a success target.
- [ ] Test quiet-child and child-walks-away scenarios; app should continue or finish calmly, never press for speech.
- [ ] Iterate from human observations; do not infer language acquisition from touch rate/view count.

No statements such as “this app teaches a nonverbal child to talk”, “increases vocabulary by X%” or “clinically effective” without independent appropriately designed research.

## 9. Workstream execution / ownership
Owner decision 2026-10-29: P0, P1 and P2 run in one build as parallel waves (`MASTER-PROMPT.md` section 5, `04` section L); the rows below keep the deliverables and the order in which they are verified. Expert sign-offs in this table are agent reviews for this build (`07`).

| Phase | Workstream lead | Source tasks | Deliverables before moving on |
| --- | --- | --- | --- |
| P0 | BE + ART + QA | A01–A11, J08 | Working pinned SDK, typed character, non-black frame, audio unlock, evidence |
| P1a | BE + EDU + AUDIO | B/C/D(Momo/Sheru)/E(FE basics)/F04/G03/J unit | Golden E17 Sheru ball chapter + Sheru Ball Game, both no-voice |
| P1b | ART + AUDIO + FE + QA | remaining six pilot episodes, three games, parent controls | Six real short episodes, stable app, rights + expert review |
| P2 | Creative + EDU + BE | P2 14 episodes, 9 activities, 3 new characters | Full 20/12 catalog and language/content signoff |
| P3 optional | Privacy + BE + SLP | mic experiment, provider/device review | Explicit consent/compatibility/safety; otherwise **off** |

Be honest about phases: PRD commit alone does **not** create games; it creates reviewable execution work.

## 10. Checklists for launch-day release decision

### Engineering checklist
- [ ] Exact branch/commit pin captured.
- [ ] Public Aura3D game import and CLI asset pipeline verified.
- [ ] All P1 six episode+three activity specs validated and playable on real test devices.
- [ ] All “no response / microphone disabled” tests pass; every activity has tap path.
- [ ] No deadlock on slow media, asset failure or tab hide.
- [ ] QA screenshots, route-health and GLB clips proven.
- [ ] Parent settings and “all done” truly work; no autoplay-next.
- [ ] Deployment/staging and rollback documented.

### Creative / educational checklist
- [ ] Characters original, rights cleared, appealing at small device size (this build: agent rights and creative review in `07`; a trademark search remains before any public release, `02` section 1).
- [ ] Songs, voice, sound effects and visual actions align and do not overwhelm.
- [ ] Speech-language reviewer signs off non-pressuring prompts, vocabulary and pauses (this build: agent review in `07`).
- [ ] Letter names/sounds accurately distinguished, count to 3 tied to visible objects.
- [ ] Offline parent activity present at end of every scene.
- [ ] Pilot learning statements confined to “language exposure/opportunities for co-play”.

### Child privacy / accessibility checklist
- [ ] No personal audio/photo/child name shipped publicly or saved without consent.
- [ ] No microphone permission or speech inference in P1.
- [ ] No tracking ads or third-party analytics that could profile the child.
- [ ] No screen-time-extending streaks, rewards or auto-next.
- [ ] Child actions large and forgiving; parent UI has captions, mute, accessible labels and reduced motion.
- [ ] External privacy/legal review before public production use by children (stays open: it belongs to the separate owner publish decision, `07` section 4; agent review does not replace it).

## 11. Engineering handoff prompt
> Work inside the `auraoneai/aura3d` repo on a new implementation branch. Read `docs/prds/veer-wonder-world/README.md` through `07-autonomous-decisions-and-build-record.md` in order (or run `MASTER-PROMPT.md`, which joins them), then `llms.txt`, `docs/agents/claims-and-boundaries.md`, `docs/agents/build-a-game.md`, `docs/agents/new-game-checklist.md`, `docs/agents/lessons-learned.md`, `docs/agents/effects-and-scene-kits.md` and `docs/api/auravoice-bridge.md`. Await `warmPrograms(app)` before the first frame, present motion with `createFixedStepPresenter` and check it with `runMotionGate` (all `@aura3d/engine/game`), and run the `node tools/game-checks/run.mjs <slug>` checks (section 4 step 5). Owner decision 2026-10-29: build P0, P1 and P2 together, verifying the E17/G03 P1a vertical slice first, following **proposed filenames** `04`. Use `@aura3d/engine/game` for `createGame`, approved typed same-origin GLBs, deterministic state, recorded narration, touch fallback and parent controls. Treat voice recognition as out-of-scope and OFF. Document deviations and unresolved engine gaps, run reproducible type/asset/unit/remote-browser/real-device gates, attach evidence, and carry the same gates through every remaining episode and activity. Never assert finished functionality from a PRD-only change; keep proprietary family media outside the public repo.
