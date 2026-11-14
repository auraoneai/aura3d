# 09: Wonder World Autonomous Episode Engine and Kids Channel Plan

Status: **PLAN (owner review)** · Written 2026-11-13 by executing [`08` prompt](08-autonomous-episode-engine-and-kids-channel-PROMPT.md) against `apps/veer-wonder-world` at commit `cdd6a6c30` · Owner: Gurbaksh

Labels used below: **[measured]** means read from the repo or a cited source. **[estimate]** means a planning number to replace with a measurement. Sources for external rules are in §A.9; each rule carries its date, because several changed in 2025.

Contents: [A. Research](#a-research-what-an-autonomous-kids-episode-engine-requires) · [B. Engine architecture](#b-engine-architecture-and-phased-build-plan) · [C. Content and banter](#c-content-curriculum-and-banter-system) · [D. Launch and growth](#d-launch-and-growth-strategy) · [E. Launch episode](#e-launch-episode-welcome-to-wonder-world) · [F. Risks and decisions](#f-risks-owner-decisions-and-publishing-checklist)

---

## A. Research: what an autonomous kids-episode engine requires

### A.1 What the engine needs, in one table

| Layer | What it must do | Wonder World today | Gap |
| --- | --- | --- | --- |
| Story format | Typed, validated episode data with a closed action vocabulary | `EpisodeSpec` + `StageAction` + J14 validator (`src/types.ts`, `tools/validate-wonder-world-content.mjs`) | multi-segment `ShowSpec`; world swap mid-video (B3.3) |
| Writing | Generate varied, age-appropriate, on-character scripts | Hand-written + agent-reviewed (26 episodes, 16 activities) | LLM writers' room with character sheets and banter rules (B.4, C.4) |
| Characters | Same look, voice and personality in every video; new characters can be added | 6 procedural rigs; 7 fixed ElevenLabs voice ids (`tools/gen-audio.ts`) | data-driven cast (B3.7); timed visemes (B3.6) |
| Voice, music, SFX | Commercial rights, consistent loudness, timing data | 1,088 files, all `starter` tier, loudness-normalised [measured] | music needs a higher plan for streaming (A.5); word timings |
| Timing | Speech, motion and music locked together | Deterministic 50 ms clock, no wall clock, `?manual=1` | sub-step presentation for 30/60 fps; event log (B3.4–B3.5) |
| Rendering | Frame-exact MP4 on a remote GPU | Live in-browser only; remote runner exists (`tools/remote-run.sh`) | broadcast mode + frame/audio renderer + mux (B3.1, B.4) |
| QC | Block unsafe, off-model, flashing or badly mixed videos | Unit + remote browser specs for the app | B.6 gates on the final video |
| Publish | Upload, made-for-kids flag, captions, schedule | none | `publish-youtube.mjs` (A.4) |
| Human review | A person approves every public video | Agent review only (`07` §2) | named reviewer and signed manifest (F.3) |

### A.2 Platform rules (YouTube)

- **Made for kids (MFK).** Wonder World is clearly child-directed: animated characters, songs, ages 1–5. The FTC lists animated characters and music as child-directed factors (FTC blog, 2019-11-22). So every video is MFK = true. MFK turns off autoplay on home, **cards and end screens**, watermarks, comments, the notification bell, personalised ads, miniplayer playback, memberships, merch, Super Chat, and save to playlist / Watch Later. A whole MFK channel also loses Community posts (YouTube Help 9527654, accessed 2026-11-13). Design consequence: no end screens, so the app link lives in the description and on the channel page. MFK videos are more likely to be recommended next to other kids' videos (Help 9528076).
- **Kids quality principles.** These affect YPP status, ads and YouTube Kids inclusion (Help 10774223, accessed 2026-11-13).
  - High-quality signals: kindness and healthy habits, learning and curiosity, creativity and play, a "complete story and a clear lesson", and diverse people and places.
  - Low-quality signals: "hard to follow" (no beginning, middle or end, "often the result of mass production or autogeneration"), deceptively educational content, keyword stuffing, and encouraging negative behaviour.
  - A channel focused on low-quality MFK content can be suspended from YPP.
  - Wonder World's format (one story, one problem, one lesson, a calm ending) is built to hit the high-quality list.
- **YPP "inauthentic content".**
  - The policy was renamed from "repetitious" on 2025-07-15 and clarified on 2026-07-16 (TechCrunch, 2026-07-20).
  - Not allowed: "characters … put in the same situation over and over again with the same outcome", "templated storylines … with minimal or no narrative", and "AI-generated content made with generic or unoriginal templates giving the impression of mass production".
  - Allowed: "using AI to visualize a unique character and narrative you invented", and the same intro and outro when the rest of each video differs (Help 1311392, accessed 2026-11-13).
  - Design consequences:
    - Recurring segments (C.3) are fine as structure, but each episode's situation and outcome must differ.
    - The validator must reject near-duplicate stories. Add a similarity check against past episodes to B.6.
    - Upload volume stays human-paced.
- **Enforcement climate (2025–2026).**
  - Bloomberg reported "AI slop" kids videos that pretend to be educational (2025-12-03).
  - The 74 found a channel posting about 50 videos a day with safety errors such as whole grapes and honey for babies. YouTube then terminated 7 channels (2026-03-18).
  - YouTube's CEO named managing AI slop a 2026 priority (CNBC, 2026-01-21).
  - A Fairplay letter signed by 135+ groups asked YouTube to ban AI content from YouTube Kids (Fortune, 2026-04-01). YouTube did not ban it, but said it is "limiting AI-generated content in the app to a small set of high-quality channels" and building AI labels.
  - **Do not plan on YouTube Kids app inclusion at launch.** Earn it with quality.
- **Synthetic content disclosure.**
  - "Clearly fantastical or animated content" is exempt (Help 14328491, accessed 2026-11-13).
  - The same page lists "AI generated music" that is the main focus of the video as disclosable.
  - On animated content the label appears only in the expanded description and does not change recommendations or monetisation (YouTube blog, 2026-05-27).
  - Recommendation: set `containsSyntheticMedia: true` on song-led videos and Shorts. It is optional on story episodes; set it anyway for trust (D.1). ElevenLabs Music Terms §4.4 also require following platform disclosure rules.
- **Monetisation reality.**
  - MFK serves contextual ads only.
  - One agency dataset puts kids-niche median RPM at **$0.33** (range $0.16–$0.88), with only 32% of views monetised (AIR Media-Tech, 300 channels, May 2025–May 2026, [estimate]). That is about $330 per million views.
  - Ads will not fund the work at small scale. Plan revenue from the app, music and licensing (D.6).

### A.3 Law (COPPA)

- The FTC finalised COPPA amendments on 2025-01-16. They were published on 2025-04-22, took **effect 2025-06-23**, and **compliance was required by 2026-04-22**, so they are fully in force (Federal Register 90 FR 16918).
- New requirements: separate parental consent before sharing children's data with third parties (including for ads), a written data-retention policy with no indefinite retention, biometrics counted as personal information, and a "mixed audience" definition.
- A channel owner is an "operator" when it, or someone acting for it, collects personal information from a child-directed video (FTC blog, 2019-11-22).
- Exposure for Wonder World:
  - On YouTube, MFK handles it.
  - The real exposure is **off-platform**: the app, any email list, contests and pixels.
  - The app already collects nothing (no account, no analytics, settings on device only; `README.md`, `tests/unit/privacy/no-child-data.test.ts`). Keep it that way.
  - Any parent email list must be adult-directed and age-screened.
- EU/UK (AADC, DSA minors' protections): not researched in this pass. Look into it before targeting EU/UK marketing. Language versions alone do not trigger it.

### A.4 Publishing API (YouTube Data API v3, docs accessed 2026-11-13)

- **Quota.** `videos.insert` uses 1 unit from a separate upload bucket, capped at 100 uploads/day. The upload cost moved to its own bucket on 2026-06-01. Other calls share 10,000 units/day: `captions.insert` 400, `thumbnails.set` 50, `videos.list` 1. A full publish (upload + 1 caption + thumbnail + playlist insert) uses about 500 shared units, so about 20 videos/day fit, far above need.
- **Made for kids.** Set the writable `status.selfDeclaredMadeForKids: true` on every upload. Since 2026-10-15 the property changes only when it is sent. The help-page text saying "coming soon" is stale.
- **Scheduling.** `status.publishAt` works only with `privacyStatus: "private"`.
- **Privacy default.** Since **2026-11-02**, unverified API projects are no longer forced to private, and an omitted `privacyStatus` defaults to **public**. `publish-youtube.mjs` must always send `privacyStatus: "private"` and schedule from there. A missing field must fail the tool. This matters for safety: a mistaken run must never publish an unreviewed video.
- **AI flag.** `status.containsSyntheticMedia` is settable on insert and update (added 2024-10-30).

### A.5 Generation stack

| Layer | Option 1 (recommended) | Option 2 | Notes |
| --- | --- | --- | --- |
| Script | LLM via Kiro Prism with JSON-schema output against `ShowSpec` | Hand-writing with LLM help | Allowed by YPP ("AI to edit your video scripts"). Quality risk is "hard to follow" scripts, so keep the validator + human edit |
| Voices | ElevenLabs premade voices already cast (7 voice ids) | Custom voice design per character, or human voice actors for hero lines | Paid plans include a commercial licence ([ElevenLabs Help], accessed 2026-11-13). Terms updated 2026-10-09: output rights stay with the user, but other users may get similar output. The Prohibited Use Policy was not reviewed for kids-specific rules (**open**) |
| Songs and beds | ElevenLabs Music on **Creator plan or higher** | Commissioned composer for the theme song | **Eleven Music Terms Exhibit A (2026-10-09): "streaming distribution" is prohibited on Free and Starter, permitted from Creator up; film/TV/radio only on Enterprise Music.** All 26 songs and 8 beds today are `starter` [measured]. Before launch, ask ElevenLabs whether a YouTube upload counts as "streaming distribution". If it does, re-render on Creator+ or get written confirmation that it doesn't. The terms say nothing about Content ID, so do not register the songs in Content ID until clarified. A human-composed theme song removes the risk for the most-used track |
| SFX | Existing 42-file bank (`starter`) + ElevenLabs sound generation | Licensed SFX library | Low risk; same commercial-licence rule as TTS |
| Lip sync | ElevenLabs character timestamps → visemes → existing bridge (`articulated-actors.ts:2252+`) | Keep the amplitude curve | B3.6 |
| Render | Deterministic offline frames on a remote GPU (B.5) | Real-time capture | Offline is exact and repeatable; real-time drops frames |
| Captions | SRT generated from the locale pack | YouTube auto-captions | Exact by construction; 400 quota units each |
| Thumbnails | Rendered from the scene (`tools/thumbnail.mjs`) | Image generation | Rendering keeps characters on-model, and AI thumbnails fall under YouTube's "production help" exemption anyway |

### A.6 Child development guidance

- **WHO (2019-04-24):** sedentary screen time is not recommended at age 1; at 2–4 years, no more than 1 hour, "less is better".
- **AAP 2016 ("Media and Young Minds"):**
  - Under 18–24 months: avoid digital media except video chat.
  - 18–24 months: high-quality programming only, watched together.
  - 2–5 years: 1 hour/day of high-quality programming, co-viewed.
  - "Avoid fast-paced programs."
- **AAP 2026 policy statement** (Pediatrics 157(2), 2026-01-20): the focus moves from minute limits to quality, context and design. It names autoplay and endless scrolling as features "not built with children's well-being in mind". Whether it keeps the 1-hour number for ages 2–5 is **unverified**.
- **Pacing evidence.**
  - Four-year-olds who watched 9 minutes of a fast-paced cartoon did worse on executive-function tasks right afterwards than children who watched a slow show or drew (Lillard & Peterson, Pediatrics 2011).
  - Of 426 YouTube videos watched by 0–3-year-olds, 73% were fast-paced, 19% were age-appropriate and 6% had a learning goal (Henderson et al., Front. Dev. Psychol. 2024).
  - The AAP notes experts criticise CoComelon for "too fast a pace" (AAP Q&A, 2025-07-13).
- **Video deficit:** children under about 2–3 learn less from video than from a live person, so co-viewing and real-world follow-up matter. This is why every episode ends with an offline play card.
- **Positioning that follows from this (honest):**
  - The channel is "**for ages 1–5, best watched together**".
  - For 1–2-year-olds, it is short co-viewing content with a grown-up. The plan does not market solo viewing to under-2s.
  - For 3–5-year-olds, solo viewing is acceptable.
  - No speech or development claims (R9).

### A.7 Quality control without a human in every loop

Automated gates are listed in B.6. The research adds:
1. A **flash check** against the WCAG 2.3.1 thresholds: no more than 3 flashes per second above the general or red-flash threshold, and an area limit of 25% of a 10° field (W3C Understanding doc, updated 2025-09-17). Optionally cross-check with the open-source PEAT or a Harding run before TV licensing (Ofcom thresholds **unverified** from the primary source).
2. A **near-duplicate story check** for the YPP inauthentic-content rule.
3. A **safety-facts list** for content about food, sleep and car seats: no whole grapes, no honey for babies, seatbelts always on. These are exactly the errors found in AI kids channels (The 74, 2026-03-18).
4. **Human approval is still required** for every public video in year 1 (F.3). Automation narrows the human's job to watching and approving.

### A.8 Benchmarks (format and pacing only)

| Channel | Scale | What to learn | What we do differently |
| --- | --- | --- | --- |
| Ms Rachel | 21.5M subs, 17.7B views (Wikipedia, 2026-10-08); Netflix #9 title H1 2026 (Deadline, 2026-07) | Slow speech, direct address, built-in pauses; uploads of 1–3+ hours | Same pause model (C.6), delivered by animated characters, with an interactive app twin |
| CoComelon | ~200M subs (Wikipedia, 2026-04) | Compilations from 15 min up to 2–5 hours (New Yorker, 2024-06-17) | Calmer: about 9.8 cuts/min reported for CoComelon vs our cap of ≤4 (SmartMove, 2026-05, low rigor) |
| Super Simple Songs | ~47M subs; network >70M (YouTube blog, 2026) | Short single songs + "Top 20" compilations | Songs tied to a story and to characters |
| Bluey (official) | ~15M subs (2026-05) | 40-minute to 2-hour full-episode compilations | Episode-first; 10-minute originals |
| Blippi | 27.5M subs, about 6 uploads/week (CreatorDB, 2026-10-01) | Steady cadence; animated spin-off of ~57-minute compilations | Lower cadence, human-reviewed |
| Hey Bear Sensory | ~4M subs (unverified) | Long-form calm content for babies | Our bedtime long-play from the existing sleep worlds |

Comparison points: AI slop channels post about 50 videos/day, while Sesame Street posted about 3,900 videos in 20 years (The 74, 2026-03-18). Compilations' share of kids' watch time: no primary data found (**unverified**).

What Wonder World can do that they cannot:
- true 3D sets with deterministic re-renders (fix one line, re-render the episode exactly);
- a playable twin of every episode;
- many languages from one spec;
- new characters added as data.

### A.9 Sources

All accessed 2026-11-13 unless a date is given.

- YouTube Help: [9527654](https://support.google.com/youtube/answer/9527654) MFK features · [9528076](https://support.google.com/youtube/answer/9528076) · [9684541](https://support.google.com/youtube/answer/9684541) · [10774223](https://support.google.com/youtube/answer/10774223) kids quality principles · [10938174](https://support.google.com/youtube/answer/10938174) YouTube Kids policy · [1311392](https://support.google.com/youtube/answer/1311392) monetisation / inauthentic content · [14328491](https://support.google.com/youtube/answer/14328491) synthetic content
- YouTube blog, [Improving AI labels](https://blog.youtube/news-and-events/improving-ai-labels-viewers-creators) (2026-05-27); TechCrunch, [YouTube clarifies AI slop policies](https://techcrunch.com/2026/07/20/youtube-clarifies-policies-around-ai-slop-and-upsetting-videos) (2026-07-20); CNBC, [YouTube chief on AI slop](https://www.cnbc.com/2026/01/21/youtube-chief-says-managing-ai-slop-is-a-priority-for-2026-.html) (2026-01-21); Fortune, [200 organisations letter](https://fortune.com/2026/04/01/ai-slop-200-organizations-letter-youtube-google) (2026-04-01); The 74, [AI slop in children's media](https://www.the74million.org/zero2eight/ai-slop-is-flooding-childrens-media-parents-should-be-very-alarmed) (2026-03-18); Bloomberg (2025-12-03, paywalled)
- YouTube Data API: [quota costs](https://developers.google.com/youtube/v3/determine_quota_cost) · [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) · [videos resource](https://developers.google.com/youtube/v3/docs/videos) · [revision history](https://developers.google.com/youtube/v3/revision_history)
- FTC: [COPPA final rule press release](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data) (2025-01-16) · [Federal Register 2025-05904](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm) (2025-04-22) · [channel owners blog](https://www.ftc.gov/business-guidance/blog/2019/11/youtube-channel-owners-your-content-directed-children) (2019-11-22)
- WHO [screen-time guideline](https://www.who.int/news/item/24-04-2019-to-grow-up-healthy-children-need-to-sit-less-and-play-more) (2019-04-24); AAP [Media and Young Minds](https://publications.aap.org/pediatrics/article/138/5/e20162591/60503/Media-and-Young-Minds) (2016); AAP [Digital Ecosystems policy](https://publications.aap.org/pediatrics/article/157/2/e2025075320/206129/Digital-Ecosystems-Children-and-Adolescents-Policy) (2026-01-20); AAP [CoComelon Q&A](https://www.aap.org/en/patient-care/media-and-children/center-of-excellence-on-social-media-and-youth-mental-health/qa-portal/qa-portal-library/qa-portal-library-questions/watching-cocomelon-and-guidance-on-early-childhood-development) (2025-07-13); [Lillard & Peterson 2011](https://pubmed.ncbi.nlm.nih.gov/21911349/); [Henderson et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11583682)
- ElevenLabs: [Terms of Use](https://elevenlabs.io/terms-of-use) (2026-10-09) · [Music Terms](https://elevenlabs.io/music-terms) (2026-10-09) · [Help: publishing generated content](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform)
- W3C [WCAG 2.3.1 Understanding](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) (2025-09-17)
- [Momo Challenge hoax](https://en.wikipedia.org/wiki/Momo_Challenge_hoax) (Wikipedia); AIR Media-Tech [RPM by niche](https://air.io/en/air-data-findings/which-youtube-niche-makes-the-most-money-in-2026-ranked-by-real-rpm-and-cpm) (2026-07-01); channel figures from Wikipedia, CreatorDB and Deadline as dated in A.8

---

## B. Engine architecture and phased build plan

### B.1 Principle

The app is the renderer. Every published video plays real `EpisodeSpec` data through the same director, stage and character code as the app. The engine adds four things: a writers' room that drafts specs, a broadcast mode that plays them without UI or waits, a deterministic frame and audio renderer, and a publish step behind a human approval. Nothing is drawn by a second engine, which matches the Aura3D-only rule. Characters stay on-model by construction because they are the same procedural rigs (`src/scenes/procedural-rigs/cast-rigs.ts`).

### B.2 Pipeline

```
 1  Brief            curriculum slot (C.1 calendar) + age band + lead character + segment template
 2  Writers' room    LLM via Kiro Prism → ShowSpec JSON + locale lines (structured output only)
 3  Validate         schema.ts + J14 + age-band + banter + safety rules → repair ≤2, else drop
 4  Voice/music      tools/gen-audio.ts (Prism → ElevenLabs): lines, new songs, SFX; word timings saved
 5  Lock timings     measured line lengths → beat holdMs, song cue times, viseme tracks
 6  Broadcast cut    invites → PAUSE beats; WELCOME_NAME stripped; 16:9 framing; chrome hidden
 7  Render frames    remote GPU, ?broadcast=1&manual=1, advanceTo(t) per frame → PNG/raw stream
 8  Render audio     offline ffmpeg mix from the director event log (no WebAudio capture)
 9  Mux             ffmpeg: H.264/AAC MP4, chapters, SRT captions, -14 LUFS master
10  QC gates         B.6 automated checks → report.json; any failure blocks
11  Human approval   reviewer watches at 1x, signs the manifest (F.3)
12  Publish          YouTube Data API: upload private → captions → thumbnail → schedule, made-for-kids true
13  Learn            YouTube Analytics (aggregate only) → next briefs
```

### B.3 Changes to the app (mapped to files)

| # | Change | Files | Test |
| --- | --- | --- | --- |
| B3.1 | **Broadcast mode** `?broadcast=1`: hides all UI (start screen, menu, controls, captions DOM), ignores `WELCOME_NAME`, locks `mode` to a new `"broadcast"` play mode, forces 16:9 1920×1080 canvas, no input routing | `src/main.ts`, `src/app.ts`, `src/personal.ts`, `src/ui/*` (guards), `src/runtime/feature-flags.ts` | unit: no DOM chrome and no welcome name in broadcast mode; `no-child-data.test.ts` extended |
| B3.2 | **Invite → PAUSE beat**: in broadcast mode an `invite` beat holds `pauseMs` (default 2,500) with the speaker facing `viewer` and the target object glowing, then plays its `response` as if tapped. Silence still completes the story, which is the existing rule | `src/runtime/episode-director.ts`, `src/runtime/turn-taking.ts`, `src/runtime/beat-runner.ts` | unit: every invite resolves to its response after `pauseMs`, with no tap |
| B3.3 | **`ShowSpec`**: a long episode made of segments (`EpisodeSpec` bodies with `world`, `cast`, `props`) plus links. The director plays segments in order, with a GoGo train transition or a soft fade between worlds | `src/types.ts` (new type), `src/content/schema.ts`, new `src/content/shows/`, `src/app.ts` (runner), `src/scenes/stage.ts` (world swap without reload) | unit: schema; browser (remote): world swap keeps shader programs warm and has no black frame longer than 1 frame |
| B3.4 | **Sub-step presentation**: `advance(ms)` steps in 50 ms ticks [measured, `src/qa/install-hooks.ts:65`]. Add `advanceTo(tMs)`, which runs fixed steps up to `floor(t/50)` and presents the in-between pose through `createFixedStepPresenter` (`packages/game/src/motion/presenter.ts:28`), so 30 or 60 fps frames are exact | `src/qa/install-hooks.ts`, `src/app.ts` | unit: two runs give byte-identical trace rows (`traceRow()`) at the same t |
| B3.5 | **Event log**: the director emits `{t, type: line|song|sfx|bed|duck, id}` for every audio start/stop, exposed as `__AURA_WONDER_WORLD__.eventLog()` | `src/runtime/episode-director.ts`, `src/runtime/narration-player.ts`, `src/runtime/audio-mixer.ts` | unit: log matches narration-player timing to within 1 step |
| B3.6 | **Timed mouths**: save ElevenLabs character-level alignment (`/with-timestamps`) next to each line MP3. Convert it to a viseme track and feed the existing bridge (`src/scenes/articulated-actors.ts:2252+`). The amplitude curve stays as the fallback | `tools/gen-audio.ts`, new `tools/gen-visemes.ts`, `src/scenes/articulated-actors.ts` | unit: mouth closed at rest; open frames line up with voiced segments |
| B3.7 | **Data-driven cast**: `CharacterId` and `SpeakerId` stay typed unions, but they are generated from `src/characters/sheets/*.json` (personality, voice id, catchphrases, banned behaviours, rig module), the same way `src/aura-assets.ts` is generated. Adding a character = sheet + rig module + portrait + regenerate | new `tools/gen-cast.mjs`, `src/characters/character-registry.ts`, `tools/gen-audio.ts` (`VOICES` read from sheets) | `check-all.sh` generated-files diff; registry test covers every sheet |
| B3.8 | **Docs fix**: README and `02` §1 still describe Meshy GLBs and "no mouth morphs". Update them to the procedural cast | `README.md`, `02-character-and-content-bible.md` | none |

### B.4 New tools

| Tool | Job |
| --- | --- |
| `tools/write-show.ts` | Brief → Prism LLM call with JSON schema output from `ShowSpec` + the closed `StageAction` vocabulary + character sheets + the banter bible (C.3). Writes `src/content/shows/<id>.ts` and `src/localization/en/shows/<id>.ts` drafts |
| `tools/validate-show.ts` | Wraps `schema.ts` and J14, then adds the age-band, banter and safety rules in B.6. Returns repair hints the writer gets at most twice |
| `tools/render-episode.mjs` | Remote only. Starts the built app in headless Chromium with GPU, calls `startStory`/`advanceTo`, reads frames with `canvas.toBlob` or the CDP screencast, and pipes them to ffmpeg. Writes `frames.mp4` and `events.json` |
| `tools/mix-episode.mjs` | Builds the audio from `events.json` with ffmpeg (`adelay` + `amix`; beds ducked under speech with `sidechaincompress`). Mastered to -14 LUFS integrated for YouTube; the existing per-type targets in `tools/gen-audio.ts` stay |
| `tools/qc-episode.mjs` | Runs the B.6 gates on the final MP4 and writes `qc.json` |
| `tools/publish-youtube.mjs` | YouTube Data API v3 OAuth upload: always `privacyStatus: "private"` + `publishAt` (fails if missing, since omitted privacy now defaults to public, A.4), `selfDeclaredMadeForKids: true`, `containsSyntheticMedia` per A.2, captions, thumbnail, playlist. Refuses to run without a signed manifest (F.3) |
| `tools/thumbnail.mjs` | Renders a 1280×720 still from a chosen beat time with the characters posed (`stageApply`), then adds title text in DOM over the frame. No image-generation model, so characters stay on-model |

### B.5 Render cost and target

- A 10:00 episode at 30 fps is 18,000 frames [measured arithmetic].
- The stage targets real-time on phones, so a cloud GPU should render faster than real time. Plan for 0.5–2× real time [estimate], or 5–20 minutes of GPU time per episode.
- Target: the cheapest GPU tier that passes, on Azure `az-auraone-gurbaksh` first (owner cloud preference), as a Container Apps Job or a spot VM that is deleted on exit with zero leftovers. Budget about $0.10–$1.00 per episode for compute [estimate; measure in P0].
- Software WebGL2 (SwiftShader) also works, because the clock is deterministic and only speed changes. Use it as a fallback, but it is likely 20–50× slower [estimate].
- Voice cost is the larger item: about 120 lines × 6 words per new episode, using ElevenLabs characters on the paid tier [estimate; check the plan's character allowance].

### B.6 Automated QC gates (any failure blocks publishing)

| Gate | Rule | How |
| --- | --- | --- |
| Schema | `ShowSpec` valid; every line key has text and audio; every prop, gesture and SFX is in the closed vocabulary | `validate-show.ts` |
| Language | Lines ≤ 9 words (current rule); band vocabulary list (C.1); no banned words or themes list (danger, fear, violence, food shaming, body comments, brand names, real people) | `validate-show.ts` |
| Banter | One speaker at a time; no line that mocks a character; every "silly mistake" is corrected in the same beat or the next (C.3) | `validate-show.ts` |
| Pacing | Cuts ≤ 4/min in the 1–3 band; every PAUSE ≥ 2 s; no beat shorter than 1.5 s | `validate-show.ts` on the timed spec |
| Duration | Long episode 9:30–12:00; Shorts ≤ 60 s, 9:16 | `qc-episode.mjs` |
| Flash safety | No more than 3 general or red flashes in any 1 s window (WCAG 2.3.1 thresholds) and no large saturated-red transitions; frame luminance analysis | `qc-episode.mjs` |
| Audio | Integrated -14 ±1 LUFS; true peak ≤ -1 dBTP; music ≥ 10 dB under speech while a line plays; no clip louder than speech | ffmpeg `ebur128` |
| Sync | Each line's audio onset within 1 frame of its event-log time; mouth open within 2 frames | `events.json` vs the audio onset detector |
| On-model | For each character, a silhouette crop vs. its reference portrait (`src/assets/portraits/*.webp`), using perceptual hash distance under a threshold | `qc-episode.mjs` + `nodeRects()` |
| Privacy | No `WELCOME_NAME`, no family names list, no microphone code, no analytics in the video manifest | text scan of spec, captions, metadata |
| Rights | Every audio file's provenance `tier` is paid; every new asset has a record | `provenance/audio/*.json` scan |
| Captions | SRT built from the locale pack; each cue lines up with its line event | generated, so it is exact by construction |
| Originality | The story's situations and outcomes differ from every past episode (YPP inauthentic-content rule, A.2) | similarity of beat sequence + target words + locale text vs. the published catalogue, below a threshold |
| Safety facts | No unsafe food, sleep or travel content for the age band (no whole grapes, no honey for babies, seatbelts on; A.7) | keyword + rule list in `validate-show.ts`, plus the human review |

### B.7 Phases and exit tests

| Phase | Scope | Exit test | Rough size |
| --- | --- | --- | --- |
| **P0** | B3.1, B3.2, B3.4, B3.5, `render-episode`, `mix-episode`. Render E19 *Momo's Day* (129 s) | 1080p30 MP4, 3,870 frames, no dropped or duplicated frames, every line within 1 frame of its event, two runs byte-identical in video | 1–2 weeks |
| **P1** | B3.3 `ShowSpec`, new theme song, the launch episode in Part E written by hand, `qc-episode`, `thumbnail`, B3.8 docs | E01 passes every gate, and the owner and one outside parent approve it | 2–3 weeks |
| **P2** | `write-show`, `validate-show`, B3.6 visemes, `publish-youtube` (private uploads), Shorts cutter | 4 generated long episodes + 12 Shorts. The human edits under 20% of lines [measured by diff] | 3–4 weeks |
| **P3** | B3.7 data-driven cast, first new character, scheduling, analytics loop | 2 weeks of scheduled uploads where the human only approves or rejects; reject rate < 25% | 3–4 weeks |
| **P4** | Localisation (Punjabi pack exists at `src/localization/pa.ts`; then Spanish, Hindi), dubbed voices per character | Same video in 2 languages from one spec | ongoing |

### B.8 New character onboarding (P3)

1. Character sheet JSON: id, species and shape brief, palette, personality, banter role (C.3), catchphrases (2–3), voice id and settings, banned behaviours, lead topics.
2. Procedural rig module in `src/scenes/procedural-rigs/`, with the gesture set covered by `SHARED_GESTURES`.
3. Portrait render (`tools/render-character-portraits.mjs`) and turnaround checks (`tests/browser/wonder-world-characters*.spec.ts` pattern, remote).
4. 8–15 voice lines, reviewed.
5. An intro episode where an existing character introduces them ("Momo, who's that?"), so children meet the newcomer through a friend they trust.
6. Originality and name check before the first public episode.

---

## C. Content, curriculum and banter system

### C.1 Age bands

The channel says "ages 1+" in parent copy, but each video declares one band. The bands build on `01` §4 and `05`.

| | Band 1: **Little Ones (1–2)** | Band 2: **Toddlers (2–3)** | Band 3: **Preschool (3–5)** |
| --- | --- | --- | --- |
| Viewing model | Co-viewing with a grown-up; caregiver tips are prominent | Co-viewing encouraged | Can watch alone; caregiver tip in the description |
| Line length | 1–4 words, max 6 | 2–6 words, max 9 (current rule) | max 12 (new rule for this band only) |
| Vocabulary | first 50 words: people, animals, food, body, toys, "more", "all done", "up", "go" | +colours, numbers 1–5, in/on/under, feelings (happy, sad, sleepy), routines | +letters and sounds, numbers to 20, shapes, opposites, weather, kindness, simple cause and effect |
| Pace | 1 camera change per beat at most; ≤ 3 cuts/min; PAUSE 3 s | ≤ 4 cuts/min; PAUSE 2.5 s | ≤ 6 cuts/min; PAUSE 2 s |
| Songs | every 60–90 s; short repeated melody | every 90–120 s | 2–3 per episode, longer verses |
| Length | 5–8 min long-form; Shorts 30 s | 8–12 min | 10–14 min |
| Learning per episode | 1 target word, repeated 6+ times with its object | 2–3 target words | 1 concept (e.g. "the letter S", "counting to 10") with 3 examples |

The launch episode (Part E) is written for **Band 2** so that 1-year-olds can follow it with a parent and 4-year-olds are not bored.

### C.2 52-week topic calendar (first year)

Each week has one long episode (one topic, one lead character) plus 3–5 Shorts cut from it. Each quarter ends with a 30–60 minute compilation.

| Weeks | Theme | Lead | Example topics |
| --- | --- | --- | --- |
| 1 | Launch | Momo | Welcome to Wonder World (Part E) |
| 2–9 | **Me and my friends** | Momo, Sheru | hello and bye-bye, body parts, feelings, sharing, "more" and "all done", my family, helping, taking turns |
| 10–17 | **Colours and shapes** | Lumi, Lulu | red, blue, yellow, green; circle, square, triangle; colour mixing (Magic Colour Machine world) |
| 18–25 | **Counting and moving** | GoGo, Lulu | 1–3, 1–5, 1–10; fast and slow, go and stop, up and down, big and small |
| 26–33 | **Animals and sounds** | Peeko, Sheru | farm animals, pets, birds, bugs, animal homes, baby animals, where is it? (in/on/under) |
| 34–41 | **Letters and sounds** | Lumi | one letter per week, with 3 real objects (current pattern: `e03` Alphabet Zoo, B for ball and bear) |
| 42–47 | **Everyday routines** | Momo | wake up, wash hands, eat, brush teeth, bath, getting dressed |
| 48–52 | **Seasons and celebrations** | everyone | weather, a birthday, winter, "Wonder World's first year" special |
| always | **Bedtime long-play** | Lumi | 30–60 minute calm loop from `moonlit-nursery` and `starlight-cloud` (E21–E26, G13–G16 exist) |

### C.3 Recurring segments (the show format)

A long episode is made of 4–6 segments from this list, always in the same order, so children learn what comes next. The writers' room must pick from these templates. Each template is a `ShowSpec` segment pattern with fixed beat kinds.

| Segment | Owner | World | Pattern | Learning |
| --- | --- | --- | --- | --- |
| **Hello, Wonder World!** (opening) | everyone | island wide → host world | theme song (new) + host greeting + "today we…" | routine, greeting |
| **Momo's Uh-Oh!** | Momo | any | a small problem (lost, broken, spilled) → friends help → fixed | problem solving, kindness |
| **Sheru Finds It** | Sheru (no words), Momo | Meadow | Momo names an object, Sheru brings the wrong one first, the child is asked, Sheru brings the right one | object names, attention |
| **Ready… Go! with GoGo** | GoGo | Station | count carriages or passengers; go and stop | numbers, go and stop, sequence |
| **Lulu's Boom-Boom Beat** | Lulu | Music Garden | movement song; Lulu is one beat late, the child shows her | rhythm, body actions, copying |
| **Peekaboo with Peeko** | Peeko | Peekaboo Barn | hiding game; Peeko's hiding is always obvious | where / in / on / under, object permanence |
| **Lumi's Look-What-I-Found** | Lumi | Learning Cloud | one letter, number, shape or colour, shown with 3 real objects | letters, numbers, shapes, colours |
| **All Done, Goodnight** (closing) | Momo + Lumi | Home Nook → Starlight Cloud | calm recap, `allDone` song, offline play idea | closure, routine |

### C.4 Banter bible

Today the banter is mostly one host speaking to the viewer. In `momos-day.ts`, for example, Momo has 15 lines and Lumi has 4, and the two rarely talk to each other [measured]. The channel needs friends who talk with each other. These rules make it lovable while keeping it kind.

**Running gags (one per character, used in every appearance):**

| Character | Running gag | Example (≤ 9 words) | Why it works for toddlers |
| --- | --- | --- | --- |
| Momo | Says "Uh-oh!" before every tiny problem, then fixes it with help | "Uh-oh! Where did my hat go?" | predictable warning → safe surprise |
| Lulu | Always one beat late or off-beat, and loves it | "Boom… boom… BOOM! Oops, I'm late! La la!" | the child gets to be "better" than a character |
| Sheru | Brings the wrong thing first, wags proudly | (woofDouble, drops a sponge) Momo: "That's a sponge, Sheru!" | the child corrects the mistake |
| GoGo | Very polite: stops and says "Excuse me!" at silly times | "Stop! Excuse me, butterfly. You first!" | manners as a joke |
| Peeko | Hides in plain sight, sure no one can see | "You can't see me! I'm hiding!" (fully visible) | peekaboo + object permanence; the child is in on it |
| Lumi | Gently corrects with a real object, never says "wrong" | "Hmm, that's a cookie. Look, here's the circle!" | models correction without shame |

**Rules:**
1. One speaker at a time; each joke is one short sentence followed by a pause (current rules in `02` §1 and §5).
2. The "silly mistake → child corrects → character thanks the child" loop is the main source of interaction: "Is that a… banana?" PAUSE "Nooo! A ball! Thank you!"
3. Characters tease the situation, never each other. No put-downs, sarcasm, eye-rolling or "you're silly" aimed at someone who is upset.
4. Mistakes are always the character's, never the viewer's. There is no "wrong" path. This matches the app's rule that silence always completes the story.
5. Each friend thanks or praises another friend at least once per episode.
6. No scary surprises: anything that pops up has a soft cue first (a rustle or a "Hmm?").
7. No unsafe behaviour as a joke: no climbing on things, eating non-food, running from grown-ups, or hiding from a parent.
8. Callbacks: the closing segment repeats the episode's funniest moment once ("Remember Sheru's sponge? Silly Sheru!").

### C.5 "Addictive", defined safely

Goal: children **recognise and love the characters, and ask for them by name**. The goal is not compulsive watching.

| Use | Do not use |
| --- | --- |
| The same theme song, the same segment order, the same catchphrases | Cliffhangers ("what happens next? keep watching!") |
| Songs worth singing away from the screen | Rapid cuts (more than the band limit), flashing, loud reward stings |
| Warm characters who look at the child and wait | Countdown timers, "don't leave", or calls to watch more aimed at the child |
| Satisfying endings: every problem is solved in the episode | Endless compilations that never wind down; every compilation ends calm |
| A calm close with an offline play idea | Clickbait thumbnails (shocked faces, crying, fake objects) |

This choice still drives growth. Parents choose and subscribe to the channels they trust. Calm, slow channels with direct address show this works at a very large scale (see D.1 benchmarks). YouTube's kids quality principles reward the same traits (§A).

### C.6 Interactivity in a linear video

The app's `invite` beat turns into a **PAUSE beat** (B3.2):
1. The question: the character faces the viewer and asks a short question ("Where's the ball?").
2. The hint: the target object glows softly (the existing `glow` action, which never flashes).
3. The pause: hold 2–3 s by age band. The character holds the `wait` gesture, and the music drops to 50%.
4. The answer: the character answers and praises: "There it is! You found it!"
5. A caregiver cue appears in the captions at the pause: `[pause: point and say "ball"]`.

Also: copy-me movements (Lulu's dance), count-along (fingers on screen as 3D props), and sing-alongs with the lyric line shown as large text in Band 3 only. The description links to the matching interactive story in the Wonder World app.

---

## D. Launch and growth strategy

### D.1 Positioning: the opposite of the AI kids-channel playbook

The common playbook (high volume, nursery-rhyme covers, keyword-stuffed titles, loud thumbnails) is now what YouTube demonetises and what reporters and advocacy groups target (A.2). Wonder World competes on **trust**:

| Common playbook | Wonder World |
| --- | --- |
| 10–50 uploads a day | 1–2 long episodes + 5 Shorts a week, each watched by a person before release |
| Faceless and anonymous | A real founder story: a dad who built a calm world for his son (the parent side only; never the child's name, face or voice) |
| Fast cuts, flashing, loud stings | ≤ 4 cuts/min, a flash gate on every video, pauses for the child (A.6, B.6) |
| Hidden AI | Says plainly: "made with AI tools and our own 3D engine, written and checked by a parent". The AI flag is set on song videos (A.2) |
| Watch-only | Every episode has a **playable twin** in the Wonder World app: "Watch it, then play it together" |
| Covers of public-domain rhymes | Original characters and songs that only exist here |

Tagline candidates: "Calm, kind, and made to watch together." / "Little stories. Big friends. Lots of pauses for you."

### D.2 Format mix

| Format | Length | Share of uploads | Role |
| --- | --- | --- | --- |
| Story episode | 9–12 min | 1–2/week | the core; chapters; one lesson each |
| Compilation | 30–60 min (bedtime long-play up to 90) | 1/week after week 4 | most of the watch time at peer channels (CoComelon and Bluey post 40 min–2 h compilations, A.8); always ends calm |
| Shorts | 15–60 s, 9:16 | 5/week | discovery; one gag or one song (E.9) |
| Sing-along | 1–3 min | 1/week | the song alone with large lyrics for Band 3; feeds music distribution |
| Parent video | 3–5 min | 1/month | the founder story, how to co-view, how the app works; adult-directed and **not** MFK, so it can carry comments and links |

### D.3 Discovery without spam

- **Titles parents search for**, led by the topic, then the brand: "Count to 5 Party for Toddlers | Wonder World". No keyword stuffing, which is a kids low-quality signal (A.2).
- **Chapters** in every long video (E.7). They help parents skip to a song and help search.
- **Playlists by topic and band**: "Start here", "Counting with GoGo", "Peekaboo", "Bedtime with Lumi", "Songs".
- **Consistent thumbnails** rendered from the scene: the same palette, 1–3 characters facing the camera, 2–3 words of text. No shocked faces or arrows.
- **Language channels**: once P4 lands, a separate channel per language (Punjabi first), because YouTube recommends better within one language.
- **Captions** on every video (a ranking and accessibility benefit).
- **No end screens or cards** (MFK disables them, A.2), so the description and the channel page carry the app link.

### D.4 Launch plan

| When | What |
| --- | --- |
| T-6 weeks | Name and trademark clearance (R6); ElevenLabs music plan resolved (A.5); P0–P1 done |
| T-4 weeks | Backlog ready: E01 + 7 more long episodes, 20 Shorts, 1 compilation, the founder video, channel art. The banner and avatar are rendered from Aura3D |
| T-2 weeks | Private screening with 10–20 parent families (friends, a parents' group); collect what made kids laugh and where they lost interest; fix |
| T-1 week | Channel live with the trailer (the theme song + 30 s of E01) and the founder video; app page updated with a "Watch on YouTube" link |
| Launch day | E01 + 3 Shorts; post in parent communities with the founder story (D.5) |
| Weeks 1–4 | 2 long + 5 Shorts per week; weekly look at retention graphs; first compilation in week 4 |
| Weeks 5–12 | Move to 1–2 long + 5 Shorts + 1 compilation + 1 sing-along; Punjabi pilot of E01 |

**Targets** [estimate; reset after week 4 with real data]:

| Metric | Week 1 | Week 4 | Week 12 |
| --- | --- | --- | --- |
| Subscribers | 100 | 1,000 | 10,000 |
| Average view duration, long episodes | 40% | 50% | 55% |
| Returning viewers share | — | 30% | 45% |
| Videos published | 4 | 16 | 50 |

### D.5 Off-YouTube growth

- **Parent communities**: local parent groups, Reddit parenting communities (read each community's self-promotion rules first), and Facebook toddler groups. Lead with the founder story and the "watch together" angle, not the link.
- **Instagram and TikTok** parent clips: the founder's voice-over about building it, plus the Shorts.
- **Early-years educators and speech therapists**: offer free classroom use and a printable activity sheet per episode. Make no therapy claims (R9).
- **Printables**: a one-page activity per episode (count the party things, colour Momo) on the website. They are cheap to make from rendered frames.
- **A web page per episode** on the Wonder World site (Cloudflare Pages). Each page has the embed, the caregiver tip, the printable and the app link. It is indexable for parent searches. This is the existing site rule set; publishing the app stays decision D1.
- **Music services**: release the original songs as an album once the music licence allows it (A.5). Kids' music on streaming services brings families back to the channel.

### D.6 Monetisation path (honest)

- **YouTube ads**: MFK serves contextual ads only, at about $0.33 RPM [estimate, A.2], or about $330 per million views. Join YPP when eligible, but do not plan the business on ads.
- **App**: the free app is the trust builder. Possible paid tier later: more stories, offline packs, family features (parent-side purchase only, no in-app prompts to children).
- **Music**: streaming royalties, once licences allow.
- **Licensing**: the Ms Rachel and Blippi paths show channel → Netflix/SVOD → merchandise (A.8). Note that TV/SVOD use of Eleven Music output needs **Enterprise Music** (A.5). Plan for human-composed or Enterprise-licensed songs before any licensing deal.
- **Merchandise** (plush Momo, a Lulu drum): only after the names clear.

---

## E. Launch episode: "Welcome to Wonder World!"

Episode code `S01E01` · Band 2 (2–3, co-viewing for 1–2) · Runtime 10:05 [estimate; locked by measured line lengths in P1] · 16:9 · Worlds: Meadow, Station, Music Garden, Peekaboo Barn, Learning Cloud, Home Nook, Starlight Cloud.

### E.1 Premise (chosen from three)

| Option | Premise | Verdict |
| --- | --- | --- |
| **A. Momo's Welcome Party** | A new friend is coming to Wonder World: **you**. Momo needs **five party things**. Each friend gives one, and each has one funny problem. The party is at Home Nook | **Chosen.** It has a clear goal, it counts 1→5 through the whole episode (learning built into the story), it gives every character a scene in their own world, and it has a natural ending (the party) |
| B. The Lost Hello Song | The notes of the theme song blow away across the island, and the friends find one note in each world | Rejected: music notes are abstract for 2-year-olds, and it is less concrete than objects |
| C. GoGo's Island Tour | GoGo drives the viewer around the island and each friend says hello | Rejected: no problem and no goal, so it reads as a trailer, not a story |

The five party things (counted out loud at every handoff): **1 ball** (Sheru), **2 a train ride** (GoGo), **3 a song** (Lulu), **4 a game** (Peeko), **5 stars** (Lumi, who also shows "what we'll learn").

Target words: `hello`, `friend`, `ball`, `go`, `stop`, `one`–`five`, `where`, `party`, `bye-bye`. Support words: `uh-oh`, `look`, `more`, `boom`, `peekaboo`, `star`, `cake`, `sleepy`.

### E.2 Segment table

| # | Time [estimate] | Segment | World | Cast | Learning focus | Song | Banter beat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0:00–0:50 | Cold open + **"Wonder World" theme** | island wide → Meadow | all | greeting | `wonderTheme` (new) | everyone waves; Lulu's wave is late |
| 2 | 0:50–2:05 | Momo's big news + **Sheru Finds It** | Meadow | Momo, Sheru | "friend", ball, counting **1** | — | Sheru brings a sponge, then a bubble wand, then the ball |
| 3 | 2:05–3:25 | **Ready… Go! with GoGo** | Station | Momo, GoGo, Sheru | go / stop, counting carriages, **2** | `trainSong` | GoGo stops politely for a butterfly |
| 4 | 3:25–4:55 | **Lulu's Boom-Boom Beat** | Music Garden | Lulu, Momo, Sheru | copying moves, stop/go, **3** | `goStop` | Lulu is one "boom" late every time |
| 5 | 4:55–6:15 | **Peekaboo with Peeko** | Peekaboo Barn | Peeko, Momo | where / behind / in, **4** | `peekaboo` | Peeko "hides" behind a tiny toy box |
| 6 | 6:15–7:50 | **Lumi's Look-What-I-Found** (preview) | Learning Cloud | Lumi, Momo, Peeko | **5**, what we'll learn: colours, counting, letters, animals, music, bedtime | `colours` (one verse) | Momo guesses every object wrong on purpose |
| 7 | 7:50–9:15 | **The Welcome Party** | Home Nook | all | counting 1–5 recap, "friend" | `hello` (everyone) | callback: Sheru brings the sponge again |
| 8 | 9:15–10:05 | **All Done, Goodnight** | Home Nook → Starlight Cloud | Momo, Lumi, all wave | bye-bye, calm close | `allDone` → `starlightHum` (fade) | quiet "see you soon" from each friend |

### E.3 Beat-level script

Format: each beat lists `id` · `kind` · `camera`, then its stage actions in the real `StageAction` vocabulary (`src/types.ts`), then its lines. **PAUSE n s** marks a broadcast pause beat (an `invite` in the app; B3.2). Lines are ≤ 9 words. `(sfx)` and `[gesture]` notes are stage actions. Holds are `holdMs` after the last line.

#### Segment 1 · Cold open and theme (0:00–0:50) · World `meadow`

Cast: momo `center`, lulu `left`, peeko `right`, lumi `highRight`, gogo `offLeft`, sheru `frontLeft`. Props: ball `offRight` (hidden), flower `backLeft`, tree `back`, bush `farRight`.

| Beat | Stage | Lines | Hold |
| --- | --- | --- | --- |
| `s1-island` · greeting · `high` | `music: meadowBed`; `gesture lumi float (loop)`; `object flower bloom` | narrator: "Far away, there's a little island." / narrator: "It's called… Wonder World!" | 1200 |
| `s1-theme` · song · `wide` | `song: wonderTheme` performers all; cues → line 0 `enter gogo at farLeft from offLeft style drive` + `sfx whistle`; line 2 `gesture sheru wag`; line 4 `object flower bloom`; line 5 `gesture lulu wave` (late, see banter) | (song, E.4) | 800 |
| `s1-late` · event · `medium` | `gesture lulu wave`; `face momo toward lulu` | lulu: "Hello! Oops, I'm late. Hello again!" / momo: "Silly Lulu!" | 1500 |

#### Segment 2 · Momo's big news + Sheru Finds It (0:50–2:05) · World `meadow`

Cast: momo `center`, sheru `left`. Props: ball `offRight` hidden, sponge `offRight` hidden, bubbleWand `offRight` hidden, toyBox `back`.

| Beat | Stage | Lines | Hold |
| --- | --- | --- | --- |
| `s2-hi` · greeting · `medium` | `face momo toward viewer`; `gesture momo wave` | momo: "Hi! I'm Momo." / momo: "Guess what? A new friend is coming!" | 1500 |
| `s2-who` · hook · `close` | `gesture momo point` | momo: "Who? You! You are our new friend!" / momo: "Let's have a welcome party!" | 1500 |
| `s2-five` · hook · `medium` | `gesture momo look`; `gesture momo shrug` | momo: "A party needs five things." / momo: "Uh-oh. I have zero things!" | 1800 |
| `s2-sheru-in` · event · `wide` | `enter sheru at left from offLeft style run`; `sfx woofDouble`; `gesture sheru wag (loop)` | momo: "Sheru! Can you find a ball?" | 1000 |
| `s2-wrong-1` · event · `wide` | `exit sheru to offRight style run`; then `enter sheru at left from offRight`; `show sponge`; `carry sheru sponge`; `sfx yip` | momo: "Is that a… ball?" | — |
| `s2-pause-1` · **PAUSE 2.5 s** · `close` | `face momo toward viewer`; `gesture momo wait`; `object sponge glow` | momo: "Hmm?" → PAUSE → momo: "No! That's a sponge, Sheru!" | 1200 |
| `s2-wrong-2` · event · `wide` | `carry sheru null`; `hide sponge`; `exit sheru to offRight style run`; `enter sheru at left from offRight`; `show bubbleWand`; `carry sheru bubbleWand`; `sfx arf` | momo: "A bubble wand? Silly Sheru!" | 1200 |
| `s2-right` · model · `medium` | `carry sheru null`; `hide bubbleWand`; `exit…enter sheru`; `show ball`; `carry sheru ball`; `sfx woof`; `gesture momo cheer` | momo: "A ball! Yes! Thank you, Sheru!" | 1200 |
| `s2-count-1` · repeat · `close` | `object ball bounce`; `gesture momo point` | momo: "One! One party thing." / narrator: "One ball." | 1500 |
| `s2-next` · event · `wide` | `gesture momo look`; `sfx whistle` | momo: "Now we need a ride. GoGo!" | 1000 |

#### Segment 3 · Ready… Go! with GoGo (2:05–3:25) · World `station`

Cast: gogo `left`, momo `front`, sheru `frontRight`. Props: gogoCarriage ×3 behind GoGo (`left`, `farLeft`, `offLeft`), station `back`, tunnel `farRight`, butterfly `offTop` hidden.

| Beat | Stage | Lines | Hold |
| --- | --- | --- | --- |
| `s3-arrive` · greeting · `wide` | `music: stationBed`; `enter gogo at left from offLeft style drive`; `sfx chugga`; `object gogo stop`; `sfx whistle` | gogo: "Choo-choo! Hello! I'm GoGo!" / momo: "GoGo, can you give us a ride?" | 1000 |
| `s3-yes` · model · `medium` | `gesture gogo nod` | gogo: "Yes! All aboard, everybody!" | 800 |
| `s3-count` · model · `left` | `object gogoCarriage wobble` (each, in turn, one per line) | gogo: "How many carriages? Let's count!" / gogo: "One… two… three!" | 1500 |
| `s3-pause-2` · **PAUSE 3 s** · `medium` | `face gogo toward viewer`; `gesture gogo wait` | gogo: "Ready… steady…" → PAUSE → gogo: "GO! You said it!" | 600 |
| `s3-go` · event · `wide` | `move gogo to right style drive`; `move momo to right style ride*`; `move sheru to right style run`; `sfx chugga` | narrator: "Chugga, chugga, off they go!" | 800 |
| `s3-butterfly` · event · `close` | `show butterfly`; `enter butterfly at center from offTop style fly`; `object gogo stop`; `sfx squeak` | gogo: "Stop! Excuse me, butterfly. You first!" | 2000 |
| `s3-laugh` · repeat · `medium` | `exit butterfly to offTop style fly`; `gesture momo happy`; `gesture sheru wag` | momo: "GoGo always says excuse me!" | 800 |
| `s3-song` · song · `wide` | `song: trainSong` performers gogo, momo, sheru; cue line 2 `move gogo to farRight style drive`; line 4 `object gogo stop` | (`trainSong`, existing) | 600 |
| `s3-count-2` · repeat · `close` | `gesture momo point` | momo: "Two! A ball, and a ride!" / narrator: "Two party things." | 1200 |
| `s3-tunnel` · event · `wide` | `exit gogo to offRight style drive`; `exit momo to offRight`; `sfx whoosh` | gogo: "Next stop… the music garden!" | 600 |

\* `ride` is not a `MoveStyle` today. Use `move momo … style drive` with Momo placed on the first carriage (`carry gogo momo` is not valid either). The clean fix is a new `do: "ride"` action; it is listed in E.8.

#### Segment 4 · Lulu's Boom-Boom Beat (3:25–4:55) · World `music-garden`

Cast: lulu `center`, momo `left`, sheru `frontLeft`, gogo `offRight` (parked). Props: drum `right`, toyPiano `back`, stompStone ×3 (`front`, `frontLeft`, `frontRight`).

| Beat | Stage | Lines | Hold |
| --- | --- | --- | --- |
| `s4-hi` · greeting · `wide` | `music: gardenBed`; `enter momo at left from offLeft`; `gesture lulu dance (loop)` | lulu: "La la la! Hello, friends!" / momo: "Lulu! We need a party song!" | 1000 |
| `s4-boom` · model · `medium` | `object drum shake`; `sfx drum` ×2 | lulu: "A song? I love songs! Boom, boom!" | 600 |
| `s4-copy` · model · `medium` | `gesture lulu stomp`; `sfx stomp` | lulu: "Copy me! Stomp, stomp!" | — |
| `s4-pause-3` · **PAUSE 3 s** · `close` | `face lulu toward viewer`; `gesture lulu wait` | lulu: "Your turn! Stomp, stomp!" → PAUSE → lulu: "Great stomping!" | 800 |
| `s4-late-1` · event · `wide` | `gesture momo clap`; `sfx clap`; (one step later) `gesture lulu clap`; `sfx clap` | momo: "Clap!" / lulu: "…Clap! Oops, I'm late again!" | 1200 |
| `s4-song` · song · `wide` | `song: goStop` performers lulu, momo, sheru; cue line 3 `gesture momo freeze` + `gesture sheru freeze`; then (+600 ms) `gesture lulu freeze` | (`goStop`: "Clap, clap, clap with me…") | 800 |
| `s4-late-2` · event · `close` | `gesture lulu happy`; `gesture sheru wag` | lulu: "I stopped! A little late. La la!" | 1200 |
| `s4-pause-4` · **PAUSE 2.5 s** · `medium` | `gesture lulu wait`; `gesture momo wait` | lulu: "Can you freeze? Ready… freeze!" → PAUSE → lulu: "Wow! You froze like a statue!" | 1000 |
| `s4-count-3` · repeat · `close` | `gesture momo point` | momo: "Three! A ball, a ride, a song!" / narrator: "Three party things." | 1200 |
| `s4-next` · event · `wide` | `sfx whistle`; `exit lulu to offRight style hop`; `exit momo to offRight style walk` | lulu: "Come on! Let's find Peeko!" | 600 |

#### Segment 5 · Peekaboo with Peeko (4:55–6:15) · World `peekaboo-barn`

Cast: momo `left`, peeko `right` (hidden behind toyBox). Props: barn `back`, door `backLeft`, toyBox `right` (size 0.35, deliberately too small), hat `offTop` hidden.

| Beat | Stage | Lines | Hold |
| --- | --- | --- | --- |
| `s5-arrive` · greeting · `wide` | `music: barnBed`; `enter momo at left from offLeft style walk`; `gesture peeko hide` | momo: "Peeko? Where are you?" | 800 |
| `s5-hiding` · event · `medium` | `gesture peeko peek`; `sfx giggle` | peeko: "You can't see me! I'm hiding!" | 1200 |
| `s5-pause-5` · **PAUSE 3 s** · `close` | `face momo toward viewer`; `gesture momo shrug`; `object toyBox glow` | momo: "Hmm. Where is Peeko?" → PAUSE → momo: "Behind the box? You're right!" | 600 |
| `s5-pop` · event · `medium` | `gesture peeko hop`; `sfx boing` | peeko: "Peekaboo! Here I am!" / momo: "Peeko, that box is very small!" | 1000 |
| `s5-ask` · hook · `medium` | `face peeko toward momo` | momo: "We need a game for the party." / peeko: "A game? Peekaboo is the best game!" | 1000 |
| `s5-song` · song · `wide` | `song: peekaboo` performers peeko, momo; cue line 3 `object door open` + `sfx doorOpen`; line 4 `gesture peeko hide` | (`peekaboo`, existing) | 600 |
| `s5-hat` · event · `close` | `show hat`; `enter hat at center from offTop style float`; `object hat fall`; `gesture momo hide` (under hat, still visible) | momo: "Now I'm hiding! Can you see me?" | — |
| `s5-pause-6` · **PAUSE 2.5 s** · `close` | `gesture momo wait` | peeko: "Where's Momo?" → PAUSE → peeko: "Under the hat! Peekaboo, Momo!" | 1200 |
| `s5-count-4` · repeat · `medium` | `hide hat`; `gesture momo happy` | momo: "Four! A ball, a ride, a song, a game!" / narrator: "Four party things." | 1200 |
| `s5-next` · event · `wide` | `gesture peeko point` (up) | peeko: "One more! Let's ask Lumi, up high!" | 600 |

#### Segment 6 · Lumi's Look-What-I-Found: the preview (6:15–7:50) · World `learning-cloud`

Cast: lumi `high`, momo `left`, peeko `right`. Props, all hidden at `center` until conjured: apple, toyBlock ×3 (`frontLeft`, `front`, `frontRight`), letterB, cow, drum, moon. Each one appears, gets one line, and leaves.

| Beat | Stage | Lines | Hold |
| --- | --- | --- | --- |
| `s6-hi` · greeting · `wide` | `music: cloudBed`; `enter lumi at high from offTop style float`; `gesture lumi glow` | lumi: "Hello, friends. I'm Lumi." / momo: "Lumi! We need one more party thing!" | 1000 |
| `s6-stars` · model · `medium` | `gesture lumi twinkle`; `sfx sparkle` | lumi: "How about… twinkly stars?" / momo: "Five! Stars! Yes, please!" | 1000 |
| `s6-preview` · hook · `medium` | `face lumi toward viewer` | lumi: "Our new friend can learn with us." / lumi: "Look what I found!" | 800 |
| `s6-colour` · model · `close` | `show apple`; `gesture lumi point` | momo: "Is it… a banana?" / lumi: "It's a red apple! Red!" | 1000 |
| `s6-count` · model · `medium` | `show toyBlock` ×3, one per word; `object toyBlock stack` | lumi: "Blocks! Let's count. One, two, three!" | — |
| `s6-pause-7` · **PAUSE 3 s** · `medium` | `object toyBlock glow`; `gesture lumi wait` | lumi: "How many blocks?" → PAUSE → lumi: "Three! You counted!" | 600 |
| `s6-blocks-fall` · event · `medium` | `object toyBlock topple`; `sfx tumble`; `gesture momo surprise` | momo: "Uh-oh! Tumble! That's okay." | 800 |
| `s6-letter` · model · `close` | hide blocks; `show letterB`; `object letterB wobble` | lumi: "A letter! This is B." / peeko: "B! B for… bee? Buzz!" | 1000 |
| `s6-animal` · model · `medium` | hide letterB; `show cow`; `sfx moo` | momo: "A dog?" / lumi: "A cow! The cow says moo!" | 1000 |
| `s6-music` · model · `medium` | hide cow; `show drum`; `object drum shake`; `sfx drum` | lumi: "Music! Lulu will love this." | 600 |
| `s6-bedtime` · model · `wide` | hide drum; `show moon`; `object moon glow` (soft) | lumi: "And sleepy songs at bedtime." / momo: "[yawn] Not yet! Party first!" | 1200 |
| `s6-list` · repeat · `wide` | `song: colours` (first two lines only; performers lumi, momo, peeko) | (`colours`: "Red, red, a red ball…") | 600 |
| `s6-count-5` · repeat · `close` | `gesture lumi twinkle`; `sfx sparkle`; `gesture momo cheer` | momo: "Five! Ball, ride, song, game, stars!" / narrator: "Five party things!" | 1500 |
| `s6-go` · event · `wide` | `sfx whistle` | momo: "Everybody! To my house!" | 600 |

#### Segment 7 · The Welcome Party (7:50–9:15) · World `home-nook`

Cast: momo `center`, lulu `left`, peeko `right`, lumi `highLeft`, sheru `frontLeft`, gogo `farRight`. Props: table `back`, cake `back`, balloon ×3 (`highRight`, `backLeft`, `backRight`), partyHat ×1 on momo, ball `front`, sponge `offLeft` hidden.

| Beat | Stage | Lines | Hold |
| --- | --- | --- | --- |
| `s7-ready` · greeting · `wide` | `music: homeBed`; `object balloon rise`; `gesture lumi twinkle` | narrator: "The party is ready!" | 800 |
| `s7-welcome` · model · `medium` | `face momo toward viewer`; `gesture momo wave`; everyone `face … viewer` | momo: "Welcome to Wonder World, new friend!" | 1000 |
| `s7-recap` · repeat · `wide` | one stage action per line: `object ball bounce`; `object gogo go` + `sfx whistle`; `gesture lulu dance`; `gesture peeko peek`; `gesture lumi twinkle` | momo: "Let's count our party things!" / momo: "One, a ball!" / momo: "Two, a ride!" / momo: "Three, a song!" / momo: "Four, a game!" / momo: "Five, stars!" | 1000 |
| `s7-pause-8` · **PAUSE 3 s** · `close` | `gesture momo wait` | momo: "How many party things?" → PAUSE → momo: "Five! You're so clever!" | 800 |
| `s7-callback` · event · `medium` | `enter sheru at front from offLeft style run`; `show sponge`; `carry sheru sponge`; `sfx woofDouble` | momo: "Sheru! Not the sponge again!" / lulu: "La la! Silly Sheru!" | 1500 |
| `s7-song` · song · `wide` | `song: hello` performers all; cue line 0 `gesture sheru wag`; line 2 `object balloon bounce` | (`hello`: "Hello, hello, hi, hi, hi! Wave hello, friend!") | 600 |
| `s7-thanks` · repeat · `medium` | `gesture momo bow` | momo: "Thank you, friends. Best party ever!" / gogo: "Choo-choo! Hooray!" | 1200 |

#### Segment 8 · All Done, Goodnight (9:15–10:05) · World `home-nook` → `starlight-cloud`

| Beat | Stage | Lines | Hold |
| --- | --- | --- | --- |
| `s8-yawn` · outro · `wide` | `music: null`; `gesture momo yawn`; `sfx yawn`; `object balloon down` | momo: "What a big day. I'm sleepy." | 1000 |
| `s8-alldone` · song · `wide` | `song: allDone` performers all | (`allDone`: "All done, all done, time to wave bye-bye…") | 600 |
| `s8-byes` · outro · `medium` | one wave per line (gesture `wave`) | gogo: "Bye-bye! Choo-choo!" / lulu: "Bye-bye! Boom… boom!" / peeko: "Bye-bye! Peekaboo!" / (sheru `aroo`, soft) | 800 |
| `s8-promise` · outro · `close` | `face momo toward viewer` | momo: "See you soon, in Wonder World." | 1200 |
| `s8-stars` · outro · `high` (world swap → `starlight-cloud`, soft 1.5 s fade) | `music: starlightBed`; `gesture lumi glow`; `song: starlightHum` performers lumi (first 20 s, then fade) | lumi: "Goodnight, friends. Sweet dreams." | 2500 |
| `s8-card` · outro | still frame, offline card (E.6) for 6 s over `starlightHum` fade out | — | 6000 |

PAUSE count: **8** (the requirement is ≥ 6). Songs: 1 new theme, 6 catalogue songs (`trainSong`, `goStop`, `peekaboo`, `colours` partial, `hello`, `allDone`), and `starlightHum` as the calm close. Lines: 102 spoken lines [measured from E.3], all ≤ 9 words (checked by script).

### E.4 New song: "Wonder World" (theme, ~22 s, 6 lines)

Original lyrics and melody, made with the ElevenLabs music endpoint through Prism, paid tier only. A gentle 96 BPM major key, with ukulele, glockenspiel and soft hand drum. The melody is simple enough to hum after one listen. Each lyric line has one motion per performer (the `SongCue` model).

| Line | Lyric | Motion (all performers) | Cue |
| --- | --- | --- | --- |
| 0 | "Over the hill and across the sea," | `sway` | GoGo enters, `whistle` |
| 1 | "there's a little world for you and me." | `point` (toward viewer) | — |
| 2 | "Momo, Lulu, Sheru too," | `wave` | Sheru `wag` |
| 3 | "GoGo, Peeko, Lumi, and you!" | `hop` | — |
| 4 | "Look and play and sing along," | `clap` | flower `bloom` |
| 5 | "Wonder World, Wonder World, come along!" | `cheer` (Lulu: `wave`, late) | — |

Short version: lines 4–5 only (~8 s), for Shorts openers and the end card. Add `wonderTheme` to `SongId`, `src/content/songs.ts` and `provenance/audio/songs.json`.

### E.5 Shot list

| Shot | Time | Camera | Content |
| --- | --- | --- | --- |
| 1 | 0:00 | `high` Meadow | Island establishing shot, slow camera ease |
| 2 | 0:08 | `wide` | Theme song with all six; GoGo arrives |
| 3 | 0:38 | `medium` | Lulu's late wave |
| 4 | 0:50 | `medium` → `close` | Momo's news: "You are our new friend!" |
| 5 | 1:15 | `wide` | Sheru fetch gag ×3 (fixed wide, no cuts during the run) |
| 6 | 1:50 | `close` | "One!" ball bounce |
| 7 | 2:05 | `wide` Station | GoGo pulls in |
| 8 | 2:25 | `left` | Carriage count |
| 9 | 2:45 | `close` | Butterfly, "Excuse me!" |
| 10 | 2:55 | `wide` | `trainSong` loop |
| 11 | 3:25 | `wide` Music Garden | Lulu dancing |
| 12 | 3:45 | `close` | Stomp PAUSE |
| 13 | 4:05 | `wide` | `goStop`, Lulu freezes late |
| 14 | 4:55 | `wide` Barn | Peeko behind the tiny box |
| 15 | 5:15 | `close` | "Where is Peeko?" PAUSE |
| 16 | 5:35 | `wide` | `peekaboo` song, door opens |
| 17 | 5:55 | `close` | Momo under the hat |
| 18 | 6:15 | `wide` Learning Cloud | Lumi floats in |
| 19 | 6:40–7:35 | `close` / `medium` alternate, one change per object | Preview parade: apple, blocks, B, cow, drum, moon |
| 20 | 7:50 | `wide` Home Nook | Party reveal, balloons rise |
| 21 | 8:10 | `wide` | 1-to-5 recap, one object action per number |
| 22 | 8:40 | `medium` | Sheru sponge callback |
| 23 | 8:50 | `wide` | `hello` song, everyone |
| 24 | 9:15 | `wide` | Yawn, `allDone` |
| 25 | 9:40 | `high` Starlight Cloud | Lumi goodnight, end card |

About 25 camera changes in 10 minutes, or 2.5 per minute, which is under the Band 2 limit of 4.

### E.6 Caregiver notes and offline card

- **Offline play card (end card, 6 s):** "All done! Now try… Find five things for a pretend party: a ball, a toy car, a song, a peekaboo game and a star."
- **Caregiver bridge (small type):** "Count the party things on your fingers together: one, two, three, four, five."
- **Captions at each PAUSE:** `[pause: say "go!"]`, `[pause: stomp together]`, `[pause: point to the box]`, `[pause: count the blocks]`, and so on.
- **Description tip:** "At each pause, wait for your child, then answer together. Any answer is a good answer."

### E.7 YouTube metadata

- **Title (52 chars):** `Welcome to Wonder World! 🎈 Count to 5 Party for Kids`
- **Description:**
  ```
  Momo is throwing a welcome party for a new friend: you! Count to five with Sheru, GoGo, Lulu, Peeko and Lumi, sing along, play peekaboo, and get a peek at everything we'll learn together in Wonder World.

  For ages 1–4, best watched together. At each pause, wait for your little one, then answer together.

  0:00 Wonder World song
  0:50 Sheru finds a ball (1)
  2:05 GoGo's train ride (2)
  3:25 Lulu's stomp and freeze song (3)
  4:55 Peekaboo with Peeko (4)
  6:15 Lumi's look-what-I-found (5)
  7:50 The welcome party
  9:15 Bye-bye and goodnight

  Play this story together in the Wonder World app: <app URL>   (description link; MFK disables cards and end screens)
  Calm pacing, no flashing, no loud surprises. Made with care by a dad for his son.
  ```
- **Tags:** toddler learning, counting to 5, preschool songs, peekaboo, kids train song, learn colours, calm kids show, Wonder World
- **Playlists:** "Start here: Wonder World", "Counting with GoGo"
- **Made for kids:** yes (`selfDeclaredMadeForKids: true`)
- **Synthetic content flag:** `containsSyntheticMedia: true`. Animated visuals are exempt, but the episode features AI-generated songs, so it is set for trust (A.2)
- **Thumbnail:** rendered from the `s7-welcome` beat, a `wide` shot with all six characters facing the camera under balloons. Bright meadow palette and warm light. Add the large text "Hello, friend!" in the brand font. No shocked faces, no arrows or circles.

### E.8 New assets and code needed for E01

| Item | Type | How |
| --- | --- | --- |
| `wonderTheme` (full + short) | song | `tools/gen-audio.ts --only songs`, paid tier, provenance record |
| 102 new voice lines (`s01e01.*`) | voice | `tools/gen-audio.ts --only lines`, existing voices |
| `do: "ride"` (one actor rides another's carriage) | stage action | `src/types.ts`, `src/scenes/stage.ts`; until then, move both actors together |
| `hat` falls onto Momo; Momo stays visible | staging | existing `hat` prop + `object fall`; check spot offsets |
| World swap inside one show | runtime | B3.3 |
| Lulu's late freeze (+600 ms) | timing | song cue with an offset field, or a separate beat |
| End card | UI-free still | rendered frame with DOM-free text overlay in `tools/thumbnail.mjs` style |

### E.9 Three Shorts from E01 (9:16)

| Short | Source | Length | Why it works alone |
| --- | --- | --- | --- |
| "Silly Sheru! 🐶" | `s2-wrong-1` → `s2-count-1` | ~35 s | complete joke with a payoff; the child corrects Sheru |
| "Lulu is always late! 🦕" | `s4-late-1` → `s4-late-2` | ~40 s | movement song + running gag; kids copy the freeze |
| "Where's Peeko? 🐣" | `s5-arrive` → `s5-pop` | ~30 s | peekaboo is the most replayable toddler format |

Portrait framing: the six camera presets are 16:9. Shorts need either a portrait set of presets (the stage already handles portrait phones: `spots.test.ts` keeps the core of the stage in frame) or a center crop checked by the on-model gate.

### E.10 Draft `ShowSpec` (segment level)

```ts
// src/content/shows/s01e01-welcome-to-wonder-world.ts (draft; beats per E.3)
export const show: ShowSpec = {
  kind: "show",
  id: "s01e01-welcome-to-wonder-world",
  code: "s01e01",
  version: 1,
  band: "toddler",                       // C.1
  titleKey: "s01e01.title",
  host: "momo",
  targetWords: ["hello", "friend", "ball", "go", "stop", "one", "two", "three", "four", "five", "where", "party", "bye-bye"],
  supportWords: ["uh-oh", "look", "more", "boom", "peekaboo", "star", "cake", "sleepy"],
  pauseMs: 2500,                          // B3.2; beats may override (3000 for counting)
  offlinePlayKey: "s01e01.offline",
  caregiverBridgeKey: "s01e01.bridge",
  chapters: [
    { atSegment: "s1", titleKey: "s01e01.ch.theme" },
    { atSegment: "s2", titleKey: "s01e01.ch.sheru" },
    { atSegment: "s3", titleKey: "s01e01.ch.gogo" },
    { atSegment: "s4", titleKey: "s01e01.ch.lulu" },
    { atSegment: "s5", titleKey: "s01e01.ch.peeko" },
    { atSegment: "s6", titleKey: "s01e01.ch.lumi" },
    { atSegment: "s7", titleKey: "s01e01.ch.party" },
    { atSegment: "s8", titleKey: "s01e01.ch.goodnight" }
  ],
  segments: [
    { id: "s1", template: "hello-wonder-world", world: "meadow",         music: "meadowBed",    transitionIn: "none",
      cast: [{ id: "momo", at: "center" }, { id: "lulu", at: "left" }, { id: "peeko", at: "right" }, { id: "lumi", at: "highRight" }, { id: "gogo", at: "offLeft" }, { id: "sheru", at: "frontLeft" }],
      props: [{ id: "flower", asset: "flower", at: "backLeft" }, { id: "tree", asset: "tree", at: "back" }, { id: "bush", asset: "bush", at: "farRight" }],
      beats: [/* s1-island, s1-theme, s1-late */] },
    { id: "s2", template: "sheru-finds-it",     world: "meadow",         music: "meadowBed",    transitionIn: "cut",
      cast: [{ id: "momo", at: "center" }, { id: "sheru", at: "left" }],
      props: [{ id: "ball", asset: "ball", at: "offRight", hidden: true }, { id: "sponge", asset: "sponge", at: "offRight", hidden: true }, { id: "bubbleWand", asset: "bubbleWand", at: "offRight", hidden: true }],
      beats: [/* s2-hi … s2-next */] },
    { id: "s3", template: "ready-go",           world: "station",        music: "stationBed",   transitionIn: "train",
      cast: [{ id: "gogo", at: "left" }, { id: "momo", at: "front" }, { id: "sheru", at: "frontRight" }],
      props: [{ id: "car1", asset: "gogoCarriage", at: "left" }, { id: "car2", asset: "gogoCarriage", at: "farLeft" }, { id: "car3", asset: "gogoCarriage", at: "offLeft" }, { id: "butterfly", asset: "butterfly", at: "offTop", hidden: true }],
      beats: [/* s3-arrive … s3-tunnel */] },
    { id: "s4", template: "boom-boom-beat",     world: "music-garden",   music: "gardenBed",    transitionIn: "train",
      cast: [{ id: "lulu", at: "center" }, { id: "momo", at: "left" }, { id: "sheru", at: "frontLeft" }],
      props: [{ id: "drum", asset: "drum", at: "right" }, { id: "piano", asset: "toyPiano", at: "back" }],
      beats: [/* s4-hi … s4-next */] },
    { id: "s5", template: "peekaboo",           world: "peekaboo-barn",  music: "barnBed",      transitionIn: "train",
      cast: [{ id: "momo", at: "left" }, { id: "peeko", at: "right" }],
      props: [{ id: "box", asset: "toyBox", at: "right", size: 0.35 }, { id: "door", asset: "door", at: "backLeft" }, { id: "hat", asset: "hat", at: "offTop", hidden: true }],
      beats: [/* s5-arrive … s5-next */] },
    { id: "s6", template: "look-what-i-found",  world: "learning-cloud", music: "cloudBed",     transitionIn: "fade",
      cast: [{ id: "lumi", at: "high" }, { id: "momo", at: "left" }, { id: "peeko", at: "right" }],
      props: [/* apple, toyBlock×3, letterB, cow, drum, moon: hidden at center */],
      beats: [/* s6-hi … s6-go */] },
    { id: "s7", template: "party",              world: "home-nook",      music: "homeBed",      transitionIn: "train",
      cast: [{ id: "momo", at: "center" }, { id: "lulu", at: "left" }, { id: "peeko", at: "right" }, { id: "lumi", at: "highLeft" }, { id: "sheru", at: "frontLeft" }, { id: "gogo", at: "farRight" }],
      props: [/* table, cake, balloon×3, partyHat, ball, sponge(hidden) */],
      beats: [/* s7-ready … s7-thanks */] },
    { id: "s8", template: "all-done-goodnight", world: "home-nook",      music: null,           transitionIn: "none",
      then: { world: "starlight-cloud", music: "starlightBed", transitionIn: "fade" },
      cast: [/* as s7, then lumi only */], props: [],
      beats: [/* s8-yawn … s8-card */] }
  ],
  review: { language: "pending", rights: "pending", reviewer: "pending-human", date: null }
};
```

---

## F. Risks, owner decisions and publishing checklist

### F.1 Risk register

L = likelihood, I = impact (H/M/L).

| # | Risk | L | I | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | **YouTube "inauthentic content" demonetisation**: the channel is judged mass-produced or repetitive AI content | M | H | Original recurring characters and stories, a human reviewer per video, varied stories (C.2), no template-swapped clones, a visible founder story. Keep the generated-to-edited ratio in the manifest as evidence. Do not publish more than the reviewer can actually watch (cap: 3 long + 10 Shorts per week in year 1) |
| R2 | **COPPA/FTC exposure** | L | H | Mark every video made for kids; collect no data from children; no comments; no off-platform child data capture; the app twin keeps its no-account, no-analytics rules (`README.md` safety rules) |
| R3 | **Voice and music licence gaps**: Eleven Music Terms (2026-10-09) prohibit "streaming distribution" on the Starter plan, and all 26 songs + 8 beds are `starter`; TV/SVOD needs Enterprise Music (A.5) | H | H | Ask ElevenLabs in writing whether YouTube uploads count as streaming distribution; if yes or unclear, move to Creator+ and re-render the songs and beds before launch; commission the theme song from a human composer. TTS on paid plans carries a commercial licence. | [measured 2026-11-13] all 1,088 records in `provenance/audio/*.json` (1,012 lines, 26 songs, 8 beds, 42 SFX) show tier `starter` (paid), none free; the `02` §5 "free-tier" warning is stale. Gate B.6 "Rights" keeps it that way. Check the provider terms (§A) and keep a dated copy; move to a tier whose character allowance covers about 4 episodes per month |
| R4 | **Content ID false claims** on generated music | M | M | Keep provenance for every song; register songs with a distributor only after the licence is confirmed; dispute with the provenance record |
| R5 | **Character drift** across generated episodes (personality, catchphrases) | M | M | Character sheets (B3.7) as both generation constraints and validators. Looks cannot drift because the rigs are code. Voices are fixed voice ids and settings |
| R6 | **Name collision: "Momo"** (the 2019 "Momo challenge" hoax; YouTube demonetised all Momo-related videos at the time, A.9 Wikipedia) and **"Wonder World"** (a crowded name) | H | H | A real trademark search and a search-results check **before** launch. Prepare a fallback name for the host and the channel. The rename cost is low before launch: one locale line + voice lines + portraits |
| R7 | **Parent backlash against AI content** | M | M | Lead with the human story; say plainly in the About page that the show is made with AI tools and reviewed by a parent; never use the child's identity |
| R8 | **Under-2 screen-time guidance** conflicts with an "ages 1+" message | H | M | Position Band 1 as co-viewing only, with short videos and caregiver tips (C.1); never claim the videos teach speech |
| R9 | **Efficacy claims** ("teaches your toddler to talk") | M | H | Claim wording locked to "play and early learning, best watched together" (`docs/agents/claims-and-boundaries.md`); the validator scans metadata for banned claims |
| R10 | **Founder's child's privacy** | M | H | `WELCOME_NAME` stripped in broadcast mode (B3.1), with a test. The family-names list in the privacy gate. Never use the child's face, voice or name in any public material |
| R11 | **Render cost overrun** | L | L | Measure in P0; cheapest GPU tier; teardown with zero leftovers per run; a monthly budget alert |
| R12 | **Flash or overstimulation incident** | L | H | B.6 flash gate on every frame; looks have no vignette, no flashing glows, no camera shake (current app rules) |
| R13 | **Bad generated content slips through** (unsafe behaviour shown as a joke) | M | H | Banter rules C.4 #7 in the validator + human review at 1x speed. One-click unpublish procedure |
| R14 | **Accidental public upload**: since 2026-11-02, unverified API projects are no longer forced to private, and an omitted `privacyStatus` defaults to public (A.4) | M | H | `publish-youtube.mjs` always sends `privacyStatus: "private"` + `publishAt` and fails if either is missing; it refuses to run without a signed manifest (F.3) |

### F.2 Owner decisions needed

| # | Decision | Recommended default |
| --- | --- | --- |
| D1 | Make Wonder World videos public (the app stays unlisted/`noindex` until a separate decision) | Yes for the channel; keep the app unlisted until the channel launches, then link it |
| D2 | Final channel and character names after the trademark and search check | Keep the cast names if they clear; otherwise rename Momo first (R6) |
| D3 | Who signs off each video (human reviewer) | The owner for the first 10 videos, then a paid early-childhood reviewer for at least 1 in 5 |
| D4 | ElevenLabs plan: Starter does not permit streaming distribution of music (A.5) | Move to Creator or higher before launch, re-render the 26 songs + 8 beds, and get written confirmation on YouTube and Content ID; consider a human-composed theme song |
| D5 | Launch language set | English at launch; Punjabi in month 2 (the pack exists); Spanish and Hindi in P4 |
| D6 | Weekly cadence in year 1 | 1–2 long + 5 Shorts (D.4) |
| D7 | Founder story on the channel (no child identity) | Yes, in the About page and one parent-facing video |
| D8 | Monetisation | Apply for YPP when eligible; plan for the app and music as the main revenue, not ads |
| D9 | Approve Part B scope, starting with P0 | Yes; P0 is 1–2 weeks and proves the renderer |

### F.3 Go/no-go checklist for the first public upload

Each item is a line in the video's signed manifest (`dist/shows/<id>/manifest.json`). One "no" blocks the upload.

- [ ] Channel name and every character name cleared (trademark search + search-results check)
- [ ] All audio is paid-tier with a provenance record (true today for all 1,088 files), and every song and bed was made on a plan that permits streaming distribution (Creator+ or written ElevenLabs confirmation; A.5)
- [ ] No personal data: no `WELCOME_NAME`, no family names, no child face or voice (B.6 privacy gate)
- [ ] All B.6 QC gates pass (`qc.json` attached)
- [ ] A human reviewer watched the full video at 1x and signed, with name and date
- [ ] Made-for-kids is set to yes, and the synthetic-content setting follows §A
- [ ] Flash-safety pass recorded
- [ ] Captions uploaded (English SRT)
- [ ] Metadata has no efficacy claims (R9) and no child-directed calls to "watch more"
- [ ] Provenance manifest stored: spec hash, audio provenance, model and prompt versions, reviewer, publish date
- [ ] One-click unpublish procedure tested on a private test upload
