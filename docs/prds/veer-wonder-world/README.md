# Veer's Wonder World — Aura3D Product & Engineering PRD
Status: **PROPOSED / NOT IMPLEMENTED** · Created: 2026-10-24 · Owner: Aura3D product + game engineering · Target: standalone browser app within the Aura3D monorepo.

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

## Decisions (locked for v0)

1. **Original IP**: six original friends — Momo (host), Lulu (music/movement), GoGo (train), Lumi (literacy/numeracy), Pip (peekaboo), and Sheru (familiar dog-inspired friend). No character likeness, audio, script, music or art copied from commercial preschool franchises.
2. **Product name**: *Veer's Wonder World* (working name); local content may personalize greetings to “Veer”. Do not put child-identifying info in public route names, telemetry, URLs, QA screenshots, or committed audio without separate family approval. This PRD can be public; the **shipped content and data must not expose personal details by default**.
3. **Launch slice**: three main characters (Momo, Lulu, Sheru), six short episodes, three interactive activities, one parent hub, 12–20 original short audio prompts, and 3–5 short song motifs. Remaining three characters and fourteen episodes are follow-on content.
4. **Modes**: Watch & Sing (full 2–4 minute episode, no interaction needed), Play Together (touch plus guided caregiver interaction), optional Voice Play later. All content is completable **without spoken output**.
5. **Communication targets before drill**: request (“more”, “again”), action (“go”, “stop”, “open”), social (“hi”, “bye”), object (“ball”), playful sounds. Alphabet/number exposure runs alongside these, not instead of them. Do not score speech correctness or claim the app teaches a child to talk.
6. **Parent-mediated**: short sessions with natural end screens and a suggested off-screen equivalent (“Now roll your real ball together”). No endless autoplay, streaks, lockouts, leaderboards, ads, in-app purchases, manipulative retention mechanics, public profiles, or social/community features.
7. **Privacy**: no microphone requirement for v0; if enabled in a later experiment, parent opt-in, active-turn indicator, local processing preference and no audio retention by default; no cloud speech service without explicit informed consent and privacy review. Never use voice inference as clinical diagnosis.
8. **Accessibility**: child-safe large touch targets, minimal UI, audio captions in parent mode, mute/replay, reduced motion, high contrast, screen-reader-friendly parent UI, no surprise loud sounds and low-stimulation option.
9. **Routes and claims**: build in a *new* `apps/veer-wonder-world/` application rather than rewriting game-kit or existing showcasers. Shared engine changes require a proven reproducible gap, tests and a separate review. All new routes are labeled prototype until evidence gates pass.

## Definition of the product

### Child experience
- Familiar animated companions converse in short, clear, expressive sentences and model useful language. Their emotions/mouth motion support understanding rather than constant spectacle.
- Every episode has one concrete problem, one or two repeatable actions, one short original song or rhythmic phrase, a turn-taking pause and a happy finite ending.
- Large objects can be tapped; optional drag snaps into place; no twitch timing, precision motor tasks, three-option quizzes or “say it correctly to continue.”
- A child who points, laughs, vocalizes or only taps can participate equally; adult can interpret gestures outside the app.
- Letters are clearly distinguished from sounds (e.g. letter B named “bee”, /b/ in “ball”); numbers correspond to counted objects, beginning with quantities 1–3.

### Caregiver experience
- Parent gate, locale/voice, mode, sound/motion, content selection, optional short session target, and a word shortlist under parent control.
- Parent prompts are small and actionable: “Model ‘ball’,” “Pause,” “Expand any attempt,” “Now find the real ball.” No therapist-like prescription or automated language assessment.
- Manual observation notes optional and local-only by default; do not infer acquisition from taps, microphone output, or view time.

## Phased scope and dependencies

| Phase | Product slice | Exit condition |
| --- | --- | --- |
| P0 Foundation | Resolve shipped SDK version, asset strategy, character/scene proofs, stable mobile baseline | Engine consumer app builds and draws a verified first frame on target devices; no fabricated APIs/assets |
| P1 Pilot | Momo, Lulu, Sheru + 6 episodes + Bubble, Train, Ball activities + parent panel | All flows pass child-safety, parent review, touch, audio, mobile and offline-activity exit gates |
| P2 Content expansion | Pip, Lumi, GoGo; remainder of 20 episodes; 12 games total; optional bilingual packs | Content schema validated; every episode has scripted language + caregiver bridge and explicit QA receipts |
| P3 Optional voice | Parent-gated voice reactions (sound presence first, carefully scoped speech recognition later) | Compatibility/privacy audit, false-negative tests, clear controls and touch fallback; **do not ship otherwise** |

