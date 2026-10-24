# PRD 02 — Original Characters, World, Animation, Songs and Content Bible
Status: **PROPOSED IP / NO FINISHED ASSETS** · Owner: art/animation + audio + educational script · Related: [`05 episodes`](05-episodes-games-and-curriculum.md), [`03 technical`](03-aura3d-architecture-and-contracts.md)

## 1. The central creative hypothesis
Create a **small, familiar cast** whom a child can recognize instantly and enjoy across different formats: watching, singing, tap-and-play and physical imitation. The characters' personalities are storytelling mechanisms, not noise machines. Their expressions orient attention to a word/object/action; music encourages movements; humour yields natural repetition. Avoid hyperstimulating editing or rewards that exist only to extend viewing.

### Brand and character constraints
- Every character is original and designed from a new brief. Do not imitate named shows, identifiable characters, their typography, voices, scripts, musical motifs, or trade dress.
- Design and name candidates remain provisional pending trademark search, creative review and rights clearance. Family-related names/images used internally are not public-domain assets.
- All characters have friendly, non-threatening silhouettes, readable faces at mobile scale, no sharp teeth/fearful behaviour or exaggerated startling reactions.
- Face/mouth visible when speaking, but no claim of clinically accurate articulatory modelling; gestures and lip-sync are supporting cues.
- One speaking character at a time. Silence and musical rests are part of the design.

## 2. Character bible / cast table

| ID | Character | Physical and personality brief | Voice / repeated phrase | Language job | Animation essentials | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| `momo` | **Momo** — small fuzzy purple monster, round body, wide eyes, tiny feet | Curious, silly, warm host; visibly points and waits rather than constantly asking questions | Friendly warm narrator; “Uh-oh!”, “Look!”, “More?” | Early object/action names, social turns, story setup and resolution | idle, blink, point, surprise, happy, bounce, talk/mouth | P1 |
| `lulu` | **Lulu** — rounded soft green mini dinosaur, big safe feet and little tail | Joyful rhythm leader, slow stomp / clap, sometimes comically off-beat | Tuneful, rhythmic, clear; “Boom boom!”, “La la la!” | Songs, imitation, animal/silly sounds, stop/go, body actions | dance, stomp, clap gesture, freeze, blink, smile, talk/mouth | P1 |
| `sheru` | **Sheru** — licensed original stylized family-dog-inspired cartoon, gentle floppy ears | Playful, cuddly, responsive; understands games, fetches things | Friendly barks (“woof”), no need for realistic talking voice | Ball, go, more, under, find; personal connection and turn-taking | idle, walk, run, sit, wag, sniff, carry ball, react | P1 |
| `gogo` | **GoGo** — chunky bright red toy train with face and gently moving wheels | Excited to help friends travel; always stops politely | “Ready... go!”, “Stop!” | Movement, numbers, in/out, vehicles, simple sequencing | idle, depart, brake, blink, doors, passengers | P2 |
| `lumi` | **Lumi** — warm yellow star-shaped learning guide; non-flashing glow | Soft spoken and curious; conjures concrete objects, not quizzes | “Look what I found!” | Letters with objects, quantities, shapes, colours | gentle float, point, conjure, blink, talk/mouth | P2 |
| `pip` | **Pip** — round little chick with soft tuft and tiny wings | Loves peekaboo and pretend hiding; never frightening | “Peekaboo!”, “Here I am!” | Greetings, open/close, where, in/on/under, animal sounds | hide, pop-up, flap, wave, blink, talk/mouth | P2 |

Character approval deliverables per character:
- [ ] Turnaround 3D concept sheet (front/side/back), mobile silhouette test at 320 CSS px.
- [ ] Facial expression sheet: neutral, delighted, curious, surprised, waiting, waving good-bye; avoid distressed/angry exaggeration.
- [ ] Rig, skinned meshes, animation clips and inspected exact exported clip names; no assumed clip ids.
- [ ] Lip motion solution validated at browser resolution (blendshape visemes if proven, simple mouth open/close fallback).
- [ ] 8–15 short approved voice lines / non-speaking reactions (for Sheru bark bank).
- [ ] Textured/optimized same-origin GLB, sha256 and original-license provenance.
- [ ] One child-review camera framing and one low-motion animation pass.
- [ ] Originality, licensing, naming/trademark review.

