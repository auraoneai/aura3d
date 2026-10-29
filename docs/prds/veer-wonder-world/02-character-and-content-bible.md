# PRD 02 — Original Characters, World, Animation, Songs and Content Bible
Status: **IN BUILD (prototype assets: Meshy text-to-3D through Kiro Prism; agent review in place of human sign-off, owner instruction 2026-10-29)** · Owner: art/animation + audio + educational script · Related: [`05 episodes`](05-episodes-games-and-curriculum.md), [`03 technical`](03-aura3d-architecture-and-contracts.md)

## 1. The central creative hypothesis
Create a **small, familiar cast** whom a child can recognize instantly and enjoy across different formats: watching, singing, tap-and-play and physical imitation. The characters' personalities are storytelling mechanisms, not noise machines. Their expressions orient attention to a word/object/action; music encourages movements; humour yields natural repetition. Avoid hyperstimulating editing or rewards that exist only to extend viewing.

### Brand and character constraints
- Every character is original and designed from a new brief. Do not imitate named shows, identifiable characters, their typography, voices, scripts, musical motifs, or trade dress.
- Design and name candidates remain provisional pending trademark search, creative review and rights clearance. Family-related names/images used internally are not public-domain assets. For this build an agent name check and creative review stand in (`07` section 2); a real trademark search is still required before any public release.
- All characters have friendly, non-threatening silhouettes, readable faces at mobile scale, no sharp teeth/fearful behaviour or exaggerated startling reactions.
- Face visible when speaking, but no claim of clinically accurate articulatory modelling. The generated models carry no mouth morphs, so “talking” is a gentle squash/bob pulse of the speaking character while its line plays; it is never described as lip sync.
- One speaking character at a time. Silence and musical rests are part of the design.

## 2. Character bible / cast table

