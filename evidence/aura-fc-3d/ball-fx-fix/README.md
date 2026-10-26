# Aura FC 3D: ball physics, camera shake and particle clusters (4.3.1)

Software WebGL2 on the remote runner (640x360). Not real-GPU evidence.

## What is verified

- **Particle clusters (root cause).** `createGameEffects` forwarded every hit, kick and goal to `app.effects.spawn`, a
  continuous emitter that nothing stopped. Baseline run `fcball-b` (old effects code): 196 particles alive at the peak and
  190 still alive 5 s later; `baseline/goal_150.jpg` shows the yellow-green fountains still running 1.5 s after the goal.
  Unit test `tests/unit/engine/game-effects-one-shot.test.ts`: 26 live particles at 0.2 s, 190 at 3 s on the old code, 0 after the fix.
- **Ball.** `tests/unit/aura-fc-3d/ball-physics.test.ts` measures trajectories (20 m/s ground pass rolls 43.7 m and stops,
  bounce heights each 0.5-0.6 of the last, curl direction, quaternion roll v/r). CPU match: median pass apex 1.28 m before,
  0.18 m after; 84% of passes reach the intended receiver (81% before). `frames/kick_*.jpg`: the ball rolls on the turf after the strike.
- **Shake.** Trauma-layer test: stacked events capped at maxTrauma 0.7, peak rotation 0.2 degrees, settled in 0.23 s.

## What is NOT verified

- The final engine change (emitters stopped when the effect's duration is over) was made after the last remote run and is
  covered by unit tests only. The `after` run (`fcball-3`) used a version that fired one-shot `burst`; it showed NO burst at all
  (peakLive 0, `frames/goal_010.jpg` has no sparks at the goal event), so that version was dropped. Whether the kick, goal
  and tackle bursts are visible with the stop-after-duration version has not been looked at in a real browser.
- Camera shake amplitude was not measured in the browser (the trauma energy read 0 in both runs; the unit test is the measure).
- Ball launches were not traced in the browser (players intercepted the launched ball in the first attempt).
