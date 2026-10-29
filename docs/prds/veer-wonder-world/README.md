# Veer's Wonder World — Aura3D Product & Engineering PRD
Status: **IN BUILD (prototype) on Aura3D 4.5.0; owner decision 2026-10-29: full catalog, agent review in place of human sign-off** · Created: 2026-10-24 · Updated: 2026-10-29 · Owner: Aura3D product + game engineering · Target: standalone browser app within the Aura3D monorepo.

> **Mission.** Build an original, beautiful, parent-mediated 3D preschool cartoon-and-play universe for a roughly two-year-old child who is learning to communicate. A small recurring cast draws interest; brief meaningful language models, songs, stories, choices, and pauses invite the child to communicate through gaze/gesture, touch, sounds, and emerging words. ABCs, counting, shapes, colours and everyday vocabulary are introduced playfully, **not as required speech milestones**.

## PRD document index (read in order)

| File | Single owner / purpose | Output |
| --- | --- | --- |
| `01-product-learning-and-safety.md` | PM + pediatric speech-language reviewer | Goals, curriculum priorities, parent role, consent, safety and non-goals |
| `02-character-and-content-bible.md` | Creative director + 3D art/audio | Six original characters, world rules, voice direction, art bible, story grammar, brand rules |
| `03-aura3d-architecture-and-contracts.md` | Game architect | Repo-specific SDK mapping; module layout; episode/word/audio/interaction schemas; state machines; microphone boundaries |
| `04-implementation-backlog-by-filename.md` | Tech lead | Exact **proposed** repository filenames, owner, priority, dependency, checkbox tasks and definition of done |
| `05-episodes-games-and-curriculum.md` | Content designer + SLP reviewer | Twenty complete episode concepts, twelve game activities, target language, interactivity, parent extension, launch scripts |
| `06-qa-release-and-execution.md` | QA + release | Device/browser/performance/accessibility/child-safety gates, test plan, evidence, rollout and project-level checklists |
| `07-autonomous-decisions-and-build-record.md` | Build agent (owner instruction 2026-10-29) | Decision log with evidence paths, the agent-review records that stand in for human sign-off, voice casting, content and asset model, and the build record |
| `08-optional-voice-validation.md` | Privacy + SLP (P3 only) | **Planned, not created.** The privacy/accuracy/device-matrix review that must pass before any voice input is enabled (`04` K05) |
| `MASTER-PROMPT.md` | Build lead | The single execution prompt that joins these files into one build (owner decisions, doc corrections, build map, hard rules, verification) |

## Decisions (locked for v0)

