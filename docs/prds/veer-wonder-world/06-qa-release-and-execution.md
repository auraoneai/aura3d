# PRD 06 — QA Gates, Validation Matrix, Release, Evidence and Execution Plan
Status: **PROPOSED QA PLAN; ZERO IMPLEMENTATION TESTS CLAIMED** · Owners: QA, child UX lead, Aura3D engineer, pediatric SLP reviewer, privacy and asset rights owner
Dependencies: [product](01-product-learning-and-safety.md), [architecture](03-aura3d-architecture-and-contracts.md), [by-file tasks](04-implementation-backlog-by-filename.md), [canonical content](05-episodes-games-and-curriculum.md)

## 1. Release philosophy
An Aura3D game compiling or showing a screenshot is **not** enough. A new route earns its status only through: tested API/build, validated typed assets, real visible 3D frames, story completion, child-safe audio/touch behaviour, no-microphone operation, caregiver comprehension, cross-device proof and documented rights.

Labels:
- **Roadmap**: specified only (this PRD state).
- **Prototype**: rendered but incomplete content/QA.
- **Pilot**: six episodes and three games work on agreed real devices, limited trusted-caregiver evaluation and all gates green.
- **Production**: separate explicit legal/privacy/security/accessibility, hosting and measured device sign-offs. No automatic promotion from pilot.

## 2. Hard blocking gates
| Gate | Requirement | Evidence / owner | Status at PRD creation |
| --- | --- | --- | --- |
| G0 Build integrity | Fixed and verified Aura3D package/commit builds consumer Vite app, correct `/game` import, no type bypass | `pnpm/npm` typecheck/build log + source review / BE | Not run |
| G1 Asset provenance | Every hero GLB and recorded song/VO is owned/licensed, optimized, hashed and admitted; clips inspected | Rights manifest + CLI reports / ART/legal | Not run |
| G2 Rendering | Expected characters/objects visible in first frame and all interaction beats; no black frames/blank models | Route-health + screenshots + diagnostics / QA | Not run |
| G3 Interaction | P1 activities usable with single tap; every episode watch-only completes, with zero child input | Deterministic unit and remote browser specs / QA | Not run |
| G4 Audio | Narration intelligible; no two voice lines collide; browser gesture unlock, mute and no-sound fallback work | Real-device audio checklist / AUDIO/QA | Not run |
| G5 Child safety | No speech prerequisite, grading or ASR; calm visuals, no flashing/startling, offline end card and all-done | Manual review + code guard / EDU/QA | Not run |
| G6 Accessibility | Parent screen-reader/keyboard controls, captions, large touch, reduced motion and contrast | Device/manual accessibility checklist / FE/QA | Not run |
| G7 Privacy | No child audio collection, identifiers in logs or public assets, nor third-party tracking; optional local settings clearable | Static/privacy review / security | Not run |
| G8 Expert review | SLP reviews targets, pauses and language claims; caregivers approve story tone and attention demands | Signed content review note / PM/SLP | Not done |
| G9 Real hardware | iPad + iPhone Safari, Android Chrome and one desktop path tested; software WebGL2 isn't real-GPU performance proof | Device build/version/frames/audio/touch receipts / QA | Not run |
| G10 Deployment | Correct cache/asset paths, safe rollback, no autoplay-next and redacted evidence | Staging run + check-deploy + rollback / BE | Not run |

If a gate is red, mark prototype and publish **no “ready for children” or “improves speech” claim**.

## 3. Functional test cases (must be automated where possible)

### Episode / content state
- [ ] QA-E01 Each of six P1 episodes has an intro, problem, visible modelled word, optional child turn, resolution and finite exit.
- [ ] QA-E02 Every P1 Watch & Sing episode finishes without ANY touch or voice input.
- [ ] QA-E03 Every Play Together episode finishes with touch only; caregiver can skip turn.
- [ ] QA-E04 At an invitation, zero response never creates “wrong,” “try harder,” locked screen or negative label.
- [ ] QA-E05 Tap during narration does not double-advance; taps after route exit are ignored.
- [ ] QA-E06 All content references resolve: word → cue → animation/target/caption/localization; no unreachable beats.
- [ ] QA-E07 Letters feature correct letter name, example initial sound and meaningful object; SLP/educator signs off.
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
- [ ] QA-A05 Mouth/gaze/pointing animation aligns to relevant character speaking; low-motion version still shows meaning.
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

