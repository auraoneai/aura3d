# Wonder World: master execution prompt

This one prompt builds all of Wonder World (working name "Veer's Wonder World"). It joins every Markdown file in `docs/prds/veer-wonder-world/` into a single job.

**Run it:** from `/Users/gurbakshchahal/platforms/aura3d`, tell your agent `execute docs/prds/veer-wonder-world/MASTER-PROMPT.md`.

---

You are the lead engineer for **Wonder World**, a toddler co-play 3D app on Aura3D 4.5.0, built in `apps/veer-wonder-world/`. It has 6 original characters, 20 animated episodes and 12 interactive activities. Build all of it, update every document, and verify it.

**Use parallel agents (swarms) for all independent work. Do not stop until every task in this file is complete.**

## 0. Owner decisions (2026-10-29)

These override any "needs review" or "needs sign-off" text in the PRD files.

1. **Build everything now.** That means all 6 characters, 20 episodes, 12 activities and 6 worlds, plus all media, all tests and every doc update. P1 and P2 are both in scope. P3 (microphone and voice input, 04 K01-K06) stays out of scope and OFF.
2. **No human sign-off is needed.** Wherever a PRD file asks for SLP, caregiver, creative, rights or legal review, do the review yourself as an agent. Record it in `07-autonomous-decisions-and-build-record.md` and keep going. Story manifests carry `review: { language: "approved", rights: "approved", reviewer: "agent (owner instruction 2026-10-29)", date }`.
3. **Every safety rule still applies in full** (section 6). Agent review replaces the sign-off step. It never relaxes a rule.
4. **Generation spend is authorised.** This covers Meshy (no cap; record each job in the ledger) and the pooled ElevenLabs keys, both through Kiro Prism.
5. **No public release in this run.**
   - The route stays labelled `prototype` and carries `noindex`.
   - Keep it out of the site catalog, sitemap and showcase index. If a repo check insists on registration, register it hidden and log why.
   - Publishing a children's app is a separate owner decision.

## 1. The specification: every file in this folder

Read every file below in full, in this order, before planning. Together they are one specification. The last column shows how each file connects to the others.

| # | File | What it owns | How it connects |
| --- | --- | --- | --- |
| 1 | `README.md` | Product definition; the 9 locked v0 decisions; phases P0 to P3; the first pilot "Momo's Ball Day" (a chapter of E17); the P0 go/no-go list | Index for 01-06 |
| 2 | `01-product-learning-and-safety.md` | The learning loop (model, meaning, pause, response, expansion); word clusters; the six-beat episode blueprint; caregiver role; safety and privacy rules; accessibility and product acceptance | Rules every story in 05 and every screen in 04 E must meet; tested by 06 section 3 |
| 3 | `02-character-and-content-bible.md` | The 6 characters; the world map; visual direction; voice and song direction ("Go / Stop with Lulu", "The Ball Rolls"); animation timing; asset inventory | Characters → 04 D01-D07; worlds → 04 D08-D13; media → 04 D14-D16 |
| 4 | `03-aura3d-architecture-and-contracts.md` | The Aura3D API mapping and app layout; session and episode state machines; `EpisodeSpec`, `BeatSpec` and `ActivitySpec`; narration and audio; assets, touch, localization and storage; the P0 exit list | Built by 04 A-C; tested by 04 J and 06 section 4 |
| 5 | `04-implementation-backlog-by-filename.md` | Every file to create, by task ID: A01-A11, F0.1-F0.6, B01-B12, C01-C08, D01-D16, E01-E08, F01-F06, G01-G03, H01-H14, I01-I09, J01-J16 (K01-K06 out of scope). Also the build order (section L) and per-file definition of done (section M) | The build checklist |
| 6 | `05-episodes-games-and-curriculum.md` | The canonical 20 episodes and 12 games; the E17 golden beat list; pilot beat maps; vocabulary reinforcement; per-story acceptance | The content of 04 F, G, H and I |
| 7 | `06-qa-release-and-execution.md` | Gates G0-G10; test cases QA-E01-E12, QA-A01-A09 and QA-P01-P08; the verification pipeline; device matrix; budgets; evidence package; launch checklists | The definition of "verified" |
| 8 | `07-autonomous-decisions-and-build-record.md` | **Create it.** The decision log and build record for this run | Replaces human sign-offs |