1. **Original IP**: six original friends — Momo (host), Lulu (music/movement), GoGo (train), Lumi (literacy/numeracy), Peeko (peekaboo chick; renamed from Pip because Pip is the hero of the live game *Pip's Big Leap*, `tools/site/games.catalog.json`), and Sheru (familiar dog-inspired friend). No character likeness, audio, script, music or art copied from commercial preschool franchises.
2. **Product name**: the public title is **Wonder World** (app id/title; no child name in UI text, titles, routes or logs). The PRD and app directory keep the working name *Veer's Wonder World* / `apps/veer-wonder-world/`. Local content may personalize greetings only through family-local configuration. Do not put child-identifying info in public route names, telemetry, URLs, QA screenshots, or committed audio without separate family approval. This PRD can be public; the **shipped content and data must not expose personal details by default**.
3. **Build scope (owner decision 2026-10-29)**: all six characters, all twenty episodes of `05` and all twelve activities are built now, with one parent hub, recorded narration and short original song motifs. The original launch slice (Momo, Lulu, Sheru, six episodes, three activities) remains the golden vertical slice and the first thing verified. See `07`.
4. **Modes**: Watch & Sing (full 2–4 minute episode, no interaction needed), Play Together (touch plus guided caregiver interaction), optional Voice Play later. All content is completable **without spoken output**.
5. **Communication targets before drill**: request (“more”, “again”), action (“go”, “stop”, “open”), social (“hi”, “bye”), object (“ball”), playful sounds. Alphabet/number exposure runs alongside these, not instead of them. Do not score speech correctness or claim the app teaches a child to talk.
6. **Parent-mediated**: short sessions with natural end screens and a suggested off-screen equivalent (“Now roll your real ball together”). No endless autoplay, streaks, lockouts, leaderboards, ads, in-app purchases, manipulative retention mechanics, public profiles, or social/community features.
7. **Privacy**: no microphone requirement for v0; if enabled in a later experiment, parent opt-in, active-turn indicator, local processing preference and no audio retention by default; no cloud speech service without explicit informed consent and privacy review. Never use voice inference as clinical diagnosis.
8. **Accessibility**: child-safe large touch targets, minimal UI, audio captions in parent mode, mute/replay, reduced motion, high contrast, screen-reader-friendly parent UI, no surprise loud sounds and low-stimulation option.
9. **Routes and claims**: build in a *new* `apps/veer-wonder-world/` application rather than rewriting game-kit or existing showcasers. Shared engine changes require a proven reproducible gap, tests and a separate review. All new routes are labeled prototype until evidence gates pass.

## Definition of the product

### Child experience
- Familiar animated companions converse in short, clear, expressive sentences and model useful language. Their emotions and talking cue (a gentle squash/bob pulse while a line plays; the generated models have no mouth morphs, so it is never called lip sync) support understanding rather than constant spectacle.
- Every episode has one concrete problem, one or two repeatable actions, one short original song or rhythmic phrase, a turn-taking pause and a happy finite ending.
- Large objects can be tapped; optional drag snaps into place; no twitch timing, precision motor tasks, three-option quizzes or “say it correctly to continue.”
- A child who points, laughs, vocalizes or only taps can participate equally; adult can interpret gestures outside the app.
- Letters are clearly distinguished from sounds (e.g. letter B named “bee”, /b/ in “ball”); numbers correspond to counted objects, beginning with quantities 1–3.

### Caregiver experience
- Parent gate, locale/voice, mode, sound/motion, content selection, optional short session target, and a word shortlist under parent control.
- Parent prompts are small and actionable: “Model ‘ball’,” “Pause,” “Expand any attempt,” “Now find the real ball.” No therapist-like prescription or automated language assessment.
- Manual observation notes optional and local-only by default; do not infer acquisition from taps, microphone output, or view time.

## Phased scope and dependencies

| Phase | Product slice | Exit condition | Build status (2026-10-29) |
| --- | --- | --- | --- |
| P0 Foundation | Pin Aura3D 4.5.0, asset strategy, character/scene proofs, stable mobile baseline | Engine consumer app builds and draws a verified first frame on target devices; no fabricated APIs/assets | Building now; target-device frames wait for the physical-device runs (`07`) |
| P1 Pilot | Momo, Lulu, Sheru + 6 episodes + Bubble, Train, Ball activities + parent panel | All flows pass child-safety, parent review, touch, audio, mobile and offline-activity exit gates; parent, caregiver and SLP review is recorded agent review (owner instruction) | Building now; the mobile gate waits for the physical-device runs (`07`) |
| P2 Content expansion | Peeko, Lumi, GoGo; remainder of 20 episodes; 12 games total; optional bilingual packs | Content schema validated; every episode has scripted language + caregiver bridge and explicit QA receipts | Building now (owner decision 2026-10-29); bilingual packs still deferred |
| P3 Optional voice | Parent-gated voice reactions (sound presence first, carefully scoped speech recognition later) | Compatibility/privacy audit, false-negative tests, clear controls and touch fallback; **do not ship otherwise** | Not built; microphone stays off |

No schedule promises. Implement and sign off by evidence gates, not by calendar dates. **Owner decision 2026-10-29**: P0, P1 and P2 are built together; human sign-offs (SLP, caregiver, creative, rights, legal) are replaced by recorded agent review for this build (`07`), while the external privacy/legal review that `01` §8 requires before any public launch stays with the publish decision. Claims stay limited: the app is a **prototype** until real-device evidence exists; no efficacy or therapy claims; no public release in this run; the app is **not** added to the site build (`showcaseRoutes` in `marketing/scripts/build-showcase-routes.mjs`), the site catalog (`tools/site/games.catalog.json`), the showcase index or the sitemap, and `apps/veer-wonder-world/index.html` carries `noindex`. Publishing a children's app is a separate owner decision. Every safety rule in `01` still applies.

## What exists in Aura3D (verified in the repo; not proof of our new app)

- Repository: https://github.com/auraoneai/aura3d ; README describes TypeScript scene nodes, typed GLB assets, mini-game scaffold, and `@aura3d/engine/game`.
- `docs/api/game-kit.md`: **real** `createGame` is imported from `@aura3d/engine/game`. The root `@aura3d/engine` `createGame` is a **headless stub**.
- `docs/api/qa-kit.md`: `createFixedStepLoop`, `installQaHooks`, `readQaParams`, deterministic seeded input/replay.
- `docs/api/audio-synth.md`: `createCueBank`, sample slices, music buses, single AudioContext; these are SFX/music primitives, **not** a ready-made toddler narrator or child ASR.
- `docs/api/model-loader.md` and `docs/agents/asset-workflow.md`: typed, licensed, same-origin GLBs with hashes/provenance. Require real approved hero models, not primitive stand-ins for release.
- `docs/agents/claims-and-boundaries.md`: no public claim without tested capture and runtime evidence.
- Version: pin **Aura3D 4.5.0** (npm `latest`; published 2026-10-29 02:29 UTC, `CHANGELOG.md` `## 4.5.0 (2026-10-28)`). The stock Vite build fix (`"readFileSync" is not exported by "__vite-browser-external"`) shipped in 4.1.3 (`CHANGELOG.md` `## 4.1.3`) and 4.5.0 includes it. Inside the monorepo the app uses `workspace:*` dependencies (`apps/veer-wonder-world/package.json`).
- Workspace: `pnpm-workspace.yaml` lists only `packages/*` and `workers/*`, so `apps/*` are not pnpm workspace members and `pnpm --filter <app>` does not reach them. Build, test and check the app with the root-level commands in `06` section 4.
- `README.md`: software-WebGL2 evidence is **not** real-GPU confirmation. Remote capture commands are preferred inside monorepo.

## The first demonstrable pilot

**“Momo’s Ball Day”**: Momo looks for a ball; Sheru brings it; Lulu leads “go/stop” in a song; the child can watch without interacting or tap a giant ball to advance; Momo pauses inviting “more” but doesn’t demand speech. Caregiver sees “Try rolling a real ball now.” This is the golden end-to-end vertical slice for art, animation, recorded narration, captions, input, deterministic QA and safety.

## P0 go/no-go checklist
- [x] PRD reviewed: agent review stands in for the PM, Aura3D engineer, creative director and pediatric speech-language advisor (owner instruction 2026-10-29; record in `07` section 2; it is not a clinical review).
- [ ] Verify the app builds against Aura3D 4.5.0 (`workspace:*` in the monorepo, root-level commands in `06` section 4); capture resolved engine version/commit.
- [ ] Verify `@aura3d/engine/game` import in sample and avoid headless root stub.
- [x] Select valid original character/art/voice rights strategy; create asset manifests: Meshy text-to-3D and ElevenLabs through Kiro Prism with a provenance record per file, free-tier output re-rendered on a paid tier before any commercial release (`07`); model list `apps/veer-wonder-world/tools/wonder-assets.json` (59 models), generated `src/aura-assets.ts` and `src/audio-manifest.ts`.
- [ ] Agree target devices (iPad Safari, iPhone Safari, Android Chrome, desktop) and performance baselines. The device list is `06` section 5; baselines need the physical-device runs, an open acceptance item in `07`.
- [x] Approve family privacy model, no-microphone v0, parent gate, local-only notes (agent privacy review in `07` section 2, owner instruction 2026-10-29).
- [x] Scope frozen: all twenty episodes and twelve activities in `05-episodes-games-and-curriculum.md` (owner decision 2026-10-29).
- [x] Agree evidence artifacts per `06-qa-release-and-execution.md`: `evidence/veer-wonder-world/{p0,p1,p2}/` with commit SHA, engine version, viewport, renderer string and known gaps (`MASTER-PROMPT.md` section 8, `06` section 7).

## Engineering start prompt

> Implement *Wonder World* (P0, P1 and P2 together, owner decision 2026-10-29) using these PRD files as the canonical spec. Work only on a feature branch. Read repo `llms.txt`, `docs/agents/claims-and-boundaries.md`, `docs/agents/build-a-game.md`, `docs/agents/new-game-checklist.md`, `docs/agents/lessons-learned.md`, `docs/agents/effects-and-scene-kits.md`, `docs/api/auravoice-bridge.md` and source public exports first. Call `warmPrograms(app)` before the first visible frame, present motion through `createFixedStepPresenter` and check it with `runMotionGate` (all from `@aura3d/engine/game`), and run the `node tools/game-checks/run.mjs <slug>` checks before calling a route done (the runner resolves only live games in `docs/workflows/game-inventory.json`, so this unlisted prototype runs the same checks with `node apps/veer-wonder-world/tools/game-checks.mjs`, `07` B13). Respect each proposed filename in `04`, report deviations, and create reproducible browser/device evidence. Never claim production-ready without passing `06`. Do not add ASR, analytics on child speech, auto-play loops, or medical claims in any phase of this build.

## Evidence and external guidance (not product effectiveness claims)
- Aura3D: `docs/api/game-kit.md`, `docs/agents/build-a-game.md`, `docs/api/qa-kit.md`, `docs/agents/claims-and-boundaries.md`.
- ASHA early intervention/family-centered responsive strategies: https://www.asha.org/practice-portal/professional-issues/early-intervention/
- ASHA focused stimulation and expansions: https://www.asha.org/practice-portal/clinical-topics/spoken-language-disorders/
- AAP on co-viewing and age 2–5 media: https://publications.aap.org/pediatrics/article/138/5/e20162591/60333/Media-and-Young-Minds
- MDN speech recognition compatibility / potential server processing: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
