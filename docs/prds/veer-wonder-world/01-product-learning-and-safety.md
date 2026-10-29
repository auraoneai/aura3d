# PRD 01 — Product, Learning Design, Caregiver Role and Safety
Status: **IN BUILD (prototype; owner decision 2026-10-29)** · Product owner: PM · Review: pediatric SLP, caregivers, privacy counsel; for this build each review is a recorded agent review (owner instruction 2026-10-29, [`07`](07-autonomous-decisions-and-build-record.md) section 2), which is not clinical or legal review and relaxes no rule in this file · Links: [index](README.md), [content](05-episodes-games-and-curriculum.md), [QA](06-qa-release-and-execution.md)

## 1. Problem to solve
A toddler still developing speech may engage deeply with animals, songs, bright toys and familiar stories. Yet passive watching, tapping random buttons or reciting ABCs do not establish that a child can communicate. Build a compact **co-play storytelling experience** that repeatedly pairs a small set of useful words with real meaning, creates optional turn-taking opportunities, introduces letters/numbers/objects playfully, and ends by reconnecting child and caregiver to real life.

### Primary child experience
- Developmental age: early toddler, roughly age two; **do not infer diagnosis, developmental stage, vocabulary size or treatment needs** from age alone.
- Child can participate without talking. Pointing, gaze shifts, attempts at sounds, movement and touch all count as meaningful **opportunities**, not algorithmically inferred milestones.
- Same characters return in different situations; one central visual action per scene; minimal comprehension burden.
- Tiny story arcs; immediate understandable consequences; few voice clips at a time; self-terminating episodes.

### Primary caregiver
- Starts/ends the experience, sits with child when feasible, mirrors/model language, extends screen idea with a physical toy or shared activity.
- Can adjust language, pace, sounds, target words and video mode. App respects “all done.”
- May note observations **manually** to discuss with an SLP if desired; app avoids diagnostic interpretations.

## 2. Jobs-to-be-done, ranked
1. Invite natural communicative participation during shared play (“more”, “go”, “ball”, “open”, “hi”, gesture, eye contact, turn).
2. Expand exposure to meaningful everyday vocabulary (people, objects, animals, verbs, routines).
3. Enjoy repetitive songs, sound play and body movement (clap, stomp, wave) with family.
4. Support early concept familiarity: quantities 1–3; colours; up/down, in/out, big/small.
5. Introduce a playful alphabet association: letter shape/name, beginning sound, recognisable object, one at a time.
6. Foster social connection; make real-world imitation easy through end-card ideas.

**Not** intended to replace live caregiver communication, free play, books, pediatric evaluation, hearing assessment, or SLP intervention.

## 3. Educational design principles
### 3.1 Model, meaning, pause, response, expansion
Each beat must have:
- **Model**: narrator says a short natural phrase, e.g. “Ball! A ball.”
- **Meaning**: ball is visibly present, bouncing or rolling as it is named.
- **Turn**: character looks toward viewer with a calm pause (content-configurable default proposal 4–6 seconds; SLP review required; this build defaults to 5 s, `BeatSpec.waitMs` in `src/types.ts`, under agent review in `07`).
- **Response**: touch, gesture interpreted by caregiver, sound or word is welcomed; game advances without any test of pronunciation.
- **Expansion**: adult or narrator adds one step, e.g. “The ball rolls.”
- **Generalization**: end-card invites real ball play or books with the same word.

Do not stack more than one fresh noun/concept plus one action in a short beat. Avoid rapid cuts, layered speech/music, “repeat after me” drilling, negative pronunciation feedback and performance rankings.

### 3.2 Watchable AND interactive
- `watch-sing`: fixed beginning/middle/end, no prompts requiring input, spontaneous 2–4-minute episode; turn-taking pauses are naturally part of the story.
- `play-together`: same story arc with 1–3 touch opportunities; parent can manually trigger response to a real-world gesture.
- `voice-play`: **P3 candidate only**. Optional brief parent-initiated listening; never blocks the tap path, never stores raw child audio by default.

### 3.3 First words beat letter drilling
Prioritize practical language. Alphabet and numerical content should be fun, intelligible and optional:
- **ABCs**: tell child the letter name, model its beginning sound, present meaningful object (“B says /b/ as in ball”). Do not claim phonics fluency or create symbol-memorization requirements.
- **Counting**: count actual discrete objects one by one, visibly synchronized (“one duck… two ducks…”). Begin 1–3; extend 5 and 10 only after content validation.
- **Sound imitation**: animal sounds, “mmm”, “pop”, “beep”, “uh-oh”; not a measure of speech accuracy.
- **Vocabulary expansion**: recurring words across different episodes and offline settings.