Next, read these repository guides:
- `llms.txt`
- `docs/agents/claims-and-boundaries.md`
- `docs/agents/build-a-game.md`
- `docs/agents/new-game-checklist.md`
- `docs/agents/lessons-learned.md`
- `docs/agents/asset-workflow.md`
- `docs/agents/effects-and-scene-kits.md`
- `docs/api/game-kit.md`
- `docs/api/audio-synth.md`
- `docs/api/qa-kit.md`
- `docs/api/model-loader.md`
- `docs/api/skinned-actors.md`
- `docs/api/auravoice-bridge.md`
- the 4.5.0 section of `CHANGELOG.md`

Then read the owner's machine policy files:
- `/Users/gurbakshchahal/.config/agent-policy/reference/parallelism.md`
- `/Users/gurbakshchahal/.config/agent-policy/reference/remote-execution.md`

## 2. Integrated build map

All paths are under `apps/veer-wonder-world/`.

### Characters (02 section 2 → 04 D)

| Character | File | Motion | Model key |
| --- | --- | --- | --- |
| Momo, small fuzzy purple monster (host) | `src/characters/momo.ts` (D01) | Procedural: bounce, sway, point-lean, squash (the Meshy humanoid rig was rejected; see 07) | `momo` |
| Lulu, mint baby dinosaur (music) | `src/characters/lulu.ts` (D02) | Procedural: dance sway, stomp hop, clap pulses, freeze (rig rejected; see 07) | `lulu` |
| Sheru, cartoon puppy (barks, never speaks) | `src/characters/sheru.ts` (D03) | Procedural: walk bob, wag, sniff, carry | `sheru` |
| Peeko, round chick (renamed from Pip) | `src/characters/peeko.ts` (D04) | Procedural: hop, hide, pop up | `peeko` |
| Lumi, warm yellow star | `src/characters/lumi.ts` (D05) | Procedural: float, soft glow that never flashes | `lumi` |
| GoGo, red toy train | `src/characters/gogo.ts` (D06) | Procedural: wheels, doors, carriage | `gogo`, `gogoCarriage` |

The registry is `src/characters/character-registry.ts` (D07).

### Worlds (02 section 3 → 04 D08-D13)

| World | File | Task |
| --- | --- | --- |
| Momo Meadow | `src/scenes/meadow.ts` | D08 |
| Lulu Music Garden | `music-garden.ts` | D09 |
| Home Nook | `home-nook.ts` | D10 |
| GoGo Station | `station.ts` | D11 |
| Peeko Peekaboo Barn | `peekaboo-barn.ts` | D12 |
| Lumi Learning Cloud | `learning-cloud.ts` | D13 |

The shared look file is `src/scenes/looks.ts` (A10).

### Episodes (05 section 2 → 04 F and H)

Each episode is `src/content/episodes/<slug>.ts` plus `src/localization/en/episodes/<slug>.ts`.

| # | Title | Phase | Slug | Task | Host | Core words |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | Momo's Magic Mouth | P1 | `momo-magic-mouth` | F01 | Momo | ah, oh, mmm (more) |
| E02 | The Peekaboo Palace | P1 | `peekaboo-palace` | F02 | Peeko + Momo | open, hi, bye |
| E03 | The Alphabet Zoo | P2 | `alphabet-zoo` | H01 | Lumi + Peeko | B, ball, bear |
| E04 | GoGo's ABC Train | P2 | `gogo-abc-train` | H02 | GoGo | A, apple, go |
| E05 | Momo's Counting Cookies | P1 | `counting-cookies` | F06 | Momo | one, two, three, cookie |
| E06 | Lulu's Dino Dance Party | P1 | `lulu-dino-dance` | F05 | Lulu | clap, go, stop (stomp) |
| E07 | The Magic Colour Machine | P2 | `magic-colour-machine` | H03 | Momo + Lumi | red, blue, ball |
| E08 | Where's Sheru? | P2 | `wheres-sheru` | H04 | Sheru + Momo | where, under, there |
| E09 | Baby Animal Orchestra | P1 | `baby-animal-orchestra` | F03 | Lulu + animals | moo, baa, quack, woof |
| E10 | Momo's Hungry Belly | P2 | `momos-hungry-belly` | H05 | Momo | apple, banana, eat |
| E11 | Number Balloon Rescue | P2 | `number-balloon-rescue` | H06 | Lulu + Lumi | one, two, three, up/down |
| E12 | The Magic Shape Bakery | P2 | `magic-shape-bakery` | H07 | Momo + Lumi | circle, square, triangle |
| E13 | The Silly Robot Factory | P2 | `silly-robot-factory` | H08 | Momo + baby robot | hat, feet, hands, help |
| E14 | The Lost Teddy Adventure | P2 | `lost-teddy-adventure` | H09 | Momo + Peeko | teddy, look, find |
| E15 | Momo's Bubble Universe | P2 | `momo-bubble-universe` | H10 | Momo | bubble, pop, more |
| E16 | The Little Birthday Party | P2 | `little-birthday-party` | H11 | Lulu + Momo | cake, one, blow |
| E17 | Sheru's Big Adventure (golden slice) | P1 | `sheru-big-adventure` | F04 | Sheru + Momo | ball, go, more |
| E18 | Who's at the Door? | P2 | `whos-at-the-door` | H12 | Peeko + Momo | hi, bye |
| E19 | Momo's Day | P2 | `momos-day` | H13 | Momo | wash, eat, sleep |
| E20 | The Little Story Machine | P2 | `little-story-machine` | H14 | Momo + Lumi | two nouns + one action per variant |

