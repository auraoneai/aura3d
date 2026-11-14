# PRD 02 — Original Characters, World, Animation, Songs and Content Bible
Status: **IN BUILD (73 sculpted procedural `@aura3d/engine` stage rigs, 7 data-driven cast character sheets, timed jaw/beak viseme sync, and paid-tier ElevenLabs audio via Kiro Prism)** · Owner: art/animation + audio + educational script · Related: [`05 episodes`](05-episodes-games-and-curriculum.md), [`03 technical`](03-aura3d-architecture-and-contracts.md), [`09 episode engine & channel`](09-autonomous-episode-engine-and-channel-plan.md)

## 1. The central creative hypothesis
Create a **small, familiar cast** whom a child can recognize instantly and enjoy across different formats: watching, singing, tap-and-play and physical imitation. The characters' personalities are storytelling mechanisms, not noise machines. Their expressions orient attention to a word/object/action; music encourages movements; humour yields natural repetition. Avoid hyperstimulating editing or rewards that exist only to extend viewing.

### Brand and character constraints
- Every character is original and designed from a new brief. Do not imitate named shows, identifiable characters, their typography, voices, scripts, musical motifs, or trade dress.
- Design and name candidates remain provisional pending trademark search, creative review and rights clearance. Family-related names/images used internally are not public-domain assets. For this build an agent name check and creative review stand in (`07` section 2); a real trademark search is still required before any public release.
- All characters have friendly, non-threatening silhouettes, readable faces at mobile scale, no sharp teeth/fearful behaviour or exaggerated startling reactions.
- Face visible when speaking, using warm stylized cartoon mouth articulation with zero claim of clinically accurate articulatory or speech-therapy modelling. Every speaking character is a sculpted procedural rig (`src/scenes/procedural-rigs/`) with an articulated `jaw` or `beakLower` sub-part (plus `cheekPuff`, `eyelidL` / `eyelidR`, and gentle head/body talk motion) driven by ElevenLabs character-alignment viseme tracks (`/with-timestamps`) with an automatic 20 Hz RMS speech-envelope fallback, resting closed during silence.
- One speaking character at a time. Silence and musical rests are part of the design.

## 2. Character bible / cast table

Each recurring cast member is canonically defined in a structured JSON sheet under `src/characters/sheets/<id>.json` and compiled to `src/characters/generated-cast.ts` via `node tools/gen-cast.mjs` (`09` B3.7).

