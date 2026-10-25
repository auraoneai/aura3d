# Game rework prompt: physics, animation, gameplay, naming and screenshots

Status: v1, 2026-10-24. Agent-handoff prompt (policy section 6). Source: the owner's live playtest on an Apple M4 Max, eight screenshots, 2026-10-24. Give this whole file to each lane agent together with its game's section.

## 0. Mission

Eleven playable games look right in a still frame and are wrong in motion. A player notices within seconds that the character does not hold the bat, does not dribble, does not kick, does not move his legs, rams a gate with no consequence, or has nothing to do. Fix the games so the motion, contact and goals are believable, prove each fix with measurable checks (not by eye alone), rename the games so each is its own game, and retake every screenshot.

Success is what a first-time player sees and feels in the first 60 seconds. Unit tests that pass while the bat lies on the ground are a failure.

## 1. Global rules (apply to every lane)

- Aura3D library only. No three.js, no vendored engines, no local copies of things the library provides (QA hooks, fixed-step loop, safety net, cue bank, chase camera, toon pass, objective marker). If the library lacks a primitive you need (hand-socket attach, stride-synced locomotion, impact response, hit-stop), add it to the library additively with tests, document it in `docs/api/`, then use it from the game. Do not hand-roll it inside one game.
- Read before you start: `AGENTS.md` fast path, `docs/agents/build-a-game.md`, `docs/agents/claims-and-boundaries.md`, `docs/agents/art-direction.md`, `docs/audit/game-leftovers.md`, the game's `PORTING-NOTES.md` (ports) and `evidence/<game>/` (latest frames).
- Never run `pnpm` in a worktree with symlinked `node_modules`; call `node_modules/.bin/*` directly. Work in a separate worktree off `origin/main`. Browsers only via `tools/remote-acr/run.sh` (software WebGL2), never local Playwright or Docker. No GitHub Actions.
- Sim stays deterministic and replayable. If a fix changes simulation behaviour on purpose, regenerate the game's reference replay, record the reason in the commit, and keep determinism (same seed, same hash twice).
- Licensed fonts only (`/Users/gurbakshchahal/fonts/README.md`), dense UI preset. Kiro Prism for any LLM or Meshy call; Meshy only with text prompts, every call reserved in the credit ledger (`aura3d meshy ledger`; uncapped by owner decision 2026-10-25, tracked for visibility), never image-to-3D from other games' frames.
- Do not copy art, names, characters, logos or text from the games these were inspired by (`docs/workflows/crayon-game-reverse-engineering.md` section 4).
- Commit by path with the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer, add one line per game under `## 4.1.3 (unreleased)` in `CHANGELOG.md` (rebase on conflict), push to `origin main`. Do not deploy or publish.

## 2. Shared engineering fixes (one library lane, others depend on it)

Owner lane: `rework-library`. Land these first (additive, tested), then the game lanes consume them.

1. **Hand-socket attach.** `attachToBone(model, boneName | socketName, { position, rotation, scale })` that follows a skinned bone every frame after animation, with a debug draw. Needed for bats, clubs, rackets, balls held at the hand, gloves. Test: the attached node's world position equals the bone's world position within 1e-4 at 100 sampled animation times.
2. **Stride-synced locomotion.** A helper that drives walk/run clip speed and blend from actual ground speed (clip cycle length versus stride length), with idle/walk/run/sprint blending, turn-in-place and foot-slide measurement. Test: foot slide (horizontal foot speed while the foot is planted) under a threshold at 5 speeds. For rigs without clips: a procedural leg-swing fallback (hip and knee angles from stride phase).
3. **Foot-slide metric tool.** `aura3d evidence` or a test helper that records the planted foot's world velocity over a run and fails above a threshold (start at 0.15 m/s planted-foot drift). This is the objective version of "he is just sliding".
4. **Impact response kit.** For solid obstacles: swept-sphere or swept-box collision against static colliders (no tunnelling at 4x speed), restitution and friction params, `onImpact({ normal, speed, point })` event, plus the standard feedback bundle: hit-stop (30 to 80 ms), camera shake scaled by speed, impact sound via the cue bank, particle burst, damage or slow-down. Test: a body at 3 speeds against a wall and a gate stops, slides or bounces as configured, and the event fires once per contact.
5. **Pose smoothing.** Fixed-step render interpolation and a critically damped follow for characters and cameras so there is no jitter between sim steps. Test: second difference of position over a steady-state run stays under a threshold.
6. **Double-frame detector.** A QA check that flags duplicated skinned meshes (two draws of the same skeleton with different phases) and double-blended clips. Test fails when the draw list contains two meshes bound to one skeleton.