### Activities (05 section 3 → 04 G and I)

Each activity is `src/content/activities/<slug>.ts` plus `src/localization/en/activities/<slug>.ts`.

| # | Title | Phase | Slug | Task | Core words |
| --- | --- | --- | --- | --- | --- |
| G01 | Bubble Garden | P1 | `bubble-garden` | G01 | bubble, pop, more |
| G02 | Go-Go Train | P1 | `gogo-train` | G02 | go, stop, in, bye |
| G03 | Sheru's Ball Game (golden slice) | P1 | `sheru-ball` | G03 | ball, go, more, hi |
| G04 | Peekaboo Animal Barn | P2 | `peekaboo-animal-barn` | I01 | open, hi, animal names and sounds |
| G05 | Teddy's Snack Picnic | P2 | `teddy-snack-picnic` | I02 | apple, banana, eat, more, all done |
| G06 | Splashy Car Wash | P2 | `splashy-car-wash` | I03 | wash, wet, dry, car |
| G07 | The Little Lift | P2 | `little-lift` | I04 | in, out, up, down, open |
| G08 | Build and Tumble | P2 | `build-and-tumble` | I05 | one more, up, down, block |
| G09 | Family Doorbells | P2 | `family-doorbells` | I06 | hi, bye, door (generic friends only) |
| G10 | Bear's Little Band | P2 | `bears-little-band` | I07 | boom, clap, my turn, your turn |
| G11 | Magic Sound Garden | P2, tap only | `magic-sound-garden` | I08 | hello, open, flower |
| G12 | Find My Real Toy | P2 | `find-my-real-toy` | I09 | find, object name, there |

### Runtime, UI and QA

Everything else is the file list in 04:
- bootstrap: A01-A11
- runtime: B01-B12
- content core: C01-C08
- parent and child UI: E01-E08
- media: D14-D16
- tests and evidence: J01-J16

## 3. Doc corrections (all checked against 4.5.0)

Update the PRD files with the targeted edits below. Keep the product intent and the existing structure.

1. **Version.** The PRD was written against 4.1.2. Replace "4.1.2", "4.1.3 unreleased" and "stock Vite defect" with: pin 4.5.0 (npm latest). The stock Vite build fix shipped in 4.1.3 (see the CHANGELOG). Inside the monorepo the app uses `workspace:*` dependencies. These statements appear in:
   - the README "What exists" list and the P0 checklist
   - 03 section 1 and section 10
   - 04 F0.2
   - the 06 section 4 version guard
2. **Build commands.**
   - `apps/*` is not a pnpm workspace member: `pnpm-workspace.yaml` lists only `packages/*` and `workers/*`. Replace `pnpm --filter <app>` with root-level commands (section 8).
   - `check-deploy` uses `@aura3d/cli` 4.5.0 and, with `--browser`, runs on the remote runner only.
   - The remote runner stages the app with `EXTRA_DIRS="apps/veer-wonder-world" tools/remote-acr/run.sh`.
   - For real-GPU desktop capture, add a scenario to `tools/real-gpu/scenarios.json`.