| ID | Character | Physical and personality brief | Voice / repeated phrase | Language job | Animation & rig essentials | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| `momo` | **Momo** — warm fuzzy purple-berry bear/monster host (`#8E6CD8`), round body, wide cabochon eyes, soft paws | Curious, silly, warm host; visibly points and waits rather than constantly asking questions | Friendly warm narrator; “Uh-oh!”, “Look!”, “More?” | Early object/action names, social turns, story setup and resolution | Sculpted procedural rig (`cast-rigs.ts`): articulated `body`, `head`, `eyelidL`/`R`, `jaw`, `cheekPuff`, `earL`/`R`, `armL`/`R`, `footL`/`R`; idle bob, bounce, point, wave, calm surprise, timed `jaw` viseme sync | P1 |
| `lulu` | **Lulu** — rounded mint-green mini dinosaur/lop-eared friend (`#7ED6AE`), big safe feet and playful tail | Joyful rhythm leader, slow stomp / clap, comically half a beat late and delighted about it | Tuneful, rhythmic, clear; “Boom boom!”, “La la la!” | Songs, imitation, animal/silly sounds, stop/go, body actions | Sculpted procedural rig (`cast-rigs.ts`): articulated `body`, `head`, `eyelidL`/`R`, `jaw`, `cheekPuff`, `armL`/`R`, `footL`/`R`, `tail`; dance sway, stomp hop, clap, freeze, timed `jaw` viseme sync | P1 |
| `sheru` | **Sheru** — original stylized golden puppy cartoon (`#EAD3A8`), gentle floppy ears and wagging tail | Playful, cuddly, responsive; brings a silly wrong object first before fetching the right one | Friendly barks (`woof` SFX bank only; `speaks: false`) | Ball, go, more, under, find; personal connection and turn-taking | Sculpted procedural rig (`cast-rigs.ts`): articulated `body`, `head`, `eyelidL`/`R`, `jaw`, `earL`/`R`, `legFL`/`FR`/`BL`/`BR`, `tail`; hop, trot/run, sit, tail wag, sniff, carry props; never speaks words | P1 |
| `gogo` | **GoGo** — chunky bright red toy steam engine (`#E2483D`) with friendly cab face, brass funnel and rolling wheels | Excited, ultra-polite helper who says “Excuse me!” even to butterflies and stops gently | Energetic clear voice; “Choo-choo! Ready... go!”, “Stop! Excuse me!” | Movement, numbers, in/out, vehicles, simple sequencing | Sculpted procedural rig (`cast-rigs.ts`): articulated `body`, `jaw`, `eyelidL`/`R`, `cheekPuff`, `wheelFL`/`FR`/`BL`/`BR`, `funnel` + `gogoCarriage`; drive/brake tweens, wheel roll, funnel puff, timed `jaw` sync | P2 (built) |
| `lumi` | **Lumi** — warm starlight yellow five-point star friend (`#FFD34D`); calm non-flashing glow | Soft spoken and curious; gently reveals concrete objects without ever saying “wrong” | Gentle warm guide; “Look what I found!”, “Twinkle, twinkle.” | Letters with objects, quantities, shapes, colours, calm bedtime | Sculpted procedural rig (`cast-rigs.ts`): articulated `body`, `eyelidL`/`R`, `jaw`, `cheekPuff`, `pointTop`, `pointL`/`R`, `pointBL`/`BR`; float, twinkle, conjure spin, timed `jaw` viseme sync | P2 (built) |
| `peeko` | **Peeko** — round sunny-yellow little chick (`#FFE15A`) with soft crest tuft, orange beak and tiny wings (renamed from Pip) | Loves peekaboo and hiding in plain sight behind tiny props; never frightening | Bright playful voice; “Peekaboo!”, “Here I am!”, “You can't see me!” | Greetings, open/close, where, in/on/under, animal sounds | Sculpted procedural rig (`cast-rigs.ts`): articulated `body`, `eyelidL`/`R`, `beakUpper`, `beakLower`, `cheekPuff`, `crest`, `wingL`/`R`, `footL`/`R`; hide, pop-up peek, wing flap, timed `beakLower` viseme sync | P2 (built) |
| `tiko` | **Tiko** — gentle sea-green little turtle (`#5bbf9a`) with patterned amber-terracotta hexagonal scute shell, cream plastron, rosy felt cheeks and warm neckerchief | Unhurried counter and careful observer; counts every step out loud and notices the tiny detail others walked past; never snaps, hides from fear, or scolds fast friends | Calm, unhurried child-friendly voice; “Slow and steady!”, “Let's look closely.”, “One... two... three!” | Numbers, shapes, positions, patience; unhurried foil to Lulu's early beat and Momo's party sorting | Sculpted procedural rig (`tiko-rig.ts`): 11 articulated sub-parts (`body`, `head`, `eyelidL`/`R`, `jaw`, `cheekPuff`, `armL`/`R`, `footL`/`R`, `tail`), `SHARED_GESTURES` + count/peek/wave poses, timed `jaw` viseme sync | P3 (built) |