## 3. Per-game lanes (diagnosis from the screenshots, required fix, acceptance)

Fix the game first, then retake its screenshots (section 5). Each acceptance item must be measured through the game's QA hooks and recorded in `evidence/<game>/rework/` with a README.

### 3.1 Aura Diamond 3D (baseball), `apps/showcase-aura-diamond-3d`
- **Seen:** the batter stands with empty hands while the bat floats or lies on the ground beside him (image 11).
- **Fix:** attach the bat to the batter's hand socket; idle stance holds the bat at the shoulder; swing animation moves the bat through the hitting zone and the bat collider follows the bone. Ball contact comes from the bat's swept collider, with the contact point deciding launch angle and spin. Catcher and fielder gloves attach the same way.
- **Accept:** bat world position within 5 cm of the hand bone for every frame of idle, swing and follow-through; ball hit by the bat leaves in the direction implied by contact normal; replay hash stable; frames show the bat in hand in idle, wind-up, contact and follow-through.

### 3.2 Aura Hoops 3D (basketball), `apps/showcase-aura-hoops-3d`
- **Seen:** the game crashes (owner report) and the physics is wrong (images 12 and 13): players stand in a loose group with arms bent unnaturally and stretched shoulder skinning, jersey textures show torn shard artifacts, and the ball never connects to a dribbling hand.
- **Fix, in order:**
  1. Reproduce the crash (remote run with `?diag=1`, capture console and stack, check for black-frame guard, NaN, empty arrays, out-of-memory from asset sizes). Fix the root cause, add a regression test.
  2. Dribble: ball bounces on the floor with real gravity and restitution, and is struck down by the handler's hand at the bottom of each bounce (hand bone world position drives the contact, with a dribble animation that matches the bounce period). Pass, shoot, steal and loose-ball states transfer ball ownership with physics and no teleporting.
  3. Skinning: fix the stretched arms and shoulder deformation (bind pose, weights, scale of the rig, clip retarget) and the jersey texture shards (re-bake or re-generate the texture, check UVs and mip bias).
  4. Shot arc: ball follows a ballistic arc to the rim; rim and backboard colliders deflect; make and miss are decided by the physics.
- **Accept:** 10 minutes of automated play (QA hooks, auto mode) with zero console errors and no crash; 20 dribble cycles where the ball-to-hand distance at contact is under 12 cm; foot slide under threshold for all five players; frames show arms in natural poses; made baskets and rim bounces both occur in the auto run.

### 3.3 Aura FC 3D (football), `apps/showcase-aura-fc-3d`
- **Seen:** kicking does not show a kick, and players look double-framed (a ghost or doubled pose) in motion (image 14).
- **Fix:** animation-driven kicks with a foot-ball contact window (plant foot, swing, contact, follow-through); the ball is struck only when the kicking foot's swept collider meets it, and the impulse depends on contact speed and angle. Find the double-framing source (duplicated skinned mesh, two clips both applied, or additive blend left on) and remove it using the double-frame detector. Run, turn and tackle animations use stride-synced locomotion.
- **Accept:** a scripted pass and a scripted shot each show plant, swing, contact, follow-through in frame sequences; ball impulse direction matches foot swing direction within 15 degrees; double-frame detector is clean; foot slide under threshold.

### 3.4 Aura Links 3D (golf), `apps/showcase-aura-links-3d`
- **Seen:** the golfer is far too slanted at address (image 15): the whole body leans about 20 degrees with the club shaft nearly parallel to the leg.
- **Fix:** correct the address posture (spine tilt 25 to 35 degrees from the hips, knees flexed, head over the ball, arms hanging, club grip at the hands, club face on the ground at the ball) and the backswing, downswing and follow-through arc. Attach the club to the hand socket; the ball is struck by the clubhead's swept collider at the bottom of the arc, and shot power and direction come from swing speed and face angle.
- **Accept:** posture angles recorded and within the ranges above at address; clubhead position within 3 cm of the ball at impact; frames show a believable address, top of backswing, impact and finish.