3. **Rendering** (02 section 4, 04 A10, and the file name `looks.ts`, not `look.ts`):
   - The default `effects.vignette` still darkens frames. The linear-light vignette is opt-in only (`?linearvig=1` or `__A3D_LINEAR_VIGNETTE__`; see `linearVignetteEnabled` in `packages/rendering/src/webgl2/LegacyPost.ts`). Use no vignette at all.
   - Since 4.5.0, a scene with only authored lights gets no implicit environment fill. Every world therefore needs a look preset with an HDRI or an `environments.*` node.
   - `quality: "auto"` picks a direct render path for plain scenes. Check which one ran in `app.diagnostics().renderPath`.
   - Turn runtime particle effects off and build bubbles as meshes.
   - Call `await warmPrograms(app)` (from `@aura3d/engine/game`) before the first frame.
4. **Audio** (03 section 4).
   - `AudioContextManager` is a plain class, not a global.
   - `createGame` makes its own context unless it gets `sound: { browserContext: false, createContext: () => mgr.context }`. `createCueBank` makes its own unless it gets `{ manager }`. Use one shared manager.
   - Recorded narration is an app-owned player on that shared context. `GameAudio` cues add pitch and gain jitter and give no end-of-playback signal, so they are not used for voice.
5. **API table** (03 section 1):
   - The `createGame` session states match the PRD.
   - No touch preset fits "tap a big object", so taps are pointer events plus `raycast`.
   - `TypedGLBActor` is a type only. Get instances with `cloneSkinned` and draw them with `attachRootRenderSource`.
   - Import `AnimationController` from the root `@aura3d/engine`.
   - `installSafetyNet` and `installBlackFrameGuard` come from `@aura3d/debug`, a separate dependency.
   - The QA kit imports from the root `@aura3d/engine`.
6. **Rigs and mouths** (02, 03 section 5, 04 D).
   - Meshy rigging is humanoid only. It was tried on Lulu and rejected: `aura3d assets validate --skin` fails in every clip (895-1465 of 12,356 triangles stretch past 1.6x), and after baking the armature scale (`tools/bake-armature-scale.mjs`) and `repair-skin --refit-skeleton` the worst stretch is 142.9x.
   - Every character, animal and prop therefore moves procedurally (hop, sway, squash-stretch, wag, roll, float).
   - Generated models have no mouth morphs. "Talking" is a squash-and-bob pulse while the line plays, and it is never called lip sync.
7. **Rename Pip to Peeko everywhere.** That includes the cast table, "Peeko Peekaboo Barn", the D04 file name, and episodes E02, E03, E14 and E18. Reason: Pip is the hero of the live game *Pip's Big Leap* (`tools/site/games.catalog.json`).
8. **Scope and gates.** Apply the owner decisions in section 0 to:
   - the README phases
   - the 06 gates "Status" column (G8 becomes "agent review, owner instruction")
   - 04 section L

   Do not delete any safety rule.
9. **Media sources.**
   - Models: Meshy text-to-3D through Kiro Prism.
   - Voices, songs, music beds and sound effects: ElevenLabs through Kiro Prism.
   - Keep a rights record for every file. Output from free-tier keys is prototype-only and must be re-rendered on a paid tier before any commercial release.
10. **Required reading.** Add these to the README engineering start prompt and to 06 sections 4 and 11:
    - `new-game-checklist.md`
    - `lessons-learned.md`
    - `docs/api/auravoice-bridge.md`
    - `docs/agents/effects-and-scene-kits.md`
    - `node tools/game-checks/run.mjs <slug>`
    - `warmPrograms`, `createFixedStepPresenter` and `runMotionGate`

    Also mention the `create-aura3d` `episode-builder` template in F0.1.
11. **The P3 voice doc.** 04 K05's planned voice-validation doc becomes `08-optional-voice-validation.md`, because 07 is now the decision record.
12. **Outside the PRD.** `docs/agents/troubleshooting.md` line 79 says the 4.3.0 vignette fix is in effect. Correct it: the fix is opt-in, and the default vignette still darkens.

## 4. Where to work and what already exists

