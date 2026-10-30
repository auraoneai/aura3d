# PRD 05 — Canonical 20 Episodes, 12 Interactive Games, Vocabulary and Scripts
Status: **CANONICAL CONCEPT BACKLOG; BUILT AS A PROTOTYPE (owner decision 2026-10-29: all 20 episodes and 12 activities are built in this run; the label stays `prototype` until the `06` gates and the device runs pass, so this is not the `06` "Production" label)** · Editorial owner: creative lead + pediatric SLP reviewer; for this build every SLP, educator, caregiver, creative or rights review named in this file is a recorded agent review (`07` section 2), which is not clinical review and relaxes no rule here · Application files under `apps/veer-wonder-world/src/content/` (story) and `apps/veer-wonder-world/src/localization/en/` (text)

## 0. Editorial source of truth and counting rule
Exactly **20 original episode concepts** from the established Wonder World brainstorm; **12 separate interactive mini-games** from the first concept set. Some games and episodes share world, character and vocabulary but are not double-counted. One pilot “Momo's Ball Day” can be a **chapter inside episode #17, Sheru’s Big Adventure**, not a twenty-first required episode.

Pilot P1 episodes: #1, #2, #5, #6, #9 and #17. Pilot P1 games: #G1, #G2 and #G3. The other 14 episodes and 9 activities belong to P2. “Magic Sound Garden” starts as touch-first and only gains sound detection after a separate P3 approval.

**Owner decision 2026-10-29.** P2 is built in the same run as P1; the P1 set stays the golden slice that is verified first. Each story is `src/content/episodes/<slug>.ts` (`export const episode: EpisodeSpec`) or `src/content/activities/<slug>.ts` (`export const activity: ActivitySpec`) with its text in `src/localization/en/{episodes,activities}/<slug>.ts`; the story id is the slug. Line keys are `<code>.<beatId>.<n>` with `<code>` `e01`-`e20` or `g01`-`g12` (for example `e17.hook.1`), and each story has `<code>.title`, `<code>.offline`, `<code>.bridge` and `<code>.tip.<n>` strings. Every manifest carries `review: { language: "approved", rights: "approved", reviewer, date }` from the agent review in `07`.

## 1. Episode format contract
Every episode is an independently enjoyable **watchable short**, generally target 2–4 minutes (a design hypothesis to test), with optional in-story touch moments in Play Together mode:
- Visual hook: one familiar character, one problem, one main toy or action.
- 1–3 **core words** repeatedly matched with action and object (not monotonous looped syllables).
- Natural narrator / character speech, no more than one foreground speaker at once.
- At least one calm invitation to participate, an optional touch/parent confirmation route, and timeout that advances gently.
- If alphabet: one clear uppercase and lowercase letter with accurate letter name / sound distinction; prioritize meaning, not mastery.
- If numbers: count visible distinct objects exactly in sync with 1–3 first; avoid an abstract fast 1–10 sequence as primary teaching.
- Short original song/musical phrase in most episodes; include music-free setting.
- Finite ending with caregiver offline activity and NO auto-next.

## 2. All 20 episodes (canonical list)

### E01 — Momo's Magic Mouth (P1)
**File:** `src/content/episodes/momo-magic-mouth.ts`. **Hero:** Momo. **Core:** “ah,” “oh,” “mmm”; optional “more”.
- **Hook:** Momo sees his reflection in a toy mirror and makes a surprised “Oh!”
- **Action:** Three silly mouth/expression changes paired with the sound *once per beat*, then gestures and a playful little tune; do not show articulatory anatomy as a clinical model. In this build the models have no mouth or face animation (`02` section 2), so each “face” is a body pose, a squash/bob and the mirror reflection, never a lip-sync claim.
- **Turn:** Momo pauses, looks toward child, and optionally reacts to a tap on the mirror or parent-confirmed sound/gesture.
- **Caregiver:** Copy each other's expressions in a real mirror; name what each person does. **Safety:** never reward or score accurate mouth or speech production.
- **Done:** Approved cue timing, visible talking face (the talking pulse in this build), short natural pause and silent-child route.

### E02 — The Peekaboo Palace (P1)
**File:** `src/content/episodes/peekaboo-palace.ts`. **Hero:** Peeko + Momo: **Momo hosts with non-rigged door/baby animal props**, and Peeko (renamed from Pip; built now, with procedural motion) peeks out of a door. **Core:** “open,” “hi,” “bye.”
- **Hook:** A large colourful door wiggles and a tiny friend peeks out.
- **Action:** Two or three doors open slowly; animal/object revealed; narrator names it; visitor waves.
- **Turn:** Tap door OR allow parent to acknowledge child's point; if neither, door opens naturally.
- **Caregiver:** Peekaboo with hands or a blanket, say “Open! Hi!”; **no startle jump cuts**.
- **Done:** At most two doors shown as current choices; closed door clearly labelled by action, not written text.

