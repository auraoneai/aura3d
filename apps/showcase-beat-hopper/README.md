# Beat Hopper

A one-button rhythm platformer built with Aura3D. Tap to hop, hold to duck, ride a 132 BPM obstacle grid:
PERFECT timing (±0.09 s) scores 60×mult, GOOD (±0.16 s) scores 30×mult, a miss costs one of three lives.
Combos raise the multiplier (1 + ⌊combo/4⌋, cap x5); every 750 points adds a +100 bonus. Seeded 8-bar phrases
ramp density from one obstacle per 2 beats to one per beat and speed from 16 to 24.

- **Controls:** Space / ArrowUp / tap = hop (tap); ArrowDown / S / press-hold ≥0.18 s = duck; P/Esc pause; M mute.
- **Look:** night neon with an equalizer skyline; the whole world pulses on the sim beat and PERFECT judgements
  fire expanding gold timing rings.
- **Audio:** 132 BPM 8-step bass + arp synth scheduled from sim `beatIndex` diffs (never wall-clock); intensity
  follows the multiplier.
- **Run:** `pnpm --dir apps/showcase-beat-hopper dev` (127.0.0.1:5202) · `build` · `typecheck`.
- **Evidence:** `evidence/beat-hopper/` · claim label: **bounded / prototype** (catalog verification `playable`).