## 3. Shared setting / world map
A miniature 3D toy island, not an explorable open world. Camera remains framed; select a place from a calm visual home screen:
1. **Momo Meadow** — soft grass, bubble flowers, a small ball and a friendly hill; hosts first words, bubbles and fetch.
2. **Lulu Music Garden** — drums, oversized piano keys and stomp stones; sings and counts claps.
3. **Pip Peekaboo Barn** — big doors and two hiding places; animals and location words.
4. **GoGo Station** — one loop of track, tunnel, station, three chunky passenger toys; movement/counting.
5. **Lumi Learning Cloud** — floating letter/number/shape cards each tied to a visible 3D action and object.
6. **Home Nook** — everyday routine props, doorbell with optionally family-approved voice greetings, picnic and bedtime.

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
| Low-motion | Remove unnecessary particles/camera movement/secondary bouncing; keep semantic action and mouth cues |
| Offline cue | Gentle final still with one physical-action suggestion for caregiver |

Create one shared `look.ts` and adjust by scene; do **not** guess that every post effect has parity. Compare final evidence with postprocess off because Aura3D CHANGELOG notes legacy post chain can darken renders.

## 5. Script / audio direction
- Spoken turns: one short sentence or two linked phrases; model natural pronunciation and realistic conversational intonation.
- Momo voice: calm enthusiasm and warmth, pauses so child/parent can take turn.
- Lulu voice: melodic rhythm but not constantly sung; beats and physical actions match syllables.
- Dog sounds: short, soft, natural/cartoon barks; low volume, no rapid barking runs.
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
Animation maps each verb to a movement. Song is a content proposal; melody/recording require original licensed creation.

## 6. Animation + voice timing specification
Each clip must have:
- semantic state (`idle`, `gesture`, `speak`, `waiting`, `celebrate`, `outro`);
- animation filename / clip name verified by `aura3d assets inspect`; character skeleton checked;
- approximate duration, with spoken cue timestamps locked in authoring;
- gaze target (object, caregiver viewer, another character);
- mouth cue track when available; fallback does not pretend to model phonemes exactly;
- option `reduceMotion`; animation still conveys cause/effect even with music muted;
- no camera movement required for comprehension.

### Minimum GLB asset inventory
P1: Momo character rig, Lulu character rig, Sheru character rig, ball, bubble/wand, 3–5 toy props, meadow modular set, music-garden modular set and everyday picnic props. Props can be simple scene geometry if not hero subjects; characters and hero vehicles must be approved typed GLBs. Reuse shared materials/textures. 
P2: GoGo train rig, Lumi star rig, Pip chick rig, station set, barn set, shape/letter object library, optional family doorbell props.

**Asset admission**: follow repo `docs/agents/asset-workflow.md`. Inspect and optimize assets before admission, generate hash/provenance and maintain rights records. Never paste placeholder hashes in a shipped app.

## 7. Character-to-content allocation
| Format | Host | Supporting cast | Why |
| --- | --- | --- | --- |
| First-word story | Momo | Sheru | Warm story and familiar object action |
| Movement and song | Lulu | Momo | Rhythmic invitation and response |
| Fetch/hide game | Sheru | Momo | Cause/effect and turn taking |
| Alphabet zoo | Lumi | Pip | Letter/object reveal and surprise |
| Counting cookies | Momo | Lulu | One-to-one count made funny |
| Train / transport | GoGo | Pip, Lulu | Social entrance/exit and movement |
| Peekaboo | Pip | Momo | Predictable reveal and greetings |
| Everyday routine | Momo | Sheru | Generalization to household words |

## 8. Content approval per episode/character
- [ ] Script begins with a child-legible concrete goal and ends naturally.
- [ ] A character shows a named object/action while saying the target term.
- [ ] Each invitation can proceed via touch or caregiver initiation; silence never fails.
- [ ] Character animation visually matches spoken action; lip-sync is checked in filmed browser capture.
- [ ] Voice/FX/music levels reviewed on phone/tablet speakers at normal volume.
- [ ] Language model is natural and correctly localized; exact letter name versus phoneme distinction.
- [ ] Parents can disable music, pause, replay, or end.
- [ ] Off-screen action is specific and practical; no compulsory follow-on screen.
- [ ] All models, audio, voices and music have documented ownership/provenance.
- [ ] Animation passes low-motion and mobile performance QA.