### E03 — The Alphabet Zoo (P2)
**File:** `src/content/episodes/alphabet-zoo.ts`. **Hero:** Lumi + Peeko. **Core:** “B,” “ball,” “bear” for pilot; other letters later.
- **Hook:** Big friendly B opens a tiny zoo gate; a bear and a ball appear.
- **Action:** Narrator distinguishes letter name “bee” and first sound /b/ in “ball”; each object performs a small visible action.
- **Turn:** Tap either object to make it act; no forced letter choice.
- **Caregiver:** Point to B on a page and find a ball; name rather than quiz.
- **Done:** Phoneme/letter review by educator (this build: agent review, `07`); no claim of independent alphabet learning.

### E04 — GoGo's ABC Train (P2)
**File:** `src/content/episodes/gogo-abc-train.ts`. **Hero:** GoGo. **Core:** “A,” “apple,” “go,” then future single-letter variants.
- **Hook:** Train arrives with one glowing letter carriage; it opens into an actual object.
- **Action:** Apple rolls down a gentle chute; passengers cheer “Apple!” then the train goes.
- **Turn:** Tap carriage/large go control, with narrator providing all word models either way.
- **Caregiver:** Play with real toy train or picture of apple; **one featured letter per short episode**, not 26 rapidly.
- **Done:** Train/letter asset rights and motion mapping signed off (GoGo is procedural, so there are no clips to map; agent review, `07`).

### E05 — Momo's Counting Cookies (P1)
**File:** `src/content/episodes/counting-cookies.ts`. **Hero:** Momo as cookie-loving, original friendly creature; **do not imitate copyrighted Cookie Monster**. **Core:** “one,” “two,” “three,” plus “cookie.”
- **Hook:** Momo finds a plate of three cookies and his tummy rumbles.
- **Action:** Place cookie #1, #2, #3 visibly and count at slow tempo, with one object per spoken number; Momo eats one.
- **Turn:** Tap a cookie or parent indicates next; scene never requires counting aloud.
- **Caregiver:** Count up to three crackers or toy blocks with one-to-one touches.
- **Done:** QA proves count/audio/visible object counts agree in every beat; eat sequence gentle.

### E06 — Lulu's Dino Dance Party (P1)
**File:** `src/content/episodes/lulu-dino-dance.ts`. **Hero:** Lulu. **Core:** “clap,” “go,” “stop,” with “stomp”.
- **Hook:** Lulu's music begins; she takes two slow steps and looks toward viewer.
- **Action:** Clap/clap/clap, slow stomp, “Ready… go!”, then immediate gentle “Stop!” freeze.
- **Turn:** Tap giant play/pause musical drum or stand/move with caregiver; wait is never required to pass.
- **Caregiver:** Do the same go/stop/clap motions away from screen.
- **Done:** Calm music, synchronized motions, motor accessibility and reduced motion.

### E07 — The Magic Colour Machine (P2)
**File:** `src/content/episodes/magic-colour-machine.ts`. **Hero:** Momo + Lumi. **Core:** “red,” “blue,” “ball.”
- **Hook:** An ordinary ball rolls into a magical machine.
- **Action:** Ball emerges red, then blue, while colours are spoken slowly; no intense flashes.
- **Turn:** Tap one of two large coloured toy objects; narration labels chosen colour naturally.
- **Caregiver:** Find a real red item and a real blue item; no timed recognition test.
- **Done:** Contrast and colour-blind usability; colour always reinforced by word/object cues.

### E08 — Where's Sheru? (P2)
**File:** `src/content/episodes/wheres-sheru.ts`. **Hero:** Sheru. **Core:** “where,” “under,” “there.”
- **Hook:** Soft woof comes from beneath a table.
- **Action:** Momo looks under a box, under a bench, then finds Sheru.
- **Turn:** Tap one obvious large hiding spot; any choice leads to gentle next clue.
- **Caregiver:** Hide a stuffed dog under a blanket and find it together.
- **Done:** Predictable reveals, no frantic search/correctness feedback.