### 3.5 Strange Orbit, `examples/strange-orbit-port` and wrapper
- **Seen:** the player can hit other bridges and buildings and nothing happens.
- **Fix:** use the impact response kit: static colliders on bridges, buildings and rails with swept collision; on hit apply restitution and speed loss, spin or bounce, hit-stop, shake, sound and a lap or race penalty according to the game's rules. Make sure colliders match the visible meshes (no invisible gaps, no invisible walls).
- **Accept:** driving the player into 6 different bridge or building surfaces at three speeds produces a stop, slide or bounce (never pass-through) and one impact event each; the replay for the existing race still matches its reference unless intentionally changed.

### 3.6 Serpentine Sky Run, `examples/saiyan-snake-way-port` and wrapper (image 16)
- **Seen:** the runner shakes and bounces far too much.
- **Fix:** find the source (camera follow jitter, sim-to-render interpolation, animation root bob, ground snapping every frame, gravity tick rounding) and remove it: fixed-step interpolation, a critically damped camera, ground contact that does not re-snap each step, and a reduced vertical bob amplitude that still shows the run cycle.
- **Accept:** second difference of the character's rendered height and the camera position at steady speed under a small threshold (record the before and after numbers); frames at 10 consecutive steps show stable framing.

### 3.7 HEATSINK, `examples/heatsink-port` (and the index game `apps/showcase-heatsink`)
- **Seen:** nothing to do. The player flies around and cannot hit or kill anything or score.
- **Fix:** give the game goals. Time Trial gets a clear target (lap time and medal thresholds, shown in the HUD). Add combat or collection: destructible target drones and barrels with hit points and score values, pickups that matter, a combo or style meter, takedowns with explosion feedback, and a results screen with medals. Keep the replay of the existing physics exact for the movement part; new rules are additive and covered by their own replay. Check `PORTING-NOTES.md` for what the original had so the new loop matches the mechanics, not the art.
- **Accept:** a scripted run destroys at least 5 targets and scores points; HUD shows score, targets left and medal progress; the results screen appears at the finish; a fresh player has a stated objective on screen from second 1.

### 3.8 Ninja Runner, `examples/ninja-runner-port`
- **Seen:** no physics effect when the player rams into a gate.
- **Fix:** gate becomes a physical obstacle: running into it triggers the impact response (stumble or stop, knock-back, hit-stop, shake, sound, particle burst, health or speed penalty, wooden gate pieces that break or swing when hit at speed). Success paths (slide, jump, or break at sprint) keep working.
- **Accept:** ramming the gate at walk, run and sprint produces distinct outcomes, each with one impact event and visible feedback; no pass-through; replay updated if rules changed, with the reason recorded.

### 3.9 Where the Wind Wanders, `examples/where-the-wind-wanders-port` (image 17)
- **Seen:** the hooded character slides; legs do not visibly move.
- **Fix:** stride-synced locomotion: walk and run clips (or procedural leg swing if clips are missing or locked) driven by ground speed, plus turn-in-place and idle. If the Meshy rig lacks usable leg weights, re-rig or re-generate with the Meshy rig and animate flow, within the credit cap.
- **Accept:** foot slide under threshold at walking and running speeds; frame strips of one full stride show alternating leg positions; legs visibly move in frames.

