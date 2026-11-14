# PROMPT 08: Wonder World Autonomous Episode Engine and Kids YouTube Channel

Status: **PROMPT (research + design + first-episode script; no code changes yet)** · Written 2026-11-13 from a read of `apps/veer-wonder-world` at commit `cdd6a6c30` · Owner: Gurbaksh · Related: [`02` character bible](02-character-and-content-bible.md), [`03` architecture](03-aura3d-architecture-and-contracts.md), [`05` episodes and curriculum](05-episodes-games-and-curriculum.md), [`07` build record](07-autonomous-decisions-and-build-record.md), Aura3D skill `aura3d-animation-studio`.

---

## 0. The ask, in the owner's words (condensed)

After we added Auto play, Wonder World plays through like a real episode: things happen, characters talk, songs play. With the click/touch prompts taken out, it could almost be an episode on its own.

The next step is a **fully autonomous episode engine**:

- every existing character stays intact (look, voice, personality), and new characters can be introduced over time;
- music and speech stay in sync with what happens on screen;
- it teaches children **aged 1 and up** many things;
- it keeps the interactive feel and the playful banter that keeps kids (including the owner's son) coming back to the characters;
- its output is a **Wonder World YouTube channel for kids**, launched and then fed by the engine.

The end state: Aura3D + these characters + a repeatable episode recipe = an engine that **writes, renders, checks and publishes** episodes.

---

## 1. Your role and what to produce

Act as a senior team made of: a preschool TV showrunner and head writer, an early-childhood education and speech-language advisor, an Aura3D runtime engineer, a pipeline/MLOps engineer, and a YouTube kids-channel growth lead. Work from this repository, not from general assumptions. Every claim about the current app must cite a file (`path:line`). Every claim about YouTube, COPPA, FTC rules or provider licences must cite a dated source, because these rules changed in 2025–2026.

Write the result to **`docs/prds/veer-wonder-world/09-autonomous-episode-engine-and-channel-plan.md`**. It has these six parts, in this order:

| # | Deliverable | Section of this prompt |
| --- | --- | --- |
| A | Research report: what an autonomous kids-episode engine requires | §3 |
| B | Engine architecture and phased build plan, mapped to real files | §4 |
| C | Content and curriculum system for ages 1+ (age bands, banter rules, recurring segments) | §5 |
| D | Launch and growth strategy, done differently from the standard AI-kids-channel playbook | §6 |
| E | **A complete 10-minute launch episode**: beat-level script, shot list, songs and timings | §7 |
| F | Risks, open owner decisions, and a go/no-go checklist for publishing | §8 |

Do not change app code while writing this plan. Code work starts after the owner approves Part B.

---

## 2. What exists today (verified 2026-11-13; re-verify before you rely on it)

### 2.1 Cast (closed set, `src/types.ts:9`)

| ID | Who | Personality / banter role | Voice (ElevenLabs premade via Prism, `tools/gen-audio.ts`) | Catchphrases (`02` §2) |
| --- | --- | --- | --- | --- |
| `momo` | Small fuzzy purple monster, the host | Curious, silly, warm; points and waits | "Will" | "Uh-oh!", "Look!", "More?" |
| `lulu` | Soft mint mini dinosaur | Rhythm leader, comically off-beat | "Laura" | "Boom boom!", "La la la!" |
| `sheru` | Floppy-eared cartoon dog | Playful, fetches; **never speaks words**, 9-bark bank (`src/content/sfx.ts`) | none (SFX) | woof, yip, aroo |
| `gogo` | Chunky red toy train | Excited helper, always stops politely | "Liam" | "Ready... go!", "Stop!" |
| `lumi` | Warm yellow star, learning guide | Soft, curious, conjures objects; glow never flashes | "Matilda" | "Look what I found!" |
| `peeko` | Round chick with a tuft | Peekaboo, pretend hiding | "Jessica" | "Peekaboo!", "Here I am!" |
| `narrator` | Off-screen storyteller | Frames the story | "Bella" | — |
| `robot` | One-off guest (E-Silly Robot Factory) | — | "Callum" | — |

Line counts per speaker, from the episode files: Momo carries most stories (up to 26 lines in `momo-bubble-universe.ts`). Lulu leads music, Lumi leads letters/numbers/shapes, and Peeko leads hiding and location words. **Banter today is mostly a host speaking to the viewer, with little character-to-character exchange.** That gap matters for the "addictive banter" goal (see §5.3).

Characters are **100% procedural** (`src/scenes/procedural-rigs/cast-rigs.ts`, `src/scenes/articulated-actors.ts`). They have expressive mouths driven by a noise-gated ~3.8 Hz articulation curve. An optional AuraVoice viseme bridge exists (`articulated-actors.ts:2252+`) but is not wired to the recorded lines. Note: `README.md` and `02` §1 are out of date. They still describe Meshy GLBs and "no mouth morphs, never lip sync". Fix those docs in the build phase.

### 2.2 Worlds (`src/types.ts:15`)

Six daytime worlds: `meadow`, `music-garden`, `peekaboo-barn`, `station`, `learning-cloud`, `home-nook`. Two bedtime worlds: `moonlit-nursery`, `starlight-cloud`. Each world is a fixed diorama with named spots (`SpotId`) and six fixed camera presets (`wide | medium | close | left | right | high`). No free orbit.

### 2.3 Content model (the recipe the engine will generate)

- `EpisodeSpec` (`src/types.ts:225`) holds a world, host, cast with spots, props, `targetWords`, `supportWords`, music bed, offline-play card, caregiver bridge, review record, and `beats[]`.
- A beat has a `kind` (`greeting | hook | model | invite | event | repeat | song | outro`), an optional camera, `stage: StageAction[]`, `lines: LineRef[]`, `words`, `holdMs`, and optional `input` + `waitMs` + `response`.
- `StageAction` is a closed vocabulary: `enter, exit, move, gesture, face, show, hide, object, carry, sfx, song (with per-lyric SongCue), music, camera`. It uses 37 gestures, 25 object actions, 8 move styles and about 60 prop asset ids (`src/types.ts`).
- Text lives in locale packs (`src/localization/en/episodes/*.ts`) keyed like `e03.greet.1`. Voice lines are pre-rendered MP3s (1,012 files under `src/assets/audio/en/`), plus 26 songs, 8 beds and 42 SFX, each with a provenance record in `provenance/audio/*.json`.
- Validators exist: `tools/validate-wonder-world-content.mjs` (J14), `src/content/schema.ts` and `tests/unit/content/content-schema.test.ts`.
- Catalogue: **26 episodes (122–175 s each) and 16 activities.** Auto play (`src/app.ts:654`, mode `"auto"`) runs them back to back in menu order and cuts each invite wait to `WAIT_MS_MIN` (`src/app.ts` `waitOverride`).

### 2.4 Rendering building blocks already in the monorepo

- Deterministic story clock: fixed 50 ms steps (`createFixedStepLoop`); no wall clock and no randomness in app code; `?manual=1` lets QA hooks advance time (`src/qa/install-hooks.ts`, `window.__AURA_WONDER_WORLD__`). **This is the foundation for frame-exact offline rendering.**
- `packages/engine/src/agent-api/MediaRecorderFrameEncoder.ts` and `FrameEncoder.ts` handle frame encoding.
- Animation Studio (`packages/engine/src/animation-studio/`: `EpisodeDocument`, validator, director heuristics, scene tools) renders through headless Chromium + ffmpeg from the monorepo root, then hands off to AuraVoice.
- Remote execution only: `tools/remote-run.sh`, `tools/remote-acr/run.sh`. **Never run Playwright, browsers or heavy renders on the Mac** (owner policy).

### 2.5 Current rules that conflict with a YouTube channel (resolve each one explicitly)

| Current rule (source) | Conflict | What Part F must decide |
| --- | --- | --- |
| "Nothing ever plays the next story by itself" (`README.md`, `src/content/catalog.ts:8`) | Auto play already breaks it in the app; a channel is linear video by design | Keep the app rule for co-play mode, and write a separate rule set for broadcast output |
| Unlisted, `noindex`, "publishing is a separate owner decision" (`DEPLOYMENT.md`) | A channel is public | Record the owner's decision with its date |
| `WELCOME_NAME` personal welcome (`src/personal.ts`) | A child's name must never appear in public output | Strip it in broadcast mode, and add a test that fails if it is present |
| Agent review instead of human sign-off (`02`, `07` §2) | Public kids content needs a real human reviewer, and ideally an early-childhood/SLP advisor | Name the reviewer role and set a review SLA |
| Some audio was generated on Prism free-tier keys, "prototype-only" (`02` §5) | Commercial use needs paid-tier rights | Re-render or audit every asset by `tier` in provenance |
| Names "Momo", "Lulu", "GoGo", "Wonder World" have had no real trademark search (`02` §2) | "Momo" is linked to the 2019 "Momo challenge" hoax that parents search for and fear; "Wonder World" is a crowded name | Run a real trademark and search-collision check; choose final names **before** launch |
| Play-and-language prototype with no efficacy claims (`README.md`) | Channel copy tempts claims like "teaches your toddler to talk" | Lock claim wording (see `docs/agents/claims-and-boundaries.md`) |

---

## 3. Part A: research what an autonomous kids-episode engine requires

Answer each item with sources and a recommendation for this codebase.

1. **Platform and law.** Cover YouTube "made for kids" designation and what it disables (comments, personalised ads, notifications, mini-player, and anything else current). Cover COPPA and the FTC's 2025 amended COPPA Rule, with its compliance dates. Cover the YouTube Kids app eligibility and quality principles. Cover YouTube Partner Program rules on **"inauthentic" / mass-produced or repetitive content** (renamed in July 2025) and how they apply to AI-assisted animation. Cover the altered/synthetic content disclosure and whether animated content needs it. Cover EU/UK equivalents (AADC, DSA minors' protections) if we target them.
2. **Child development guidance.** For under-2s, cover AAP/WHO screen-time guidance and what it means for a channel that targets "1+". Answer honestly: should the channel position itself as **co-viewing** content for 1–3 and solo-viewing content for 3–5? Cover pacing research (slow pacing, few cuts, direct address, pauses for response), and say what "addictive" may and may not mean for this audience (see §5.4).
3. **Generation stack.** For each layer, compare at least 2 options on quality, cost per 10-minute episode, licence terms for commercial kids content, and determinism:
   - script and beat generation (LLM through Kiro Prism; structured output validated against `EpisodeSpec`);
   - voices (ElevenLabs premade voices vs. custom or professional voice clones per character; consistency over hundreds of episodes; commercial rights);
   - music and songs (ElevenLabs music vs. alternatives; ownership; Content ID risk; catchy and original);
   - SFX (existing 42-sound bank, plus generation for new ones);
   - lip sync (wire the existing AuraVoice viseme bridge to timed phonemes from TTS alignment data vs. keep the amplitude curve);
   - rendering (deterministic offline frame capture from the 50 ms clock on a remote GPU vs. real-time MediaRecorder); target 1080p and 4K at 30/60 fps, with cost per minute on the cheapest remote tier;
   - captions/subtitles (generated from the locale pack; burned-in vs. uploaded SRT), dubbing and localisation (a Punjabi pack already exists: `src/localization/pa.ts`);
   - thumbnails (rendered from the Aura3D scene, not image-generated, so characters stay on-model);
   - publishing (YouTube Data API v3 upload quotas, scheduling, playlists, "made for kids" flag set through the API).