### E09 — Baby Animal Orchestra (P1)
**File:** `src/content/episodes/baby-animal-orchestra.ts`. **Hero:** Lulu + original generic animal props. **Core:** “moo,” “baa,” “quack,” “woof.”
- **Hook:** Animals enter one at a time carrying tiny instruments.
- **Action:** Each animal sound is heard clearly once, then instruments make a slow repeating rhythm; animal is visibly shown.
- **Turn:** Tap one large animal for its sound; narrator names it and makes natural brief pause.
- **Caregiver:** Use a toy animal or picture; take turns making fun sounds.
- **Done:** No overlapping animal sounds or shrill harmonies; voices audible over music.

### E10 — Momo's Hungry Belly (P2)
**File:** `src/content/episodes/momos-hungry-belly.ts`. **Hero:** Momo. **Core:** “apple,” “banana,” “eat.”
- **Hook:** Momo's stomach rumbles as he sees a picnic basket.
- **Action:** He discovers two foods; points, names, takes a pretend bite, smiles.
- **Turn:** Choose one of two large food props; avoid pressure to eat real foods.
- **Caregiver:** Name two familiar foods at snack time or with plastic play food.
- **Done:** Child-friendly food depiction; no body size/shame or coercive feeding theme.

### E11 — Number Balloon Rescue (P2)
**File:** `src/content/episodes/number-balloon-rescue.ts`. **Hero:** Lulu + Lumi. **Core:** “one,” “two,” “three,” “up/down.”
- **Hook:** Three gentle balloons start floating up.
- **Action:** Lulu helps bring each down in order; narrator counts each visible balloon and lets child see the full set.
- **Turn:** Tap reachable balloon to bring it down; auto-route eventually rescues all.
- **Caregiver:** Count three blocks or three finger wiggles (no balloons needed).
- **Done:** No visual physics hazard or scene with uncontrolled flying objects/fast camera.

### E12 — The Magic Shape Bakery (P2)
**File:** `src/content/episodes/magic-shape-bakery.ts`. **Hero:** Momo + Lumi. **Core:** “circle,” “square,” “triangle.”
- **Hook:** Dough becomes a circle that bounces gently.
- **Action:** Three big pastry shapes emerge in clear silhouettes; matched with names and familiar objects.
- **Turn:** Tap a large shape to make it wobble; no timed matching requirement.
- **Caregiver:** Find a round plate or square napkin.
- **Done:** Shapes identifiable without colour or text alone.

### E13 — The Silly Robot Factory (P2)
**File:** `src/content/episodes/silly-robot-factory.ts`. **Hero:** Momo + original baby robot. **Core:** “hat,” “feet,” “hands,” “help.”
- **Hook:** The robot accidentally puts a hat on its foot, looks confused then giggles.
- **Action:** Corrects one prop at a time; names body parts accurately, shows helping action.
- **Turn:** Tap a large correct part or ask parent for help; no “wrong choice” scolding.
- **Caregiver:** Show hands/feet/hat with real clothing.
- **Done:** Friendly humour, no disturbing disassembly effects.

### E14 — The Lost Teddy Adventure (P2)
**File:** `src/content/episodes/lost-teddy-adventure.ts`. **Hero:** Momo + Peeko. **Core:** “teddy,” “look,” “find.”
- **Hook:** Teddy is absent from his chair.
- **Action:** Look under a small table, behind a cushion and in a basket; happy reunion.
- **Turn:** Tap a hiding spot, the narrator describes location even if Teddy is elsewhere.
- **Caregiver:** Hide a stuffed toy in the room and find it together.
- **Done:** Suspense stays gentle; no distress about losing someone.

### E15 — Momo's Bubble Universe (P2)
**File:** `src/content/episodes/momo-bubble-universe.ts`. **Hero:** Momo. **Core:** “bubble,” “pop,” “more.”
- **Hook:** One bubble expands and contains a tiny illustrated animal.
- **Action:** Bubble floats, reveals an animal and pops softly; Momo models its name.
- **Turn:** Tap bubble (or wait in Watch mode) to pop; repeat with **different** animal word in next beat.
- **Caregiver:** Blow real bubbles with supervision or play a gentle pretend-pop game.
- **Done:** Clear finite maximum three bubble sequences; no endless tapping loop.

### E16 — The Little Birthday Party (P2)
**File:** `src/content/episodes/little-birthday-party.ts`. **Hero:** Lulu + Momo. **Core:** “cake,” “one,” “blow.”
- **Hook:** Friends decorate a tiny toy cake.
- **Action:** Place one, two or three decorations; pretend to blow candles; sing short **original** birthday tune.
- **Turn:** Tap decoration or imitate blowing naturally; no microphone requirement.
- **Caregiver:** Pretend candle blowing with finger/hand, count with toy cups.
- **Done:** Safety note: no encouragement to play with real flames.