**Procedural rig architecture & data-driven cast decision (supersedes 2026-10-29 Meshy static-GLB note).** During initial prototyping on 2026-10-29, Meshy text-to-3D GLBs and auto-rigging were evaluated and retired: `aura3d assets validate --skin` rejected humanoid auto-rigging (severe triangle stretch), static GLBs lacked mouth/eyelid/wheel joints, and vehicle/building meshes carried orientation and palette deviations. Wonder World now builds **all 73 stage assets (`MODEL_KEYS`) exclusively as original multi-lobe sculpted procedural `@aura3d/engine` rigs** in `src/scenes/procedural-rigs/` (`cast-rigs.ts`, `tiko-rig.ts`, animal rigs, props, and landmarks) — shipping **zero external `.glb` files** (`MODEL_RIGHTS = []`, 73 `PROCEDURAL_RIGHTS` records). Every cast rig is constructed from organic lathes, curved limbs, 4-layer cabochon eyes, and tactile material crafts (`plush`, `felt`, `wood`, `clay`, `lacquer`) within strict draw-call (`<= 12` interactive draws) and geometry budgets (`spots.test.ts`), and driven deterministically per sub-part by `src/scenes/articulated-actors.ts`. Cast metadata (display name, species brief, home world, badge colour, ElevenLabs voice ID and synthesis parameters, banter role/catchphrases/foils/banned behaviours, and rig traits) lives in `src/characters/sheets/*.json` and compiles cleanly via `node tools/gen-cast.mjs` into `src/characters/generated-cast.ts`.

Character approval deliverables per character (agent review records stand in for human approval in this prototype):
- [x] Turnaround 3D concept sheet (front/side/back), mobile silhouette test at 320 CSS px. Done: `tests/browser/wonder-world-characters*.spec.ts` (remote runner) and `tests/unit/stage/spots.test.ts` verify grounded `y = 0` bounds, unit-height normalization, craft diversity (`>= 3` crafts), and readable silhouettes at 320 × 568 CSS px across the cast.
- [x] Facial expression & articulated pose set: neutral (`idle`), delighted (`happy`), curious (`look`), calm `surprise`, held `wait`, and `wave`, with zero distressed or angry exaggeration. Done: `character-registry.test.ts` and `character-sheets-and-tiko.test.ts` verify calm `surprise` (returns to rest), held `wait`, reduced-motion calm variants, blink eyelids (`eyelidL`/`eyelidR`), and sub-part pose drivers across all 7 cast members.
- [x] Complete procedural gesture coverage per character. Done: every character profile resolves all `GESTURES` via custom gestures plus `SHARED_GESTURES` (`src/characters/character-registry.ts`, `character-registry.test.ts`, `character-sheets-and-tiko.test.ts`), with `procedural: true` for all 73 keys in `src/aura-assets.ts`.
- [x] Readable speech articulation (`jaw` / `beakLower` timed visemes + 20 Hz RMS fallback + gentle body talk motion; no clinical phonetics claim). Done: `speechSubParts` in `src/scenes/articulated-actors.ts` opens `jaw` (bipeds, GoGo, Lumi, Tiko) or `beakLower` (Peeko) in sync with ElevenLabs character-alignment viseme cues or the 20 Hz RMS speech envelope while keeping mouths closed at rest (`character-registry.test.ts`, `character-sheets-and-tiko.test.ts`).
- [x] Short approved voice lines / non-speaking bark bank (`<= 9` words per Band 2 rule). Done: Sheru uses only the 9-sound bark SFX bank (`speaks: false`), and every speaking character's catchphrases and episode lines are validated for word-count, safety, and paid-tier audio provenance (`content-schema.test.ts`, `character-sheets-and-tiko.test.ts`).
- [x] Build-verified procedural & portrait provenance. Done: all 73 procedural stage assets (`PROCEDURAL_RIGHTS`), 4 Poly Haven CC0 look HDRIs (`ENVIRONMENT_RIGHTS`), rendered character portraits (`PORTRAIT_RIGHTS`), and paid-tier audio files (`AUDIO_RIGHTS`) are tracked in `src/assets/rights-manifest.ts` (`tools/gen-rights-manifest.mjs`).
- [x] Fixed child-review camera framing and low-motion animation pass. Done: fixed camera presets (`spots.test.ts`) and reduced-motion attenuation (`character-registry.test.ts`, `wonder-world-low-motion.spec.ts`).
- [x] Originality, licensing, naming/trademark review. Done: agent originality and repo collision checks (`07` §2.3, §2.6; `tools/gen-cast.mjs` privacy and schema guards); external legal trademark search remains a pre-release gate (`07` §4.3).