### 3.10 Cloud Runner / Kid Goku Beyond the Clouds, `examples/kid-goku-beyond-the-clouds-port` (image 18)
- **Seen:** the kid slides forward; legs do not move.
- **Fix:** same as 3.9: stride-synced run cycle, jump and land animations, idle, plus a visible hop at bridge edges. Keep the existing gameplay (spirit orbs fill the cloud gauge) and its hint text. (If the owner's "cloud runner" is a different route, apply the same fix to it and report which one it was.)
- **Accept:** same as 3.9, plus the jump and landing show distinct poses.

### 3.11 Remaining games (check, fix if the same faults show)
Run the same motion audit on every other game (the remaining index games and ports: Apex Overdrive, Iron Crown, Pips Big Leap, Bunker Zero, Slingshot Siege, Dot Dash, Cross Hop, Splat Rush, Silt and Signal, Last Train, Drift and Deliver, Teleoperator, Aura Slam): foot slide, held items attached, impacts with consequences, shake, double frames, a stated objective. Record findings in `docs/audit/motion-audit.md` and fix the ones that fail.

## 4. Naming: every game is its own game

- No game title, page title, meta description, Open Graph or Twitter tag, HUD text, menu, loading screen, card or index entry may contain "Aura3D port", "port", "reconstruction" or the original game's name. Each game gets a unique title that is not the original's and not a trivial variation (examples of the pattern: a short evocative name plus a genre tag). Propose names in `docs/workflows/game-names.md` with a one-line pitch per game; ensure no collision with a known trademark (do a web check through Kiro Prism web search); then apply them everywhere: `index.html` titles and meta, `route-health.json`, `apps/showcase-index`, `llms.txt` mirrors, README tables, wrapper app names, evidence folders' headings (folder slugs may stay).
- Keep one neutral provenance line where `docs/agents/claims-and-boundaries.md` requires it, in a credits or about link (for example "Built with Aura3D"), not in the title or main UI. Where this conflicts with a claims-boundary requirement, follow the claims document for the legal text and note the conflict in your report so the owner can decide.
- Do not rename npm packages or published template ids. Redirect old slugs on the site so existing links keep working.

## 5. Screenshots: retake everything

- Every game's screenshots, cards and social images are out of date. After each fix lands, retake from the remote runner at fixed deterministic states: title, early gameplay, a key action (the bat swing, the dribble, the kick, the gate hit), mid-action, results. 1280x720 and 390x844, plus a 1x and a 2x frame for the card image.
- Store under `evidence/<game>/screens/<date>/` with a README (commit SHA, runner, software GL labelled, states). Update the index cards (`apps/showcase-index/index.html`), per-game OG images, `llms.txt` mirrors and README thumbnails from these frames.
- The owner will confirm real-GPU appearance on their Mac: list the games for that checklist in the final report, never claim GPU parity from software-GL frames.

## 6. Verification and acceptance (all lanes)

- [ ] Each section 3 acceptance item recorded with numbers in `evidence/<game>/rework/README.md` (before and after).
- [ ] Foot-slide, attach-distance, impact-event and shake metrics all pass in a remote run per game; no console errors; no black-frame guard reloads.
- [ ] Replay: each game's replay tests green; any intentional change documented and its reference regenerated, with two identical hashes.
- [ ] `vitest` for touched files; typecheck; `public-example-boundary` test; `check:skills`; docs link check; root-exports check.
- [ ] Frame strips (6 to 10 frames) per fixed motion committed and linked from the README, so a reviewer can see the motion without running the game.
- [ ] Names changed everywhere (rg for the old titles and for "port" in `apps/showcase-*/index.html`, `route-health.json`, index, README, `llms.txt`); redirects work.
- [ ] Screenshots retaken and wired into cards.
- [ ] Final report per game: what was wrong, root cause, fix, measured before and after, remaining issues, and what the owner must check on real hardware.

## 7. Lane plan (parallel, disjoint ownership)

- `rework-library`: section 2 (library only), lands first within about 90 minutes; game lanes may start by reading and diagnosing and take the library APIs once pushed.
- `rework-diamond`, `rework-hoops`, `rework-fc`, `rework-links`: sections 3.1 to 3.4.
- `rework-orbit`, `rework-serpentine`, `rework-heatsink`, `rework-ninja`, `rework-wind`, `rework-cloud`: sections 3.5 to 3.10.
- `rework-audit`: section 3.11 motion audit across the rest.
- `rework-names`: section 4, then `rework-screens`: section 5 after the game lanes push.
- Each lane owns only its game's files (`apps/showcase-<slug>`, `examples/<name>-port`, tests and evidence for it). Shared files: edit minimally with a test and list them in the report.