**Location.** Never pull or switch branches in the main checkout; it is shared with other sessions and about 60 worktrees. Work in the existing worktree `.claude/worktrees/wonder-world`, on branch `feat/wonder-world-foundation-20261029`, which was cut from origin/main `31f8945ad`. Set it up like this:
1. Run `git fetch` and merge any newer origin/main into the branch.
2. Run `pnpm install --frozen-lockfile` in the worktree. Other worktrees keep their own `node_modules`.

If the worktree is gone, recreate it from origin/main.

**Partial work from an earlier run.** It is uncommitted and unreviewed. Treat it as a draft: keep what is correct and fix or rewrite the rest.
- About 40 files in `apps/veer-wonder-world/`:
  - the shared contract `src/types.ts`
  - parts of the runtime, audio and UI
  - 7 episode files
  - generators: `tools/gen-aura-assets.mjs`, `tools/gen-audio.ts`, `tools/gen-audio-manifest.mjs` and `tools/meshy-pipeline.mjs`
  - `tools/wonder-assets.json`, the list of all 59 models with prompts and heights
- Partial edits to `README.md` and `02-character-and-content-bible.md`. Diff them against origin/main before continuing.

**Generated models.** Raw Meshy output lives in `artifacts/meshy/wonder-world/<key>/` (gitignored). Admitted models live in `apps/veer-wonder-world/src/assets/models/<key>.<sha8>.glb`, with provenance in `apps/veer-wonder-world/provenance/models/<key>.json`; audio lives in `src/assets/audio/**` with provenance in `provenance/audio/*.json`. URLs are module-relative (`new URL("./assets/...", import.meta.url)`), because the repo dev server only maps `/aura-assets/` to the root `public/` tree. The visual review of every model is recorded in `tools/model-review.json`; rejected versions are kept in `artifacts/meshy/wonder-world/_rejected/`.
- Each folder has a `state.json` listing the finished steps and their task IDs, plus a `rights.json`.
- Resume with `node apps/veer-wonder-world/tools/meshy-pipeline.mjs`. It waits on existing task IDs instead of paying twice.
- Meshy deletes task outputs after about 3 days, so finish the pending downloads first.
- Look at each model's thumbnail before admitting it. The first `ball` came out looking like a face; regenerate it with a sharper prompt.

## 5. Parallel execution (required)

Follow `parallelism.md`.

**Wave 0 (parent, short).** Set up the worktree. Review and freeze the contract `src/types.ts`, the asset key list and the line-key scheme (`e01`-`e20` and `g01`-`g12` prefixes). Write the checklist from step 9.

**Wave 1.** Launch all of these units at once, each with disjoint file ownership:

| Unit | Owns |
| --- | --- |
| Docs | `docs/prds/veer-wonder-world/*.md` (01-07, README) and `docs/agents/troubleshooting.md` |
| Runtime | `src/runtime/` episode-director, beat-runner, turn-taking, touch-router, session-gate, feature-flags, locale; J01-J03 |
| Audio runtime | `src/runtime/narration-player.ts`, `audio-mixer.ts`; J04 |
| Content core | `src/content/` schema, catalog, words, letters, numbers, songs, sfx, music; `src/localization/` aggregators, `ui.ts`, and `pa.ts` (present but disabled); `tools/validate-wonder-world-content.mjs`; J05, J06, J14 |
| Stage | `src/scenes/**`, `src/characters/**`, `src/runtime/animation-director.ts`, `asset-preloader.ts` |
| UI | `index.html`, `src/ui/**` |
| Episodes ×4 | E01-E05, E06-E10, E11-E15, E16-E20 (story file plus locale file each) |
| Activities ×2 | G01-G06, G07-G12 |
| Models | Finish generation, review every thumbnail (`tools/model-review.json`), admit with `tools/admit-models.mjs` into `src/assets/models/` with sha256 and provenance, regenerate `src/aura-assets.ts`; D14-D16 |

**Wave 2.** Start each unit as soon as its inputs exist:
- **Audio media.** Needs the final line text. Covers voice lines, songs, music beds and sound effects in `public/audio/**`, with provenance, plus `src/content/audio-manifest.ts`.
- **App shell and QA.**
  - `src/main.ts`, `src/app.ts`, `src/qa/install-hooks.ts` and `vite.config.ts` (extend the root config the way `apps/showcase-pips-big-leap` does)
  - `README.md` and `DEPLOYMENT.md`
  - the privacy test J07
  - the remote browser specs J08-J13

