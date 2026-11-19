# Game feel kit: hit-stop rig, procedural SFX, screen fx, score popups and a seeded RNG

`import { createImpactRig, createProceduralSfx, ScreenFx, flashStrength, vignetteOpacity, drainPopups, GameRng } from "@aura3d/engine/game"`

The pieces every live game rebuilt for contact feel (5.7.0, extracted from the 30 live games' shared feel and runner kits). The rig runs on real frame time, so a hit-stop never freezes the game for good (lessons-learned M2); everything here is presentation-side except `GameRng`, which the simulation owns.

```ts
import { createFixedStepLoop } from "@aura3d/engine";
import { createImpactRig, createProceduralSfx, drainPopups, flashStrength, GameRng, ScreenFx } from "@aura3d/engine/game";

const rng = new GameRng(seed);              // sim: every gameplay draw goes through rng.next()
const rig = createImpactRig();              // presentation
const sfx = createProceduralSfx();
const fx = new ScreenFx();
let popupSeq = 0;

function onHit(strength: number) {
  rig.trigger({ freezeSeconds: 0.045, trauma: 0.5 * strength, fovKickDeg: 3 });
  sfx.play("impact", strength);
  fx.flash("#ffd36b", flashStrength(0.4, reducedMotion));
}

// each rendered frame, with the REAL frame delta
const f = rig.step(realDt);
simulate(f.simDt);                          // 0 while the hit-stop holds
camera.position = add(base, f.shakeOffset); camera.fov = baseFov + f.fovDeltaDeg;
const { fresh, nextSeq } = drainPopups(sim.popups, popupSeq); popupSeq = nextSeq; fresh.forEach(showPopup);
```

- **`createImpactRig({ reducedMotion? })`.** `trigger({ freezeSeconds, trauma, fovKickDeg })` caps the freeze at 0.14 s, clamps trauma to 1 and the FOV kick to -8..10 degrees. `step(realDt)` clamps `realDt` to 0..0.1 s and returns `{ simDt, frozen, shakeOffset, shakeRoll, fovDeltaDeg }`; the shake (1.8/s decay, 0.22 m, 0.04 rad) comes from `createCameraShake`, the freeze from `createHitStop(0)`, and the FOV kick decays at `exp(-9.5 dt)` to exactly 0. Reduced motion (default: the `prefers-reduced-motion` query) zeroes shake and FOV but keeps the freeze. `reset()` after a restart.
- **`createProceduralSfx()`.** Six zero-asset cues (`pickup`, `perfect`, `impact`, `boost`, `whoosh`, `tick`), one oscillator and envelope each, on the shared `AudioContextManager` (unlocked on first use). `play(cue, intensity)` is a silent no-op headless, while the page is hidden or while `setMuted(true)`.
- **`ScreenFx`.** Three click-through fixed layers: `flash(color, strength)` (screen blend, 0.35 s fade), `reveal(color, instant?)` / `clearReveal()` (a disc that grows from 50% 62% over the frame), and `vignette(multiplier, boost, color, seconds, steady?)`. `flashStrength` caps a flash at `REDUCED_FLASH_CAP` (0.1) under reduced motion; `vignetteOpacity` is 0 below x2 and at most 0.5. The event-to-flash mapping stays in the game.
- **`drainPopups(list, nextSeq)`.** A sim keeps the last `POPUP_LIMIT` (64) `ScorePopup`s and never clears them; reading by index stalls once the list is full, so the HUD drains by `seq` and keeps the returned `nextSeq`.
- **`GameRng`.** A seeded counted stream over `createCountedRng`: `next()` draws, `count` says how many draws a run took, so a replay mismatch shows up as a count difference.
- **Prove it.** A unit test steps the rig through a hit sequence on real time and asserts the sim resumes (`frozen` false within 0.15 s) and that `simDt` is never frozen by game time; `node tools/game-checks/run.mjs <slug>` flags hit-stop timers counted on game time (`hitstop-time`).