### E17 — Sheru's Big Adventure (P1)
**File:** `src/content/episodes/sheru-big-adventure.ts`. **Hero:** Sheru + Momo. **Core:** “ball,” “go,” “more” (P1 focus); add “bird,” “water” in later variant.
- **Hook:** A red toy ball rolls into Sheru's garden; Sheru wants to fetch it.
- **Action:** Momo labels ball; a visible pause precedes “go”; Sheru gently fetches, carries and returns ball.
- **Turn:** Touch ball OR parent acknowledges gesture/sound; Sheru plays regardless; scene never assesses child speech.
- **Caregiver:** Roll real ball back and forth, model “ball”, “go” and “more.”
- **Done:** Golden vertical slice end-to-end (character GLBs, hit box, narrator, animation, captions, finite ending).
- **Expansion after pilot:** Add bird/butterfly/puddle scenes to the **same episode**, not a separate required episode.

### E18 — Who's at the Door? (P2)
**File:** `src/content/episodes/whos-at-the-door.ts`. **Hero:** Peeko + Momo; optional local family greetings.
- **Core:** “hi,” “bye,” “Mama/Papa” **only if family-approved and appropriate**. This build uses generic friends only: no family names or voices (`MASTER-PROMPT.md` section 6), and no family pack is built.
- **Hook:** Soft doorbell rings; a familiar cartoon friend appears.
- **Action:** Friend enters, waves, says hello, and leaves gently.
- **Turn:** Tap the doorbell or wave with caregiver; no face/camera recognition.
- **Caregiver:** Greet an actual family member or stuffed friend.
- **Done:** Generic default is safe for public release; private photos/voices never in GitHub or public bundles.

### E19 — Momo's Day (P2)
**File:** `src/content/episodes/momos-day.ts`. **Hero:** Momo. **Core:** “wash,” “eat,” “sleep” (variants brush, wake).
- **Hook:** Morning sun rises in the toy bedroom.
- **Action:** Momo washes, eats and goes to bed in three clear short scenes.
- **Turn:** Tap water/food/light to cue next routine; watch-only mode works.
- **Caregiver:** Narrate those same actions in child's real routines.
- **Done:** No bedtime autoplay; end calmly.

### E20 — The Little Story Machine (P2)
**File:** `src/content/episodes/little-story-machine.ts`. **Hero:** Momo + Lumi. **Core:** chosen **two** familiar nouns and an action word per variant.
- **Hook:** Three safe everyday toy props arrive in a magic box.
- **Action:** The props combine into a miniature cause-and-effect story, e.g. “Bear has a ball. Ball rolls.”
- **Turn:** Choose one of two props or allow auto-story; no unpredictable live generated language in MVP.
- **Caregiver:** Make a tiny two-sentence story with two toys.
- **Done:** Curated / preapproved story combinations only; app does not create unreviewed unsupervised LLM dialogue.

## 3. The 12 interactive games (SEPARATE from episodes)

### G01 — Bubble Garden (P1)
`src/content/activities/bubble-garden.ts` · Character: Momo / animal prop.
- **Action**: Tap wand → 3 slow large bubbles, then tap a bubble → soft pop; no precision needed.
- **Words**: “bubble”, “pop”, “more”; one meaningful question at end.
- **Round**: 3 bubbles then “more” request; if no action, pause then gentle automatic closure.
- **Real play**: Blow bubbles with caregiver / pretend-pop bubbles.

### G02 — Go-Go Train (P1; GoGo's generated model is built now, with a primitive stand-in while it is missing; don't claim final until approved)
`src/content/activities/gogo-train.ts`.
- **Action**: Tap GO to start train, STOP to halt; choose one of two passengers.
- **Words**: “go”, “stop”, “in”, “bye”; “ready...go!” pause.
- **Round**: One circuit; train returns to station automatically; no high-speed gameplay.
- **Real play**: Move a toy train or car, alternating “go” and “stop.”

### G03 — Sheru's Ball Game (P1)
`src/content/activities/sheru-ball.ts`.
- **Action**: Tap ball → roll, Sheru fetch → returns → another turn or finish.
- **Words**: “ball”, “go”, “more”, “hi”.
- **Round**: Three fetches max by default, parent override end anytime.
- **Real play**: Roll a real ball with a person or plush puppy.

### G04 — Peekaboo Animal Barn (P2)
`src/content/activities/peekaboo-animal-barn.ts`.
- **Action**: Tap big barn door, reveal an animal; repeat twice with distinct animals.
- **Words**: “open”, “hi”, cow/duck/horse names, simple animal sounds.
- **Real play**: Open boxes, hide toys, say “hi/bye.”
- **Note**: No frightening surprise.