4. **Character continuity.** Explain how to keep each character's look, voice, personality and catchphrases stable across hundreds of generated episodes: a machine-readable "character sheet" used as both a generation constraint and a validator. Explain how a **new character** gets onboarded (rig, voice, personality sheet, intro episode, portrait, tests).
5. **Quality control without a human in every loop.** Define automated gates that block publishing: schema validity, vocabulary and age band, banned words/themes, line length, speech rate, loudness (the existing LUFS targets in `tools/gen-audio.ts`), flash/luminance safety (WCAG 2.3.1 / Harding-style check on rendered frames), on-model checks, caption sync, duration, and a final **human approval step** before anything goes public.
6. **Benchmarks.** Study 4–6 successful preschool channels and shows for **format and pacing only**: runtime, segment structure, song frequency, upload cadence, compilation strategy, thumbnail style. Do not copy their characters, songs, names or look. Record what Wonder World can do that they cannot (true 3D, deterministic re-renders, interactive app twin, multi-language from one source).

---

## 4. Part B: engine architecture and phased build plan

Design a pipeline that turns a **topic or brief** into a **published video**. Use the existing app as the runtime; do not build a second renderer.

```
Brief / curriculum slot
  → Writers' room (LLM, Prism)        → EpisodeSpec + locale lines (draft)
  → Validators (schema, J14, age band, banter rules, safety)
  → Voice + song + SFX render (Prism → ElevenLabs), with word timings
  → Broadcast cut (invites → "pause beats", timings locked to audio)
  → Deterministic frame render (remote GPU, ?manual=1 clock, broadcast mode)
  → Mux (ffmpeg: video + mixed audio + chapters + captions)
  → Automated QC gates → Human approval → YouTube upload (scheduled, MFK)
  → Analytics feedback → next briefs
```