1. Read `llms.txt`, `docs/agents/claims-and-boundaries.md`, `docs/agents/build-a-game.md` and current public exports.
2. Build/typecheck the package and app with their newly added `package.json` scripts (e.g. `pnpm --filter <new-app-name> run build` once its actual package name exists).
3. Unit-test pure episode director, timeouts, touch routing and content validator; **no Date/Math.random or DOM in pure sim**; use `createCountedRng` only if randomness is required.
4. Implement `installQaHooks` and `readQaParams`; capture initial state and after scripted tap, zero-input timeout, pause, restart, dispose and end. Assertions: deterministic snapshots.
5. Use `installSafetyNet` for diagnostics, including `?diag=1`; run non-black render/route-health checks on every P1 route.
6. Validate typed GLB manifests, sha256 and licenses via supported `aura3d assets validate` workflow; inspect animation clips before relying on them.
7. Remote-browser runs in monorepo: follow `tools/remote-acr/run.sh` instructions. Avoid assuming local Playwright or Docker permitted; repo expects remote browser runs.
8. `npx @aura3d/cli@latest check-deploy --dist dist` (adjust actual app output directory after scaffold) for production bundle. Never call a source-only prototype “deployed”.
9. Capture relevant screenshots and evidence reports under `evidence/veer-wonder-world/{p0,p1}/` with commit SHA, version, viewport, test device and known gaps. Never include real child image or child audio.
10. Real hardware pass: after passing software WebGL2, run on actual supported devices and note GPU/browser and audio/touch outcome.

**Version guard**: 4.1.2 notes a stock Vite Node import build issue; 4.1.3 described as unreleased in source on 2026-10-24. First gate must use a verifiably fixed build; **do not pretend “latest” implies fixed**. See repo `CHANGELOG.md`.

## 5. Device/browser matrix (required before pilot)
| Device / mode | Need to test | Evidence |
| --- | --- | --- |
| Physical iPad Safari portrait | Tap, audio unlock after gesture, text/captions, target size, resume, fixed camera, asset memory | Screen capture + route-health + human review |
| Physical iPad Safari landscape | Same plus overlays/safe-area, rotation and pauses | Screenshots + interaction log |
| Physical iPhone Safari portrait | Smallest supported action targets, fixed scenes, sound/mute, silent experience | Video or visual QA + logging without PII |
| Android phone Chrome | WebGL2 render, tap timing, pause/background, audio, fast repeated tap | Capture + logs |
| Desktop Chrome | Keyboard parent panel, pause, captions, deterministic hooks | Playwright + screenshot |
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
- Accessibility review, caregiver UX review, SLP content review signoff, privacy inspection.
- Risk list and unresolved limitations (including anything only proven in software WebGL2).
- Staging URL, route-health JSON and rollback procedure once deployment is separately approved.
- “No emails sent / no external voice data transmitted” only if verified; no presumed privacy claim without checking network/request paths.

## 8. Human evaluation (research, not treatment efficacy)
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
- [ ] Characters original, rights cleared, appealing at small device size.
- [ ] Songs, voice, sound effects and visual actions align and do not overwhelm.
- [ ] Speech-language reviewer signs off non-pressuring prompts, vocabulary and pauses.
- [ ] Letter names/sounds accurately distinguished, count to 3 tied to visible objects.
- [ ] Offline parent activity present at end of every scene.
- [ ] Pilot learning statements confined to “language exposure/opportunities for co-play”.

### Child privacy / accessibility checklist
- [ ] No personal audio/photo/child name shipped publicly or saved without consent.
- [ ] No microphone permission or speech inference in P1.
- [ ] No tracking ads or third-party analytics that could profile the child.
- [ ] No screen-time-extending streaks, rewards or auto-next.
- [ ] Child actions large and forgiving; parent UI has captions, mute, accessible labels and reduced motion.
- [ ] External privacy/legal review before public production use by children.

## 11. Engineering handoff prompt
> Work inside the `auraoneai/aura3d` repo on a new implementation branch. Read `docs/prds/veer-wonder-world/README.md` through `06-qa-release-and-execution.md` in order, then `llms.txt`, `docs/agents/claims-and-boundaries.md` and `docs/agents/build-a-game.md`. Implement P0 and the E17/G03 P1a vertical slice first, following **proposed filenames** `04`. Use `@aura3d/engine/game` for `createGame`, approved typed same-origin GLBs, deterministic state, recorded narration, touch fallback and parent controls. Treat voice recognition as out-of-scope and OFF. Document deviations and unresolved engine gaps, run reproducible type/asset/unit/remote-browser/real-device gates, attach evidence, then implement remaining P1 episodes and activities. Never assert finished functionality from a PRD-only change; keep proprietary family media outside the public repo.