## 3. Shared setting / world map
A miniature 3D toy island, not an explorable open world. Camera remains framed; select a place from a calm visual home screen (or transition cleanly across worlds inside a multi-segment `ShowSpec` episode, `09` B3.3):
1. **Momo Meadow** (`meadow`) — soft grass, bubble flowers, a small ball and a friendly hill; hosts first words, bubbles and fetch.
2. **Lulu Music Garden** (`music-garden`) — drums, oversized piano keys and stomp stones; sings and counts claps.
3. **Peeko Peekaboo Barn** (`peekaboo-barn`) — red wooden barn with big doors and friendly hiding places; farm animals and location words.
4. **GoGo Station** (`station`) — track loop, tunnel, station platform and chunky passenger carriages; movement, sequencing and counting.
5. **Lumi Learning Cloud** (`learning-cloud`) — soft sky clouds where Lumi and Tiko explore letters, numbers, shapes, colours and careful counting.
6. **Home Nook** (`home-nook`) — everyday routine props, welcome-party table, picnic and bedtime wind-down. Ships generic friends only; no family voices or names (`MASTER-PROMPT.md` section 6).
7. **Moonlit Nursery** (`moonlit-nursery`) — warm nightlight, cradle, crib mobile and music box for calm bedtime stories.
8. **Starlight Cloud** (`starlight-cloud`) — quiet twilight sky with moon and sleepy clouds for gentle goodnight closes and bedtime long-play.

World rules:
- Set geometry and props are understated so characters remain focal.
- Fixed child camera or authored shot timeline; **no free orbit camera**, camera shake or rapid cuts in child mode.
- Reuse lighting/scene look families, ensure saturation stays readable across software WebGL2 and physical devices.
- Keep one focal action and max two child choices onscreen; touch region tied to semantic object, not tiny visual detail.
- Music quiet during speech; transitions clearly imply story progress; deterministic round endings.
- Personal photos/names/recordings belong only in optional family-local configuration, never in source control.

## 4. Visual direction (proposals, not built assets)
| Feature | Art specification |
| --- | --- |
| Proportions | Squat/chunky rounded silhouettes, hands/feet oversized just enough to read clearly |
| Eyes / expressions | Visible pupils and brows or shape-based expression; directional gaze leads child toward target object |
| Palette | Pastel-meadow backgrounds with rich saturated object accents; purple Momo, mint Lulu, warm yellow Lumi, red GoGo |
| Lighting | Soft readable key/fill with modest shadows; no strobe and no physically aggressive glare |
| Text | Child-facing screen mostly text-free; large optional letter/number displays only when part of story |
| Action | Slow anticipation → event → reaction → brief hold; prioritize clarity over cinematic realism |
| Transitions | Cut only at meaningful episode beats; avoid micro-cut edits, flashing and whip pans |
| Low-motion | Remove unnecessary particles/camera movement/secondary bouncing; keep semantic action and the talking cue |
| Offline cue | Gentle final still with one physical-action suggestion for caregiver |