No schedule promises. Implement and sign off by evidence gates, not by calendar dates.

## What exists in Aura3D (verified in the repo; not proof of our new app)

- Repository: https://github.com/auraoneai/aura3d ; README describes TypeScript scene nodes, typed GLB assets, mini-game scaffold, and `@aura3d/engine/game`.
- `docs/api/game-kit.md`: **real** `createGame` is imported from `@aura3d/engine/game`. The root `@aura3d/engine` `createGame` is a **headless stub**.
- `docs/api/qa-kit.md`: `createFixedStepLoop`, `installQaHooks`, `readQaParams`, deterministic seeded input/replay.
- `docs/api/audio-synth.md`: `createCueBank`, sample slices, music buses, single AudioContext; these are SFX/music primitives, **not** a ready-made toddler narrator or child ASR.
- `docs/api/model-loader.md` and `docs/agents/asset-workflow.md`: typed, licensed, same-origin GLBs with hashes/provenance. Require real approved hero models, not primitive stand-ins for release.
- `docs/agents/claims-and-boundaries.md`: no public claim without tested capture and runtime evidence.
- Repo on 2026-10-24 states 4.1.2 shipped with 4.1.3 unreleased; 4.1.2 has a documented stock Vite-build defect. P0 must pin a fixed **verified** package/commit; do not assume unreleased changes are published.
- `README.md`: software-WebGL2 evidence is **not** real-GPU confirmation. Remote capture commands are preferred inside monorepo.

## The first demonstrable pilot

**“Momo’s Ball Day”**: Momo looks for a ball; Sheru brings it; Lulu leads “go/stop” in a song; Veer can watch without interacting or tap a giant ball to advance; Momo pauses inviting “more” but doesn’t demand speech. Caregiver sees “Try rolling a real ball now.” This is the golden end-to-end vertical slice for art, animation, recorded narration, captions, input, deterministic QA and safety.

## P0 go/no-go checklist
- [ ] PRD reviewed by PM, Aura3D engineer, creative director, and pediatric speech-language advisor.
- [ ] Verify installed SDK and stock consumer build; capture resolved engine version/commit.
- [ ] Verify `@aura3d/engine/game` import in sample and avoid headless root stub.
- [ ] Select valid original character/art/voice rights strategy; create asset manifests.
- [ ] Agree target devices (iPad Safari, iPhone Safari, Android Chrome, desktop) and performance baselines.
- [ ] Approve family privacy model, no-microphone v0, parent gate, local-only notes.
- [ ] Freeze P1 six episodes / three games in `05-episodes-games-and-curriculum.md`.
- [ ] Agree evidence artifacts per `06-qa-release-and-execution.md`.

## Engineering start prompt

> Implement P0 then P1 for *Veer's Wonder World* using these six PRD files as the canonical spec. Work only on a feature branch. Read repo `llms.txt`, `docs/agents/claims-and-boundaries.md`, `docs/agents/build-a-game.md` and source public exports first. Respect each proposed filename in `04`, report deviations, and create reproducible browser/device evidence. Never claim production-ready without passing `06`. Do not add ASR, analytics on child speech, auto-play loops, or medical claims to P1.

## Evidence and external guidance (not product effectiveness claims)
- Aura3D: `docs/api/game-kit.md`, `docs/agents/build-a-game.md`, `docs/api/qa-kit.md`, `docs/agents/claims-and-boundaries.md`.
- ASHA early intervention/family-centered responsive strategies: https://www.asha.org/practice-portal/professional-issues/early-intervention/
- ASHA focused stimulation and expansions: https://www.asha.org/practice-portal/clinical-topics/spoken-language-disorders/
- AAP on co-viewing and age 2–5 media: https://publications.aap.org/pediatrics/article/138/5/e20162591/60333/Media-and-Young-Minds
- MDN speech recognition compatibility / potential server processing: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