**Wave 3 (parent).** Integrate, run section 8, fix what fails, collect evidence, write the build record, commit and open the PR.

**Rules for every unit:**
- Give each child the contract, its exact file list, the rules in section 6 and the verify commands.
- Children never edit files they do not own, and never commit. The parent integrates and owns git.
- Split a large unit further when that helps, up to 3 levels.
- Each unit gets one build pass and one defect-review pass. No open-ended review loops.

## 6. Hard rules (from 01, 02, 03, 06 and the repo)

**Child safety**
- No microphone and no speech recognition.
- No scoring of speech or pronunciation.
- No "wrong", "try again", "say it" or "repeat after me".
- Silence and zero input always complete the story.
- At most two tap targets at a time, and every target is large.
- No autoplay of the next episode, no streaks, ads, purchases, social features or leaderboards.
- No flashing, strobe, camera shake, startling sounds or frightening scenes.
- Every story ends finitely with an offline-play card, and "All done" works at any moment.

**Teaching accuracy**
- Letters keep the name and the sound apart ("B. Bee. B says /b/, like ball"), one letter per episode.
- Counting goes 1 to 3 only, with exactly one visible object per spoken number.
- E05's Momo must not imitate any existing cookie character.
- E16 uses an original birthday tune, not "Happy Birthday".
- E18 and G09 use generic friends, never family voices or names.

**Privacy**
- No child name, photo, voice or identity anywhere: not in source, builds, logs, URLs, screenshots or evidence.
- Parent settings stay on the device and can be cleared.
- No third-party analytics.
- The public title is "Wonder World".

**Claims.** This is play and language exposure, not therapy. Make no efficacy claims, and keep the `prototype` label until the 06 evidence passes on real devices.

**Aura3D usage**
- `createGame` comes only from `@aura3d/engine/game`.
- Models are typed, same-origin GLBs with sha256 and provenance, each with a primitive stand-in when it is missing or `?models=0` is set.
- One shared `AudioContextManager`.
- An HDRI or `environments.*` look in every world.
- No `effects.vignette`.
- Runtime effects off.
- `warmPrograms(app)` before the first frame.
- Taps are pointer events plus raycast.
- No `three` imports, no `as any`, no raw GLB URLs.

**Determinism.** No `Math.random`, `Date.now` or `performance.now` in pure runtime or content code; pass time in.

**Fonts.** Use the licensed Graphik through `/fonts/local.css`, weights 400, 500 and 600.

**Execution**
- No local Docker, no local Playwright or browsers, and no monorepo-wide builds on the Mac.
- Browser specs and `check-deploy --browser` run through `tools/remote-acr/run.sh` (serverless ACR on `az-auraone-gurbaksh`).
- Delete any temporary cloud resource when you are done.

## 7. Media production (all through Kiro Prism; never print `PRISM_API_KEY`)

### Meshy models

Set these in the process environment:
- `MESHY_API_KEY=$PRISM_API_KEY`
- `MESHY_BASE_URL_V1=https://prism.auraone.ai/v1/meshy/openapi/v1`
- `MESHY_BASE_URL_V2=https://prism.auraone.ai/v1/meshy/openapi/v2`

A `503 quota_exhausted` reply means Prism picked a spent key. Wait about 15 seconds and retry. Record every job with `aura3d meshy ledger reserve/settle --game wonder-world`.

Steps:
1. Preview, then refine at 2k, then remesh. `tools/meshy-pipeline.mjs` runs this chain and downloads each refine thumbnail.
2. Look at every thumbnail. Record approve, reject or a tint (glTF `baseColorFactor` for near-white generations) in `tools/model-review.json`. To regenerate a rejected model, move its folder to `_rejected/` and rerun the pipeline with a sharper prompt.
3. `node tools/admit-models.mjs` (needs `npm install --no-package-lock` in `tools/asset-optimize`). It runs `aura3d assets optimize` (1024 px textures for the main cast, 512 px for the rest), applies the tint, strips normal and roughness maps outside the main cast, stamps `asset.extras.aura3d.orientation`, inspects the model, copies it with its sha256 name, writes provenance and regenerates `src/aura-assets.ts`.

