# Beat Hopper

A three-lane rhythm runner built with Aura3D. Move between lanes, tap to hop, hold to duck, ride a 132 BPM obstacle grid:
PERFECT timing (±0.09 s) scores 60×mult, GOOD (±0.16 s) scores 30×mult, a miss costs one of three lives.
Combos raise the multiplier (1 + ⌊combo/4⌋, cap x5); every 750 points adds a +100 bonus. Seeded 8-bar phrases
ramp density from one obstacle per 2 beats to one per beat and speed from 16 to 24.

- **Lanes:** three lanes 2 m apart. Every obstacle blocks a set of lanes: crates and gaps (hop) and bars (duck) span
  one to three lanes, walls (dodge) one or two, so every row has an answer. Passing a wall in a free lane is a DODGE
  (20×mult, combo +1); passing a partial hop/duck row in a free lane is free (a timed hop or duck there still scores).
  Beat orbs sit in lanes (often the free lane beside a wall) and pay 15×mult plus combo. Later phrases narrow the
  hop/duck rows and widen walls.
- **Controls:** horizontal drag/swipe (one lane per 48 px), ArrowLeft/ArrowRight or A/D = change lane; tap (short,
  under 12 px of movement), Space, ArrowUp or W = hop; still press-hold ≥0.18 s, ArrowDown or S = duck; P/Esc pause;
  M mute. A press that drags past 12 px steers and never hops or ducks.
- **Look:** night neon with an equalizer skyline; the whole world pulses on the sim beat and PERFECT judgements
  fire expanding gold timing rings.
- **Audio:** 132 BPM 8-step bass + arp synth scheduled from sim `beatIndex` diffs (never wall-clock); intensity
  follows the multiplier.
- **Run:** `pnpm --dir apps/showcase-beat-hopper dev` (127.0.0.1:5202) · `build` · `typecheck`.
- **Evidence:** `evidence/beat-hopper/` · claim label: **bounded / prototype** (catalog verification `playable`).