### G05 — Teddy's Snack Picnic (P2)
`src/content/activities/teddy-snack-picnic.ts`.
- **Action**: Choose from apple/banana; tap Teddy to offer food, see him pretend eat.
- **Words**: “apple”, “banana”, “eat”, “more”, “all done.”
- **Real play**: Name foods during real snack or feed toy bear.
- **Note**: No feeding pressure.

### G06 — Splashy Car Wash (P2)
`src/content/activities/splashy-car-wash.ts`.
- **Action**: Tap water, tap/sweep sponge, tap towel; automatic snapping.
- **Words**: “wash”, “wet”, “dry”, “car.”
- **Real play**: Wash toy car with cloth (with adult).
- **Note**: No rewarded frantic scrubbing.

### G07 — The Little Lift (P2)
`src/content/activities/little-lift.ts`.
- **Action**: Tap bear → enters lift; tap up/down one floor; door opens.
- **Words**: “in”, “out”, “up”, “down”, “open.”
- **Real play**: Move toy up/down on box.
- **Note**: No trapping/fear scene.

### G08 — Build and Tumble (P2)
`src/content/activities/build-and-tumble.ts`.
- **Action**: Tap to place 1–3 large blocks, tap tower to topple gently.
- **Words**: “one more”, “up”, “down”, “block.”
- **Real play**: Stack three large toy blocks and knock them down.
- **Note**: Number spoken only when associated block becomes visible.

### G09 — Family Doorbells (P2)
`src/content/activities/family-doorbells.ts`.
- **Action**: Tap doorbell, show approved cartoon relative or default friendly character, wave.
- **Words**: “hi”, “bye”, family names (only with consent), “door.” This build uses generic friends only: no family names or voices (`MASTER-PROMPT.md` section 6).
- **Real play**: Wave to a family member or toy.
- **Privacy**: Optional private local file pack, never committed/public.

### G10 — Bear's Little Band (P2)
`src/content/activities/bears-little-band.ts`.
- **Action**: Tap drum/shaker → one note; Bear responds then “your turn.”
- **Words**: “boom”, “clap”, “my turn”, “your turn.”
- **Real play**: Clap or tap table gently in turns.
- **Note**: No loud cacophony from repeated taps.

### G11 — Magic Sound Garden (P2 tap version; P3 optional input)
`src/content/activities/magic-sound-garden.ts`.
- **Action**: Tap flower → opens; sound-presence optional later after privacy and device review.
- **Words**: “hello”, “open”, “flower”, simple fun sounds.
- **Real play**: Pretend plants bloom with hand gestures.
- **Note**: An audible sound event is not evidence a particular word was spoken.

### G12 — Find My Real Toy (P2)
`src/content/activities/find-my-real-toy.ts`.
- **Action**: Shows ball/book/teddy; app pauses; caregiver confirms the real object was found; story ends.
- **Words**: “find”, object name, “there.”
- **Real play**: The entire activity culminates away from the screen.
- **Note**: No camera tracking, object recognition or automatic assertions about child behaviour.

## 4. Pilot scripts and cue outlines (production writing seeds)
Full narration/localized audio is produced and reviewed per story file; the rows below are the seeds. These are authored **beat maps**; character lines illustrate desired level and must be approved. In this build the English lines are recorded with ElevenLabs premade voices through Kiro Prism (casting in `07` section 3.1) and approved by agent review (`07` section 2).

| Pilot episode | Beat 1 hook | Beat 2 model/meaning | Beat 3 child turn | Beat 4 musical/visual payoff | Beat 5 finish |
| --- | --- | --- | --- | --- | --- |
| E01 Magic Mouth | Momo sees toy mirror, “Oh!” | Three expressive faces, “ah,” “mmm” | Momo waits; touch mirror or parent participates | Silly short face song | “Bye, Momo!” + real mirror |
| E02 Peekaboo | Door moves, “Who?” | “Open ... hi, duck!” | Tap or look/point with parent | Visitor waves and hides again | Hands peekaboo |
| E05 Cookies | Momo finds plate | Cookies 1, 2, 3 visibly placed | Tap to choose one | Count while Momo pretend eats | Count three blocks |
| E06 Dino Dance | Lulu hears a rhythm | Clap / stomp / stop paired with body action | Parent and child clap or tap drum | Original go/stop song | Physical clap-stop game |
| E09 Orchestra | Chick starts concert | Cow/moo, sheep/baa, duck/quack | Tap or imitate a sound | Slow friendly band flourish | Toy animal sounds |
| E17 Sheru Adventure | Ball rolls away | “Ball!” “Go, Sheru!” | Tap/parent/quiet auto route | Fetch/return with “more” invitation | Roll real ball |