## 4. Curriculum progression and content coverage

### 4.1 Initial functional language set
| Cluster | Core terms | First scenes | Model actions |
| --- | --- | --- | --- |
| Request | more, again, help | Bubble, ball, snacks | Offer another turn; honour gesture |
| Movement | go, stop, up, down | Train, dance, balloon | Movement starts/stops |
| Cause/effect | open, close, pop, roll | Doors, bubbles, car | Match action and phrase |
| Social | hi, bye, thank you, my turn, your turn | Doorbell, fetch, band | Wave/turn exchange |
| Favourite objects | ball, dog, car, train, book, teddy | Sheru, GoGo, search | Touch and label |
| Daily living | eat, drink, wash, brush, sleep | Picnic, Momo's Day | Narrate routines |
| Familiar sound play | woof, moo, quack, baa, beep, boom | Barn, orchestra, robot | Pair source and sound |

Avoid prescribing an exact set of words as developmental milestones. A speech-language professional may tailor targets.

### 4.2 Expansion clusters
- Early vocabulary: apple, banana, milk, cookie, shoes, hat, bird, butterfly, water, flower, hand, foot, nose, eye, ear, tummy, door, box, hat, bed, moon.
- Concepts: big/small, in/out, up/down, wet/dry, fast/slow, empty/full, on/under, red/blue/yellow; introduce one pair per scene.
- Preliteracy: letters B, M, P as pilot examples because they connect to meaningful words; all 26 later via catalog—not a presumed developmental order.
- Numeracy: one, two, three with concrete one-to-one correspondence; “one more” in natural play.
- Songs: repeat same words while characters dance, pause, clap, wave, or move real toys.

### 4.3 Exposure design
Every episode manifest must include `targetWords` (max 3 core v0), `supportWords`, `onScreenActions`, `turnTakingPrompt`, `caregiverBridge`, `languageReviewStatus` and `offlinePlay`. A target should occur repeatedly in **different meaningful situations**, not merely loop an identical clip.

## 5. Narrative / engagement blueprint
Each episode uses six beats:
1. **Recognizable greeting** (5–15 s): same friendly character and musical hello.
2. **Hook and problem** (15–30 s): character needs/finds/wants one object; scene is concrete.
3. **Explore** (30–60 s): two attempts with repeated target words.
4. **Child turn** (5–10 s within beat): invitation; wait; optional tap; never test speech.
5. **Resolution + song** (30–60 s): satisfying action and rhythmic language.
6. **Natural ending** (10–20 s): “all done,” wave and one offline activity.

Story purpose, not a random reward, should cause the animation. Humour is gentle, with small surprising character reactions rather than flashing or frantic rewards.

## 6. Parent-mediated interaction
- On start, show short note: “Play alongside your child when you can. All activities work by touch; speaking isn't required.”
- A pause button and “Replay word” icon live in parent-facing controls; a parent can open guidance that says “Label what your child notices,” “Wait for a turn,” “Expand a sound or gesture,” “Try with a real toy.”
- Parent control gates are ordinary product UX, **not security controls**; keep privacy/settings surfaces separate from the play canvas.
- If caregiver speaks to or models for child, app doesn't attribute, label or grade that speech.
- “All done” always works and has immediate effect; no unfinished streak penalties or forced completion.
- Personalisation: choose approved local voice pack, subtitle display, intro name, short target-word list (suggested 3–5 words), calming mode and story order. This build has no intro name and no family voice pack: `ParentSettings` (`src/types.ts`) holds mode, music, sound, captions, reduced motion, high contrast, locale, wait time and word list only.
- Offline mode: at end, optionally blank the scene and present a simple suggestion + stop playback (“Find a ball and roll it back and forth”). No automatic next episode.

## 7. Health and safety boundary
- This is entertainment and caregiver-supported language exposure, **not a speech therapy device**; no diagnosis, outcome guarantees, normative scores, developmental risk prediction, or AI “speech age.”
- Do not require verbal output to unlock rewards; do not insist on imitation if child is uninterested or frustrated.
- Have pilot word set, prompt timing, interactions and any multilingual materials reviewed by a pediatric SLP before making educational claims. This build makes no educational claim; its agent review (`07`) does not satisfy this rule for any future claim.
- Provide caregiver with external guidance to consult pediatrician/SLP if concerned about development; consider professional hearing evaluation as appropriate; avoid automated triage.
- Limit stimulation: no flashing, strobe, loud stingers, camera shake, startling close-ups, aggressive jump cuts, endless loops, surprise rewards or autoplay next. Music ducks under speech.
- Design brief parent-led sessions; this is not a tool for maximizing daily viewing minutes. No badge/battlepass/points streaks.
- Content includes gentle social modelling, never frightening chase, conflict, or violence.