| ID | Character | Physical and personality brief | Voice / repeated phrase | Language job | Animation essentials | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| `momo` | **Momo** — small fuzzy purple monster, round body, wide eyes, tiny feet | Curious, silly, warm host; visibly points and waits rather than constantly asking questions | Friendly warm narrator; “Uh-oh!”, “Look!”, “More?” | Early object/action names, social turns, story setup and resolution | Procedural (the Meshy humanoid rig was rejected; see the rig decision below): idle bob, bounce, sway, point-lean, wave, surprise, squash-stretch, talk pulse | P1 |
| `lulu` | **Lulu** — rounded soft green mini dinosaur, big safe feet and little tail | Joyful rhythm leader, slow stomp / clap, sometimes comically off-beat | Tuneful, rhythmic, clear; “Boom boom!”, “La la la!” | Songs, imitation, animal/silly sounds, stop/go, body actions | Procedural (rig rejected; see the rig decision below): dance sway, stomp hop, clap pulses, freeze, talk pulse | P1 |
| `sheru` | **Sheru** — licensed original stylized family-dog-inspired cartoon, gentle floppy ears | Playful, cuddly, responsive; understands games, fetches things | Friendly barks (“woof”), no need for realistic talking voice | Ball, go, more, under, find; personal connection and turn-taking | Procedural (not rigged): idle, hop, walk/run tweens, sit, wag (yaw wiggle), sniff bob, carry ball, squash-stretch react; never speaks words, bark SFX only | P1 |
| `gogo` | **GoGo** — chunky bright red toy train with face and gently moving wheels | Excited to help friends travel; always stops politely | “Ready... go!”, “Stop!” | Movement, numbers, in/out, vehicles, simple sequencing | Procedural: idle bob, depart/brake tweens along the track, wheel roll, doors, carriage (`gogoCarriage`), passengers | P2 (built now) |
| `lumi` | **Lumi** — warm yellow star-shaped learning guide; non-flashing glow | Soft spoken and curious; conjures concrete objects, not quizzes | “Look what I found!” | Letters with objects, quantities, shapes, colours | Procedural: gentle float, point, spin-in conjure, soft glow that never flashes, talk pulse | P2 (built now) |
| `peeko` | **Peeko** — round little chick with soft tuft and tiny wings (renamed from Pip: *Pip's Big Leap* is a live Aura3D game, `tools/site/games.catalog.json`) | Loves peekaboo and pretend hiding; never frightening | “Peekaboo!”, “Here I am!” | Greetings, open/close, where, in/on/under, animal sounds | Procedural: hide, pop-up hop, wave, squash-stretch, wing flap via scale, talk pulse | P2 (built now) |

**Rig decision (2026-10-29).** Meshy auto-rigging supports humanoid bipeds only, so Momo and Lulu were the rig candidates, with Meshy library clips to be merged into one GLB by `aura3d assets merge-clips`. The rig was evaluated on Lulu and rejected. `aura3d assets validate --skin` fails in every clip: 895-1465 of 12,356 triangles stretch past 1.6x. After baking the armature scale (`apps/veer-wonder-world/tools/bake-armature-scale.mjs`) and running `repair-skin --refit-skeleton`, the worst stretch is still 142.9x (`rigNote` in `apps/veer-wonder-world/tools/wonder-assets.json`). Momo, with the same round body, was not rigged either. Both are admitted as static A-pose models (`MODEL_INFO.momo` and `MODEL_INFO.lulu` have `rigged: false` and `clips: []`). Every character, animal and prop therefore moves procedurally with position/rotation/scale tweens (hop, sway, squash-stretch, wag as a yaw wiggle, bob, roll, float). The character files keep their clip names as candidates and play a clip only when `MODEL_INFO[key].clips` lists it, so a later rig that passes `validate --skin` needs no code change. The generated models have no mouth morphs, and this build animates no facial expressions (blinks, smiles, mouth shapes), so emotion reads through body motion and the talking pulse; confirm with `aura3d assets inspect --morphs` before planning any face animation.

Character approval deliverables per character (agent review records stand in for human approval in this build):
- [ ] Turnaround 3D concept sheet (front/side/back), mobile silhouette test at 320 CSS px.
- [ ] Facial expression sheet: neutral, delighted, curious, surprised, waiting, waving good-bye; avoid distressed/angry exaggeration. In this build each model keeps one fixed friendly face, so these states are body poses and motion.
- [ ] Procedural motion set per character (the rig was rejected, see the rig decision) and inspected exact exported clip names (none in this build); no assumed clip ids.
- [ ] Talking pulse readable at browser resolution (squash/bob while the line plays; no mouth morphs exist, no lip-sync claim).
- [ ] 8–15 short approved voice lines / non-speaking reactions (for Sheru bark bank).
- [ ] Textured/optimized same-origin GLB, sha256 and original-license provenance.
- [ ] One child-review camera framing and one low-motion animation pass.
- [ ] Originality, licensing, naming/trademark review.

## 3. Shared setting / world map
A miniature 3D toy island, not an explorable open world. Camera remains framed; select a place from a calm visual home screen:
1. **Momo Meadow** — soft grass, bubble flowers, a small ball and a friendly hill; hosts first words, bubbles and fetch.
2. **Lulu Music Garden** — drums, oversized piano keys and stomp stones; sings and counts claps.
3. **Peeko Peekaboo Barn** — big doors and two hiding places; animals and location words.
4. **GoGo Station** — one loop of track, tunnel, station, three chunky passenger toys; movement/counting.
5. **Lumi Learning Cloud** — floating letter/number/shape cards each tied to a visible 3D action and object.
6. **Home Nook** — everyday routine props, doorbell with optionally family-approved voice greetings, picnic and bedtime. This build ships generic friends only at the door; no family voices or names (`MASTER-PROMPT.md` section 6).

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
- Spoken turns: one short sentence or two linked phrases; model natural pronunciation and realistic conversational intonation.
- Momo voice: calm enthusiasm and warmth, pauses so child/parent can take turn.
- Lulu voice: melodic rhythm but not constantly sung; beats and physical actions match syllables.
- Dog sounds: short, soft, natural/cartoon barks; low volume, no rapid barking runs.
- Audio production: voices are ElevenLabs premade voices through Kiro Prism (`https://prism.auraone.ai/v1/voice/elevenlabs`, text-to-speech); songs and music beds come from the ElevenLabs music endpoint and SFX from the ElevenLabs sound-generation endpoint through the same proxy (`apps/veer-wonder-world/tools/gen-audio.ts`). Each file gets a rights record in `apps/veer-wonder-world/provenance/audio/{lines,songs,beds,sfx}.json` (provider, endpoint, voice, Prism key id, key tier as reported by Prism, prompt, date). Output from free-tier keys is prototype-only and must be re-rendered on a paid tier before any commercial release. Sheru never speaks words; the `woof` sound effect is the only voice. Casting is in `07`.
- Audio asset types: dialogue/VO, short original song motifs, SFX and music bed. Only SFX and music synth mapping use `createCueBank`; recorded voice playback is a dedicated narrator/player adapter, not an imagined `createCueBank` capability.
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
Animation maps each verb to a movement. Song is a content proposal; melody/recording require original licensed creation (this build: generated from an original prompt with the ElevenLabs music endpoint through Kiro Prism, with a provenance record; agent creative review in `07`).

## 6. Animation + voice timing specification
Each clip must have:
- semantic state (`idle`, `gesture`, `speak`, `waiting`, `celebrate`, `outro`);
- animation filename / clip name verified by `aura3d assets inspect`, with the character skeleton checked, for any rigged model (none in this build: the rig was rejected, section 2); procedural motion otherwise;
- approximate duration, with spoken cue timestamps locked in authoring;
- gaze target (object, caregiver viewer, another character);
- talking cue: the generated models have no mouth morphs, so no mouth cue track exists; the speaking character gets a gentle squash/bob pulse while its line plays, which does not pretend to model phonemes and is never called lip sync;
- option `reduceMotion`; animation still conveys cause/effect even with music muted;
- no camera movement required for comprehension.

### Minimum GLB asset inventory
P1: Momo, Lulu and Sheru character models (procedural motion; the rig was rejected, section 2), ball (drawn procedurally by design in this build, see `07` B9), bubble/wand, 3–5 toy props, meadow modular set, music-garden modular set and everyday picnic props. Props can be simple scene geometry if not hero subjects; characters and hero vehicles must be approved typed GLBs. Reuse shared materials/textures.
P2 (built now): GoGo train, Lumi star and Peeko chick models (procedural motion), station set, barn set, shape/letter object library, optional family doorbell props.

**Asset admission**: models are Meshy text-to-3D through Kiro Prism (`https://prism.auraone.ai/v1/meshy/openapi/v1` and `/v2`), generated, refined and remeshed by `apps/veer-wonder-world/tools/meshy-pipeline.mjs` (raw output stays in the gitignored `artifacts/meshy/wonder-world/<key>/`), then optimized and admitted by the app's `tools/admit-models.mjs` (it would also merge clips for a rigged model; none is rigged in this build) as `apps/veer-wonder-world/src/assets/models/<key>.<sha8>.glb` with provenance in `apps/veer-wonder-world/provenance/models/<key>.json`. The app's `tools/gen-aura-assets.mjs` generates `src/aura-assets.ts` (`models`, `MODEL_KEYS`, `MODEL_INFO`, `modelRef`) with module-relative URLs (`new URL("./assets/models/...", import.meta.url).pathname`, the documented `defineModelAssets` pattern) because the repo dev server maps `/aura-assets/` only to the root `public/` tree and the Vite build fingerprints module-relative assets. The list is `apps/veer-wonder-world/tools/wonder-assets.json` (59 models). Every model use falls back to a primitive stand-in of the right size and colour when the model is missing (or `?models=0`). Follow repo `docs/agents/asset-workflow.md`. Inspect and optimize assets before admission, generate hash/provenance and maintain rights records. Never paste placeholder hashes in a shipped app.

## 7. Character-to-content allocation
| Format | Host | Supporting cast | Why |
| --- | --- | --- | --- |
| First-word story | Momo | Sheru | Warm story and familiar object action |
| Movement and song | Lulu | Momo | Rhythmic invitation and response |
| Fetch/hide game | Sheru | Momo | Cause/effect and turn taking |
| Alphabet zoo | Lumi | Peeko | Letter/object reveal and surprise |
| Counting cookies | Momo | Lulu | One-to-one count made funny |
| Train / transport | GoGo | Peeko, Lulu | Social entrance/exit and movement |
| Peekaboo | Peeko | Momo | Predictable reveal and greetings |
| Everyday routine | Momo | Sheru | Generalization to household words |

## 8. Content approval per episode/character
- [ ] Script begins with a child-legible concrete goal and ends naturally.
- [ ] A character shows a named object/action while saying the target term.
- [ ] Each invitation can proceed via touch or caregiver initiation; silence never fails.
- [ ] Character animation visually matches spoken action; the talking pulse is checked in browser capture (no lip-sync claim).
- [ ] Voice/FX/music levels reviewed on phone/tablet speakers at normal volume.
- [ ] Language model is natural and correctly localized; exact letter name versus phoneme distinction.
- [ ] Parents can disable music, pause, replay, or end.
- [ ] Off-screen action is specific and practical; no compulsory follow-on screen.
- [ ] All models, audio, voices and music have documented ownership/provenance.
- [ ] Animation passes low-motion and mobile performance QA.