### Detailed golden episode: E17 / Sheru ball chapter
1. `greet` 0–12 s: Momo waves “Hi!”; Sheru sits nearby, ball partly visible.
2. `hook` 12–30 s: ball rolls slowly, Sheru follows with eyes; Momo: “A ball! Look at the ball!”
3. `model` 30–50 s: Momo points: “Ball.” Sheru noses ball; camera remains fixed.
4. `invite` 50–60 s: Momo says “Ready...” then pauses. A big ball target is highlighted **gently**. Watch mode continues naturally.
5. `event` 60–90 s: on child tap OR parent-confirm OR gentle watch-mode progress, ball rolls and Sheru retrieves; Momo: “Go! Sheru goes!”
6. `repeat` 90–130 s: Sheru returns; Momo: “More ball?” Child can tap again; if silent the story continues without negative feedback.
7. `song` 130–155 s: short “Ball rolls” song with two distinct rolls.
8. `outro` 155–175 s: “All done! Bye, Sheru.” End card suggests real ball play. No next episode autoplay.

**Important**: Timestamp targets are draft content pacing, not verified durations. Narration timing and animation must be reconciled with recorded audio, and parent/SLP user tests may revise pace.

## 5. Cross-content vocabulary reinforcement
| Word/concept | Episode(s) | Activity(s) | Offline connection |
| --- | --- | --- | --- |
| More / again | E15, E17 | G01, G03, G05 | Another roll/bubble/turn |
| Ball | E03, E07, E17, E20 | G03, G12 | Real ball rolling |
| Go / stop | E04, E06, E17 | G02, G03 | Real toy car or movement |
| Open / hi / bye | E02, E18 | G04, G09 | Peekaboo and door greetings |
| Animal sounds | E09, E03 | G04 | Toy animal turn taking |
| One, two, three | E05, E11, E16 | G08 | Count blocks/fingers |
| Up / down | E11 | G07, G08 | Raise/lower blocks |
| Eat / food | E10, E19 | G05 | Real mealtime naming |
| Letter B / /b/ | E03, E04 | Optional object letter overlay, not mandatory quiz | B book/page + ball |