### Audio

ElevenLabs through Kiro Prism. Every endpoint below sits under `https://prism.auraone.ai/v1/voice/elevenlabs` and takes `Authorization: Bearer $PRISM_API_KEY`:
- voice lines: `/v1/text-to-speech/<voice_id>`
- songs and music beds: `/v1/music`
- sound effects: `/v1/sound-generation`

Voices (ElevenLabs premade):

| Role | Voice | Voice ID |
| --- | --- | --- |
| Narrator | Bella | `hpp4J3VqNfWAUOO0d1Us` |
| Momo | Will | `bIHbv24MWmeRgasZH58o` |
| Lulu | Laura | `FGY2WhTYpPnrIDTdsKH5` |
| Lumi | Matilda | `XrExE9yKIg1WjnnlVkGX` |
| Peeko | Jessica | `cgSgspJ2msm6clMCkdW9` |
| GoGo | Liam | `TX3LPaxmHKxFdv7VOQHJ` |
| Baby robot | Callum | `N2lVS1w4EtoT3dr4eOWO` |

Sheru only barks (sound effects).

Run `tools/gen-audio.ts` (with `./node_modules/.bin/tsx` from the app directory), then `tools/gen-audio-manifest.mjs`, which uses ffprobe for durations and sha256 for hashes. Output goes to `src/assets/audio/**` and `provenance/audio/*.json`. For each file, record the provider, voice, prompt, Prism key ID and key tier.

## 8. Verification (all of it must pass)

From the worktree root:

```bash
pnpm exec tsc -p apps/veer-wonder-world/tsconfig.json --noEmit           # strict, workspace sources
(cd apps/veer-wonder-world && ../../node_modules/.bin/vitest run --config vitest.config.ts)   # J01-J07 + content tests (reuse root vitest aliases so @aura3d/* resolves to packages/*/src)
node apps/veer-wonder-world/tools/validate-wonder-world-content.mjs      # J14: every story, line, word, asset and rights reference
node apps/veer-wonder-world/tools/gen-aura-assets.mjs && node apps/veer-wonder-world/tools/gen-audio-manifest.mjs && git diff --exit-code apps/veer-wonder-world/src
node tools/game-checks/run.mjs veer-wonder-world
# remote only:
EXTRA_DIRS="apps/veer-wonder-world" SPECS="tests/browser/wonder-world-*.spec.ts" tools/remote-acr/run.sh   # J08-J13
# plus `aura3d check-deploy --dist <built dist> --browser --route /` on the remote runner
```

**Evidence** goes in `evidence/veer-wonder-world/{p0,p1,p2}/`. Record:
- the commit SHA and engine version
- the viewport and renderer string
- the known gaps

Never include a real child's image or audio. Software WebGL2 results are not real-GPU or device evidence; say so wherever they appear.

## 9. Do not stop until everything is done

1. Before the first wave, list every `- [ ]` item and every task ID in files 01-06, every row of section 2, and every correction in section 3. That list is the definition of done.
2. Keep working across as many turns, waves and context compactions as it takes until each item is done and backed by evidence: a path, a passing command or a capture.
   - Never end early.
   - Never summarise and stop.
   - Never ask whether to continue.
   - After a context compaction, re-read this file and 07 and keep going.
3. Do not ask the owner questions. Settle ambiguity from these files, the repo conventions, `git log` and the tests, and record the decision in 07.
4. Every 10 minutes, post a short status update that does not wait for an answer:
   - percent complete against the list
   - what finished since the last update
   - what is running now and what comes next

   Report code completion and acceptance as separate numbers.
5. An agent cannot do two things, and they are the only items allowed to remain open. Record each in 07 with exact steps:
   - test runs on physical devices (iPad, iPhone, Android)
   - the owner's decision to publish publicly

   Everything else must be finished. If something fails, fix it. If it truly cannot be done, name it, give the reason with the command output, and finish all the rest.
6. Finish this way:
   - Update 07 with the build record: what was built, model and audio counts, test results, the remote run ID and the open acceptance items.
   - Tick every checklist box that now has evidence.
   - Make atomic Conventional Commits on the feature branch.
   - Open a PR listing the completed task IDs, the verification output and the open items. Do not merge it.
   - Write a final report that says plainly what is done and verified, what is done but unverified, and what remains.