Requirements for Part B:

1. **Broadcast mode** in the app: `?broadcast=1` (or a separate entry point). It hides all UI chrome, strips `WELCOME_NAME`, turns invites into timed "pause and answer" beats (a character looks at the camera, holds 2–3 s, then answers its own question), uses 16:9 framing, and runs the clock only through the render driver.
2. **Episode composition.** A long-form `ShowSpec` (new type) that chains several `EpisodeSpec` segments, with host links, a cold open, recurring segments, a song, and an outro. Segments need transitions between worlds (GoGo's train is the natural device).
3. **Data-driven cast.** Today `CharacterId`, `SpeakerId` and `VOICES` are closed unions or maps. Propose the minimal change that lets a new character be added from one character-sheet file plus a rig module, without breaking the existing typed validators.
4. **Generator contract.** The LLM writes only the `EpisodeSpec`/locale JSON shape and is checked against the closed `StageAction` vocabulary. Invalid output is repaired at most twice, then dropped. No free-form code generation.
5. **Audio timing.** Voice lines are rendered first. Their measured durations drive beat `holdMs`, song cue times and mouth/viseme tracks, so speech and motion never drift.
6. **Render farm.** Specify the remote target (cheapest tier that meets the job, per `cloud-cost-and-ephemeral-lifecycle.md`). Include expected minutes and dollars per 10-minute episode, and teardown with zero leftover resources.
7. **Provenance.** Every published video gets a manifest: episode spec hash, audio provenance, model/prompt versions, reviewer, and publish date.
8. **Phases** (each phase has an exit test):
   - P0: Broadcast mode + render one existing episode (e.g. E19 *Momo's Day*) to MP4 remotely. Exit: 1080p30 file, no dropped frames, audio in sync to within 1 frame.
   - P1: Hand-written 10-minute launch episode (§7) rendered and approved.
   - P2: Generator writes segments; a human edits and approves. Target: 1 long episode + 3 Shorts per week.
   - P3: Autonomous generation and QC; the human only approves or rejects. New characters can be introduced.
   - P4: Localisation (Punjabi, Spanish, Hindi…) from the same specs.

Map each phase to the files it touches (`src/app.ts`, `src/types.ts`, `src/runtime/episode-director.ts`, `src/runtime/narration-player.ts`, `src/scenes/stage.ts`, `src/scenes/articulated-actors.ts`, `tools/gen-audio.ts`, new `tools/render-episode.*`, new `tools/publish-youtube.*`), with tests for each.

---

## 5. Part C: content, curriculum and banter system

### 5.1 Age bands (ages 1+)

Define at least three bands, each with vocabulary size, sentence length, pacing (cuts per minute, hold times), topics and song density: **1–2 (co-viewing, first words)**, **2–3 (two-word phrases, routines, colours, counting to 3–5)**, **3–5 (letters and sounds, counting to 10–20, shapes, feelings, simple science, kindness, problem solving)**. Build on the existing curriculum in `05-episodes-games-and-curriculum.md`, and expand it into a 52-week topic calendar.

### 5.2 Recurring segments (the show's format)

Propose 6–8 named recurring segments, each owned by one character, so children learn to expect them. Examples to evaluate and improve: *Lumi's Look-What-I-Found* (letters/shapes with real objects), *Lulu's Boom-Boom Beat* (movement song), *Peeko's Peekaboo* (where/hiding/location words), *GoGo's Ready-Go* (counting, travel between worlds), *Sheru Finds It* (find-the-object, no words), *Momo's Uh-Oh* (a small problem the friends solve together), and a calm *Goodnight* closer from the bedtime worlds.

### 5.3 Banter rules (what makes it lovable)

Today most lines go from the host to the viewer. Write a banter bible that keeps the characters kind, includes the viewer, and makes it funny for a 1–5-year-old:

- running gags per character: Lulu is always one beat off; Sheru brings the wrong object first; Peeko "hides" in plain sight; GoGo stops very politely at the wrong moment; Momo's "Uh-oh!"; Lumi gently corrects with a real object;
- call-and-response patterns and deliberate "silly mistakes" that the child gets to correct ("Is that a… banana? Nooo, it's a ball!");
- each joke lands in **one short sentence**, one speaker at a time, with a pause after it (the existing rules in `02` §1 and §5 stay);
- no sarcasm, no put-downs, no scary surprises, and nothing that teaches bad behaviour.

### 5.4 "Addictive", defined safely

The goal is that children **love and recognise the characters and ask for them again**. The goal is not to maximise compulsive watch time. Define this in writing. Use familiarity, repetition, songs, warm characters and satisfying endings. Do not use cliffhangers that pressure children, endless autoplay bait, overstimulating cuts, loud reward sounds, or manipulative thumbnails. Every long episode ends calmly with an offline play idea, as the app's offline card already does. Say how this choice still serves growth (parents subscribe to channels they trust).

### 5.5 Interactivity in a linear video

Explain how the app's `invite` beats translate to video: direct address, a 2–3 s pause where the character looks at the child, a visual hint, then the character answers ("You found it! The ball!"). Add a parent cue in captions. Propose how the video links back to the interactive app (end screen, description), within made-for-kids link limits.

---

## 6. Part D: launch and growth strategy (do it differently)

The default AI-kids-channel playbook is high volume, nursery-rhyme covers, keyword-stuffed titles and loud thumbnails. Treat it as a risk: YouTube demonetises inauthentic, repetitive content, and parents are growing wary of AI content. Instead, propose a strategy built on what is unique here and evaluate it:

1. **Parent-trust positioning.** "Made by a dad for his son" as a true founder story told on the parent-facing side only (never the child's name or face). Publish the safety rules openly: no flashing, calm pacing, caregiver tips in every description.
2. **Interactive twin.** Every episode has a playable version in the Wonder World app/PWA. "Watch it, then play it together."
3. **Format mix.** Combine 10–12-minute episodes, 20–60-minute compilations (the largest share of preschool watch time), 15–60 s Shorts (one song or one gag), a bedtime long-play built from the wind-down worlds, and sing-along lyric versions.
4. **Original songs as the engine of growth.** Make 3–5 hook songs per character that can stand on their own. Distribute music separately (streaming services, YouTube Music) if the licences allow.
5. **Search and discovery without spam.** Use topic-led titles parents actually search ("Learn colours with…", "Bedtime song for toddlers") and consistent thumbnails rendered from the 3D scene. Put chapters in every long episode. Plan playlists by topic and age band.
6. **Language versions** from the same specs (the Punjabi pack exists), opening multiple markets at little extra cost.
7. **Off-YouTube channels.** Cover parent communities, early-years educators and speech therapists (with careful claims), Instagram/TikTok parent clips, a printable activity sheet per episode, and a simple website page per episode.
8. **Launch sequence.** Have a backlog of 8–10 long episodes + 20 Shorts ready before day 1. Set a cadence (e.g. 2 long + 5 Shorts per week). Plan a trailer, a launch-week schedule, and targets for weeks 1/4/12 (views, subscribers, average view duration, returning viewers).
9. **Monetisation path.** Cover YPP thresholds, made-for-kids ad limits (contextual ads only), and alternatives (app subscription, merchandise, licensing, music). Be honest about expected revenue for made-for-kids content.

---

## 7. Part E: the 10-minute launch episode

Write the full episode. Working title: **"Welcome to Wonder World!"** (Episode 1). Its job is to introduce the island and every character, show the playful banter, and preview what children will learn on the channel. It must also be a complete, satisfying story on its own, not a trailer.

### 7.1 Hard requirements

- Runtime 10:00 ±0:30; 16:9 1080p (4K master if the render cost allows).
- Uses only the existing cast, worlds, props, gestures, object actions, SFX ids and songs from §2. Anything new (a new song, prop or gesture) is listed in a "new assets needed" table with how it will be made.
- One speaker at a time; lines of at most 9 words (current rule); calm pacing; no flashing; fixed camera presets only; Sheru never speaks.
- A simple through-line, for example: *Momo is getting the island ready for a "welcome party" for a new friend (the viewer). GoGo carries Momo to collect each friend from their world. Each friend shows off their thing, and each stop has one small funny problem.* Evaluate this premise against at least two alternatives and choose one.
- At least 6 "pause and answer" moments; 1 opening theme song (new and original); 2–3 short songs reused from the catalogue; 1 closing calm song.
- A preview moment where Lumi shows "things we'll learn together" (colours, counting, letters, animals, music, bedtime). Make it a playful object parade, not a list.
- It ends calmly with a goodbye from each character, an offline play idea for the parent, and no "watch the next one!" pressure.

### 7.2 Output format

1. **Segment table:** timecode in/out, world, characters, learning focus, song, and the banter beat.
2. **Beat-level script** written so it maps 1:1 onto `EpisodeSpec` beats: for each beat give `id`, `kind`, `camera`, `stage` actions (in the real vocabulary), lines (`speaker: "text"`), `holdMs`, and pause beats marked as `PAUSE (n s)`.
3. **Song lyrics** for any new song, with motions per lyric line (the `SongCue` model).
4. **Shot list and a storyboard description** for each segment (one line per shot).
5. **Caregiver notes and the offline-play card text.**
6. **YouTube metadata:** title (under 60 characters), description with chapters and a caregiver tip, tags, playlist, thumbnail concept (rendered from the scene), and the made-for-kids flag.
7. **Three Shorts** cut from the episode, with in/out times and why each works on its own.
8. **The `ShowSpec` JSON** (draft) for the episode, so it can later be rendered by the engine.

Suggested skeleton (improve it; do not treat it as fixed):

| Time | Segment | World | Lead |
| --- | --- | --- | --- |
| 0:00–0:45 | Cold open + new Wonder World theme song | Meadow (wide over the island) | Momo, everyone |
| 0:45–2:00 | Momo meets the viewer; Sheru brings the wrong thing (banter) | Meadow | Momo, Sheru |
| 2:00–3:30 | All aboard GoGo; counting carriages; "Ready… go!" | Station | GoGo, Momo |
| 3:30–5:00 | Lulu's off-beat dance; boom-boom song | Music Garden | Lulu |
| 5:00–6:15 | Peeko hides "very well" (in plain sight) | Peekaboo Barn | Peeko |
| 6:15–7:45 | Lumi's preview parade: what we'll learn | Learning Cloud | Lumi |
| 7:45–9:15 | Welcome party at Home Nook; everyone together; one shared song | Home Nook | All |
| 9:15–10:00 | Calm goodbye, offline play idea | Home Nook → Starlight Cloud | Momo, Lumi |

---

## 8. Part F: risks, owner decisions and the publishing checklist

List each risk with likelihood, impact and mitigation. At minimum, cover: the conflicts in §2.5; YouTube inauthentic-content demonetisation; COPPA/FTC exposure; voice and music licence gaps; Content ID false claims on generated music; character drift across generated episodes; brand/name collisions ("Momo"); parental backlash against AI content; render cost overruns; and the founder's child's privacy.

End with:

- **Owner decisions needed** (one line each, with a recommended default).
- **Go/no-go checklist** for the first public upload: final names cleared, paid-tier audio only, no personal data, human reviewer sign-off, made-for-kids flag set, flash-safety pass, captions, provenance manifest stored.

---

## 9. Working rules for whoever runs this prompt

- Read first: `apps/veer-wonder-world/README.md` (partly out of date, see §2.1), `docs/prds/veer-wonder-world/01`–`07`, `src/types.ts`, `src/app.ts`, `src/runtime/episode-director.ts`, `tools/gen-audio.ts`, two episode files (`src/content/episodes/momos-day.ts`, `alphabet-zoo.ts`) with their locale packs, and the `aura3d-animation-studio` skill.
- Use Aura3D only for 3D. Use Kiro Prism for LLM and voice calls. Run all rendering and browser work remotely. Store secrets in OpenBao and never put them in files.
- Keep the characters original. Use other shows only for format and pacing research, never for characters, songs, names or look.
- No children's names, faces or voices in any public output.
- Mark every number either **measured** (with source) or **estimated**.