## 8. Child privacy and data policy
| Item | P1 baseline | Future voice experiment |
| --- | --- | --- |
| Login/account | None required | Same |
| Child name | Optional, local settings; never URL/log (this build stores none: no name field in `ParentSettings`) | Same |
| Raw audio | No microphone, no stored audio | Parent opt-in; default ephemeral, delete immediately; no storage |
| Recognition transcripts | None | Avoid collecting; if essential, explicit consent, deletion, DPIA, browser/provider documentation |
| Per-child developmental score | Prohibited | Prohibited |
| Analytics | Anonymous aggregate route health only, preferably server-disabled for child sessions | Same; no raw interaction stream linked to a child |
| Photos/camera | Not needed | Not part of plan |
| Purchases/ads/sharing | None | None |
| Storage | Parent settings on-device, clearable | Additional privacy review for any further storage |

Do not upload private family greetings or child photos as public git/LFS assets. Original commercial voices/music require licenses, invoices and provenance; use generated/recorded assets only with rights cleared. Consent and deletion flows must be comprehensible to caregivers. Any hosted public product requires legal review for applicable children’s privacy regulation (e.g. COPPA) before launch. The 2026-10-29 build is not released publicly, and this review stays open as part of the separate owner publish decision (`07` section 4).

## 9. Accessibility and UX acceptance
- [ ] All child-essential actions possible with one tap; drags have tap alternatives; no required fine motor timing.
- [ ] One clearly indicated focus action at a time; 44x44 CSS px baseline for parent controls, larger child hit zones tested on touch devices.
- [ ] Pause/mute/replay and reduced-motion setting effective across every episode.
- [ ] Voice legible and slower than typical cartoons, in natural speech; no overlapping dialogue; intentional quiet spaces.
- [ ] No instructional copy required for child; parent instructions accessible as text and screen-reader navigable.
- [ ] SFX volume capped with a caregiver adjustment, automatic ducking under dialog, no autoplay audible before a permitted gesture.
- [ ] High contrast / large type in parent mode and a calm mode with fewer non-essential animations.
- [ ] Episode still works when audio is unavailable, thanks to visual cues and parent-facing captions.
- [ ] No scoring, forced responses, or automated speech feedback; tapping and no response must both be safe.

## 10. Measurable success (without overclaiming)
**Engineering**: first frame and sound unlock (after user gesture), playable start-to-finish flows, touchscreen hit success and latency, QA evidence, no black frames, no blocking audio, resource budget.

**Caregiver-reported experience**: character recognizability, interest without distress, observed joint play, child attempts to communicate (gesture/sound/word) **only as optional human observations**, child uses concepts during off-screen play, calm session ending.

**Disallowed inference**: “child said N words” from ASR, automated mastery or developmental progress from tapping, speech improvement causally attributed to playtime, treatment efficacy or autism/speech-delay diagnosis.

Recommended discovery: short co-play sessions observed with caregiver assent; avoid recording child audio/video by default. Staff notes require consent and careful storage.

## 11. Product acceptance checklist
- [ ] SLP/caregiver review signs off target words, pause timing, sample scripts, and no-therapy claims (this build: agent review recorded in `07` section 2, owner instruction 2026-10-29).
- [ ] Every P1 episode includes 1–3 target words, clear actions, an invitation to respond and offline play cue.
- [ ] Watch-only is a fully watchable animated story, independent of touch/microphone.
- [ ] No screen can pressure child to speak or punish silence.
- [ ] Parent area can disable music, shorten/stop session, change language pack and leave immediately.
- [ ] Alphabet lessons distinguish letter names/sounds; count objects rather than reciting numerals alone.
- [ ] No personally identifying child data in public pages, clips, telemetry, docs examples, screenshots.
- [ ] Rights/consent checks applied before any family-sourced media or character references are published.
- [ ] AAP screen-media and ASHA language-development guidance linked in parent-facing supporting material, not exaggerated as efficacy proof.

## Sources informing principles (not clinical validation of app)
- ASHA Early Intervention, responsive/engagement-based caregiver strategies: https://www.asha.org/practice-portal/professional-issues/early-intervention/
- ASHA Spoken Language Disorders, focused stimulation and expansion definitions: https://www.asha.org/practice-portal/clinical-topics/spoken-language-disorders/
- AAP *Media and Young Minds*, co-viewing and age-appropriate media: https://publications.aap.org/pediatrics/article/138/5/e20162591/60333/Media-and-Young-Minds