Create one shared `src/scenes/looks.ts` and adjust by scene; do **not** guess that every post effect has parity. Aura3D 4.5.0 facts that shape it:
- By default `effects.vignette()` still darkens frames: the linear-light vignette of 4.3.0 is opt-in since 4.3.2 (`globalThis.__A3D_LINEAR_VIGNETTE__ = true` or `?linearvig=1`, `linearVignetteEnabled()` in `packages/rendering/src/webgl2/LegacyPost.ts`) and the 4.2.0 display-space vignette is the default. Use no vignette at all: no world adds `effects.vignette`. Compare evidence with post off.
- Since 4.5.0 a scene that authors its own lights and no environment is lit by those lights only (`CHANGELOG.md` 4.5.0), so every world uses a look preset that brings an HDRI or adds an `environments.*` node. Ten of the fifteen presets bring an HDRI; `night-city`, `polar-night`, `neon-arcade`, `space` and `underwater` carry a neutral fill instead, which is dropped when the scene authors `lights.ambient`.
- `quality: "auto"` (the default) draws a scene with no post-processing, output options, transmission or custom shader on a direct one-pass path; `app.diagnostics().renderPath` reports which path ran (`direct` or `hdr-msaa`) and why.
- The app turns runtime particle effects off with `app.effects.runtime = "off"` (`CHANGELOG.md` 4.3.5). The library default is `"on"`, and the URL's `?vfx=on|off` overrides either setting. Bubbles are meshes.
- Call `await warmPrograms(app)` (`@aura3d/engine/game`) before showing the first frame.

## 5. Script / audio direction
- Spoken turns: one short sentence or two linked phrases; model natural pronunciation and realistic conversational intonation (and follow the banter rules in `09` C.4: one speaker at a time, gentle character mistakes that the child helps spot, zero mocking or shame).
- Momo voice: calm enthusiasm and warmth, pauses so child/parent can take a turn.
- Lulu voice: melodic rhythm without nonstop singing; beats and physical actions match syllables.
- Tiko voice: unhurried, gentle, clear counting cadence (`speed: 0.86`, `stability: 0.72`); models patient observation without ever scolding faster friends.
- Dog sounds: short, soft, friendly cartoon barks (`sheru` has `speaks: false` and `voice: null` in `src/characters/sheets/sheru.json`); low volume, no rapid barking runs.
- Data-driven cast voices & paid-tier audio provenance: every speaking character's ElevenLabs `voiceId`, `modelId` (`eleven_multilingual_v2`), `stability`, `similarityBoost`, `style`, and `speed` are stored canonically in `src/characters/sheets/*.json` and compiled via `node tools/gen-cast.mjs`. Voices, original songs, music beds, and SFX are generated on **paid ElevenLabs plan tiers** through Kiro Prism (`https://prism.auraone.ai/v1/voice/elevenlabs`, `apps/veer-wonder-world/tools/gen-audio.ts`), saving character-level timestamp alignments (`/with-timestamps`) alongside spoken lines to drive timed viseme tracks (`09` B3.6). Each audio file receives a verified rights record in `apps/veer-wonder-world/provenance/audio/{lines,songs,beds,sfx}.json` (provider, endpoint, voice, Prism key id, paid plan tier, prompt, date) and is compiled into `src/assets/rights-manifest.ts` (`tools/gen-rights-manifest.mjs`), which rejects free-tier or unrecorded audio.
- Runtime & broadcast audio: in interactive co-play and `?broadcast=1` `ShowSpec` runs, SFX and music synth cues route through `createCueBank` while recorded voice lines play through the dedicated narration player on the shared `AudioContextManager` (emitting deterministic `{ t, type, id }` audio events on `__AURA_WONDER_WORLD__.eventLog()` for offline broadcast mastering, `09` B3.5).
- Optional localized packs must be professionally or caregiver-reviewed for natural language; avoid automated literal word-by-word translations; give each target concept a localized script and offline play prompt.
- Recorded family voice may be imported only with explicit consent, editable locally, and never committed to the public repo.

### Original song pattern: “Go / Stop with Lulu”
Four short phrases; words synchronized with actions:
1. “Clap, clap, clap with me.” (three paced claps)
2. “One, two, three!” (three visible stomps or blocks)
3. “Go, go, go!” (Lulu walks)
4. “Now ... stop!” (Lulu freezes, pauses; child can move too)
Then end. No indefinite automatic repeat; parent can replay on demand.