## 6. Content acceptance checklist per episode
- [x] Exact stable slug matches implementation file and catalog. Done: all 32 `src/content/{episodes,activities}/<slug>.ts` files export an `id` equal to the file name, at the paths named in sections 2-3 and with a matching file in `src/localization/en/`, and the catalog lint (`src/content/schema.ts:1455-1471`) checks slug, phase and order against `EPISODE_SLUGS` and `ACTIVITY_SLUGS` (`:114-126`; `tests/unit/content/content-schema.test.ts` "lists the canonical 20 episodes, then the 12 activities").
- [x] Story lasts a finite short period, with identifiable hook, action and ending. Done: the lint opens each episode with a greeting and ends it on an outro that waits for nothing (`src/content/schema.ts:634-676`) and keeps it at 120-240 s measured with its recorded audio (`:1258-1276`; all 20 run 122-137 s with no taps, commit `908b17a69`); every episode has a `hook` beat and `model` or `event` action beats, and `tests/unit/app/app-flow.test.ts` "finishes every episode and activity with zero input in both modes and ends on its offline card".
- [x] Core words no more than three meaningful everyday language targets where feasible (counting/animal-sound cluster is an explicit editorial exception). Done: the lint allows 1-3 target words and 4 only for a counting or animal-sound cluster (`src/content/schema.ts:603-619`), each linked to its story in the PRD core-word tables (`:1520-1526`; `tests/unit/content/content-schema.test.ts` "allows four target words only for counting and animal-sound clusters"); 16 episodes list 3, E18 lists 2, and E05, E11 (counting) and E09 (animal sounds) list 4.
- [x] Target words heard with visible object/action and at least one meaningful variation. Done: each `words` entry needs a line of its beat that says the word (`src/content/schema.ts:845-852`) and an object visible during the beat (`:1134`), and `checkTargetCoverage` (`:1239-1256`) requires every episode target word in at least two different lines, spoken or sung (`tests/unit/content/content-schema.test.ts` "requires each episode target word in at least two different lines, spoken or sung (PRD 05 section 6)"); the content lint passes for all 20 episodes (E16 "one": "One! One balloon." and "One candle! Let's sing.").
- [x] Child is invited to act or respond but silence/tap/gesture (parent-confirmed) never fails. Done: the lint requires an invite beat with input in every story (`src/content/schema.ts:669-671`) and every wait ends by itself (`src/types.ts:112-118`); `tests/unit/runtime/turn-taking.test.ts` "resolutions are only tap, parent or timeout: there is no wrong-answer branch", `tests/unit/runtime/episode-director.test.ts` "a parent confirm ends the wait exactly like a tap (only the tap count differs)", and `tests/unit/app/app-flow.test.ts` "finishes every episode and activity with zero input in both modes and ends on its offline card" and "plays every story to its end in Play Together with a tap on the first active target at every wait (06:36, QA-E03)".
- [x] Watch-only mode completes automatically with original approved narration. Done: `tests/unit/app/app-flow.test.ts` "finishes every episode and activity with zero input in both modes and ends on its offline card" and `tests/unit/runtime/episode-director.test.ts` "watch-sing plays the same story as play-together when nobody taps, and taps still work"; all 843 lines are recorded with ElevenLabs premade voices (`07` section 3.1) from their current text (`tools/validate-content-entry.ts:120-179`), and all 32 manifests carry the approved `review` (`src/content/schema.ts:569-573`), the agent review of `07` section 2.
- [x] Parent co-play hint and real-world extension are specific. Done: every episode has 2-4 `<code>.tip.<n>` hints on its beats plus `<code>.offline` and `<code>.bridge` strings (lint `src/content/schema.ts:836-842`, `:858-869`), each naming real objects and actions (for example E01 a real mirror, E05 three crackers or blocks with one touch per number, E13 a hat on a teddy's foot), shown to the grown-up during the beat and on the end card (`tests/unit/app/app-flow.test.ts` "turns caregiver keys into the parent tip text, and null hides the tip"; `src/ui/offline-card.ts`).
- [ ] Letter/phoneme and quantities are accurate; validated native translations when offered. Open: the line text keeps each letter's name and sound apart and every count matches its visible objects (`tests/unit/content/letters-and-counts.test.ts` "features B in E03 and A in E04, one letter each, with name and sound apart"; agent review `07` section 2.1), and no translation is offered (the Punjabi pack ships disabled, `07` B16), but the recorded letter clips still need a person's listening check (`07` §4.3 item 1).
- [x] All assets/audio/music original or licensed; no family PII in public build. Done: `src/assets/rights-manifest.ts` has a licence record for every admitted model, every audio file (none free-tier) and each CC0 look HDRI (`tests/unit/content/rights-manifest.test.ts` "has a record for every recorded audio file, none of them free-tier"), the birthday song is original (`tests/unit/content/content-schema.test.ts` "use an original birthday song and one letter (B, for E03) in the letter song"), and the agent rights review is `07` section 2.3; `tests/unit/privacy/no-child-data.test.ts` "keeps the child's name out of every shipped source file but the owner's welcome: code, string literals and comments", and remote run `wonder-first-frame-build-20261029T174544Z` (`tests/browser/wonder-world-build.spec.ts`) scans the built bundle for source maps and the child's name. Owner exception (07 O8, 2026-10-29): the start screen's welcome names the child, from the one constant `WELCOME_NAME` in `apps/veer-wonder-world/src/personal.ts`. The guards allow that constant in the sources and one string literal in the build, and fail any other occurrence; every story line, caption, UI string, key, route and title stays generic, and `WELCOME_NAME = null` removes the name.
- [x] Reduced-motion, low-sound, pause and immediate all-done are tested. Done: unit tests cover reduced motion (`tests/unit/runtime/episode-director.test.ts` "uses the reduced-motion stage when asked, and setReducedMotion applies from the next beat"; `tests/unit/stage/character-registry.test.ts` "reduced motion halves gesture amplitude and drops idle loops"), low sound (`tests/unit/runtime/audio-mixer.test.ts` "music off stops songs and the bed; music on brings the bed back"), pause and All done (`tests/unit/app/app-flow.test.ts` "freezes the story and its media on pause and continues from the same place on resume" and "ends calmly on the offline card when All done is pressed at any beat"), and remote runs `wonder-audio-and-pausing-20261029T172337Z` (`tests/browser/wonder-world-audio-and-pausing.spec.ts`) and `wonder-low-motion-20261029T172337Z` and `wonder-low-motion-2-20261029T172337Z` (`tests/browser/wonder-world-low-motion.spec.ts`, `tests/browser/wonder-world-low-motion-2.spec.ts`) test them in the browser on E17.
- [x] QA recorder proves no extra repeated/overlapping lines or missing animated action. Done: remote runs `wonder-playback-episodes-20261029T172337Z` (`tests/browser/wonder-world-playback-episodes.spec.ts`) and `wonder-playback-episodes-2-20261029T172337Z` (`tests/browser/wonder-world-playback-episodes-2.spec.ts`) check each episode's `state().spoken` against the authored order (nothing unknown, repeated, out of order or missing, every beat visited) and an empty stage `diagnostics().warnings` (`checkSpokenOrder` and `expectStoryRecord` in `tests/browser/wonder-world-lib.ts`), and `wonder-audio-and-pausing-20261029T172337Z` (`tests/browser/wonder-world-audio-and-pausing.spec.ts`) checks that two recorded voice lines never sound at once, as `tests/unit/runtime/narration-player.test.ts` "never lets two lines overlap" does at unit level.

## 7. Activity acceptance checklist per game
- [x] One big primary action; optional 2-choice controls, no written directions necessary. Done: a beat has at most two tap targets (`src/content/schema.ts:154`; `tests/unit/app/app-flow.test.ts` "never shows more than two tap targets, and the stage and touch router always agree") and the stage gives each a hit rectangle of at least 128 x 128 CSS px (`tests/unit/stage/spots.test.ts` "gives every target a rectangle of at least 128 x 128 CSS px inside the canvas, around its centre"); each activity's round is one action on one big object (for example the ball in G03, the barn door in G04, the drum in G10), and its invitations are spoken while the target is highlighted, so nothing has to be read.
- [x] Same action available by tap and parent-confirm, optional sound **never required**. Done: a tap and the grown-up's confirm end a wait the same way (`tests/unit/runtime/touch-router.test.ts` "a routed tap and a parent confirm give the same story outcome"; `tests/unit/app/app-flow.test.ts` "offers the grown-up's confirm exactly while each turn waits, in every story"), all 12 activities declare `options: { allowTap: true, dragAlternative: "tap", microphoneRequired: false }` (lint `src/content/schema.ts:574-578`), and the app uses no microphone or speech API (`tests/unit/privacy/no-child-data.test.ts` "uses no microphone, camera, screen-capture or speech-recognition API anywhere in the app").
- [x] Deterministic and finite round; on no interaction, calm wait then guide/finish. Done: every activity has `roundLimit: 3` (the lint allows 1-5 and needs a last `more-or-done` beat, `src/content/schema.ts:648-656`) and 5000 ms waits; `tests/unit/runtime/episode-director.test.ts` "silence plays the intro, one round and the outro", "a timeout on more-or-done goes to the outro" and "the same events always give the same effects and snapshots"; after a quiet wait the beat's response models the action (for example `g03.roll.2` "Go, ball!"), and playing all three rounds takes 88-155 s (`checkDuration`, cap 360 s).
- [x] Core word linked directly to event; narrator encourages, not grades. Done: each activity target word is named in a beat's `words` with the object that acts and said in that beat (`src/content/schema.ts:845-852`, `:1134`, `:1239-1245`), for example G06 "wet" on the car after the splash and G10 "boom" on the drum; the lint rejects the banned phrases (`:182-185`), the `07` section 2.1 scan finds no grading word in any line, and no director effect carries a wrong or fail state (`tests/unit/runtime/episode-director.test.ts` "random event streams never break the safety invariants and always reach an ending").
- [x] Parent-guided physical equivalent displayed at finish. Done: the director ends every story with `finished` and then `offline` (`src/runtime/episode-director.ts:121-130`), the end card shows the story's offline text and bridge with no timer (`src/ui/offline-card.ts`), all 12 activity offline strings describe a physical activity with a grown-up (`src/localization/en/activities/*.ts`, for example G08 stacking three real blocks), and remote run `wonder-playback-activities-20261029T172337Z` (`tests/browser/wonder-world-playback-activities.spec.ts`) checks that the card is visible after each activity.
- [x] No accidental endless reward loop, sensitive data, ads or loud stimulation. Done: rounds stop at `roundLimit: 3` (at most 5, `src/content/schema.ts:648-649`) and nothing plays next (`tests/unit/runtime/session-gate.test.ts` "never plays the next story by itself"); `tests/unit/privacy/no-child-data.test.ts` "contains no analytics, advertising, crash-reporting or tracking code" and "stores only the allow-listed fields, even when it is handed identity data"; effects are soft and capped (`tests/unit/content/content-schema.test.ts` "keep effects soft and short and beds calm, quiet instrumental loops"; `tests/unit/runtime/audio-mixer.test.ts` "rate limits repeats and caps how many sound at once").