### Original song pattern: “The Ball Rolls”
“Ball, ball, rolling ball / Here it comes, and there it goes / Stop, ball, stop / Let's roll it once more!”
Animation maps each verb to a movement. Melody and recording are generated from original prompts with the paid-tier ElevenLabs music endpoint through Kiro Prism, backed by provenance records (`provenance/audio/songs.json`).

## 6. Animation + voice timing specification
Each beat and character motion must have:
- semantic state (`idle`, `gesture`, `speak`, `waiting`, `celebrate`, `outro`);
- deterministic procedural sub-part pose curves (`src/scenes/articulated-actors.ts`) and whole-actor motion (`src/scenes/motion.ts`) over the sculpted procedural rigs in `src/scenes/procedural-rigs/` (zero external `.glb` skeleton clips);
- measured spoken line durations (`src/audio-manifest.ts`), with beat `holdMs`, song cues, and broadcast `PAUSE` durations locked deterministically on the 50 ms story clock (and sub-step interpolated via `advanceTo(tMs)` / `createFixedStepPresenter`, `09` B3.4);
- gaze target (object, caregiver viewer, another character);
- talking cue: timed `jaw` / `beakLower` viseme tracks derived from ElevenLabs `/with-timestamps` character alignment (with automatic fallback to the 20 Hz RMS speech-envelope curve in `src/audio-manifest.ts`), accompanied by subtle cheek/head/body talk motion and resting closed in silence — stylized cartoon mouth articulation with zero claim of clinical phoneme modelling;
- option `reduceMotion`; animation still conveys cause/effect and readable speech cues even with music muted;
- no camera movement required for comprehension.

### Sculpted procedural stage asset inventory (zero external GLBs)
- **P1:** `momo`, `lulu`, and `sheru` sculpted procedural rigs (`cast-rigs.ts`), `ball`, `bubbleWand`, meadow, music-garden, and everyday Home Nook props.
- **P2:** `gogo` engine + `gogoCarriage`, `lumi`, and `peeko` sculpted procedural rigs (`cast-rigs.ts`), station set, red barn set, farm animals, shape/letter props, and bedtime props (`moon`, `cradle`, `cribMobile`, `musicBox`, `nightlight`, `blanket`, `sleepyCloud`).
- **P3:** `tiko` little turtle sculpted procedural rig (`tiko-rig.ts`), bringing the stage catalog to **73 procedural assets** (`MODEL_KEYS`).

**Asset & cast codegen**: all 73 stage keys are declared in `apps/veer-wonder-world/tools/wonder-assets.json` (`procedural: true` for every key; zero `.glb` files in `src/assets/models/`). `node tools/gen-aura-assets.mjs` generates `src/aura-assets.ts` (`MODEL_KEYS`, `MODEL_INFO`), `node tools/gen-cast.mjs` compiles `src/characters/sheets/*.json` into `src/characters/generated-cast.ts`, and `node tools/gen-rights-manifest.mjs` compiles `src/assets/rights-manifest.ts` (`MODEL_RIGHTS = []`, 73 `PROCEDURAL_RIGHTS` records). Lightweight primitive stand-ins remain available behind `?models=0` for fallback diagnostics (`src/scenes/stand-ins.ts`).

## 7. Character-to-content allocation
| Format | Host | Supporting cast | Why |
| --- | --- | --- | --- |
| First-word story | Momo | Sheru | Warm story and familiar object action |
| Movement and song | Lulu | Momo | Rhythmic invitation and response |
| Fetch/hide game | Sheru | Momo | Cause/effect and turn taking |
| Alphabet zoo | Lumi | Peeko | Letter/object reveal and surprise |
| Careful counting & shapes | Tiko | Lumi, Lulu | Unhurried one-by-one observation and gentle contrast with Lulu's fast beat |
| Counting cookies | Momo | Lulu, Tiko | One-to-one count made funny and steady |
| Train / transport | GoGo | Peeko, Lulu | Social entrance/exit and movement |
| Peekaboo | Peeko | Momo | Predictable reveal and greetings |
| Everyday routine & bedtime | Momo, Lumi | Sheru | Generalization to household words and calm goodnight close |

## 8. Content approval per episode/character
- [x] Script begins with a child-legible concrete goal and ends naturally. Done: the lint requires a greeting first and an outro last (`src/content/schema.ts`), every episode has a hook that names one concrete problem (for example E10 "Rumble, rumble! That's my tummy." then "I'm hungry."), and every interactive story ends on its outro and then the offline card (`app-flow.test.ts`).
- [x] A character shows a named object/action while saying the target term. Done: each beat's `words` pairs a word with an object, and the lint fails a named word that no line of the beat says, a named object that is not visible during the beat and a target word never named with an object (`content-schema.test.ts`).
- [x] Each invitation can proceed via touch, caregiver confirmation, or broadcast `PAUSE`; silence never fails. Done: in interactive modes every wait takes a tap on its target or the grown-up's "Your child had a turn" and ends by itself after `waitMs` (`app-flow.test.ts`, `turn-taking.test.ts`), and in `?broadcast=1` mode every `invite` holds a calm `PAUSE` beat before resolving cleanly (`09` B3.2).
- [x] Character animation visually matches spoken action; stylized `jaw`/`beakLower` speech articulation and talking motion are verified (no clinical phonetics claim). Done: stage actions start before their lines (`src/runtime/episode-director.ts`), song motions start on their lyric lines (`song-choreography.test.ts`), and unit + remote browser checks verify sub-part jaw/beak opening during speech and closed mouths at rest (`character-registry.test.ts`, `character-sheets-and-tiko.test.ts`, `wonder-world-characters*.spec.ts`).
- [ ] Voice/FX/music levels reviewed on phone/tablet speakers at normal volume. Open: listening on phone and tablet speakers is part of the physical-device runs (07 §4.3 item 1); the bus caps, ducking and loudness targets are set (`src/runtime/audio-mixer.ts`; 07 §3.1; -14 LUFS broadcast target in `09` B.4).
- [ ] Language model is natural and correctly localized; exact letter name versus phoneme distinction. Open: whether the recorded letter clips say the name and a short sound with no added vowel needs a person listening, in the device runs (07 §4.3 item 1, step 6); the scripts keep name and sound in separate lines (`letters-and-counts.test.ts`), lone letters are voiced by name (07 B30), and only English is active until native localization review (07 B16).
- [x] Parents can disable music, pause, replay, or end. Done: Music is a switch in the parent panel (`src/ui/parent-panel.ts`; `audio-mixer.test.ts`), and pause, Replay word and All done are ungated corner controls (`src/ui/child-controls.ts`).
- [x] Off-screen action is specific and practical; no compulsory follow-on screen. Done: every story offline string names one concrete home activity, the offline card has one grown-up button and no timer (`strings.test.ts`), and nothing auto-plays next (`session-gate.test.ts`).
- [x] All procedural stage rigs, portraits, HDRIs, voices and music have documented ownership/provenance on paid tiers. Done: all 73 procedural stage assets (`PROCEDURAL_RIGHTS`, `MODEL_RIGHTS = []`), 4 Poly Haven CC0 look HDRIs (`ENVIRONMENT_RIGHTS`), rendered character portraits (`PORTRAIT_RIGHTS`), and paid-tier ElevenLabs audio records (`AUDIO_RIGHTS` from `provenance/audio/{lines,songs,beds,sfx}.json` — zero free-tier files) are verified in `src/assets/rights-manifest.ts` (`rights-manifest.test.ts`, `tools/gen-rights-manifest.mjs`).
- [ ] Animation passes low-motion and mobile performance QA. Open: mobile performance QA needs the physical-device runs, and the 06 §6 budgets stay unmeasured until then (07 §4.3 item 1); the low-motion pass is checked by `tests/browser/wonder-world-low-motion.spec.ts` and the character-registry / character-sheet suites.
