# Polarity Orbs

An arcade polarity-flip orb collector built on Aura3D. Roll down a split warm-red / cool-blue dusk road:
**drag to steer, tap to flip polarity** (Space/Enter also flip), collect orbs of your colour and dodge the rest.

- Matching orb: +20 × multiplier, combo grows the ball; wrong orb costs a life (a shield absorbs one hit).
- Rows are 70% mixed (at least one of each colour) and 30% uniform-opposite — forcing a well-timed flip.
- Power-ups: rainbow (collect both colours, 5 s), shield, x2 score (7 s), magnet (matching orbs slide to you, 6 s).
- Signature look: dual-tone world halves that shift on every flip, a flip shockwave ring and magnet attraction streams.

Controls: drag / ← → or A/D steer · tap / Space / Enter flip · M mute · C polarity symbols · P / Esc pause.

Route: `/apps/showcase-polarity-orbs/` (live at <https://aura3d.auraone.ai/apps/showcase-polarity-orbs/>).
`?autoplay=1` (aliases `?autostart=1`, `?autopilot=1`) skips the title and runs the looping attract pilot.
Run: `pnpm --dir apps/showcase-polarity-orbs dev` (127.0.0.1:5201) · `build` · `typecheck`.

Evidence: `evidence/polarity-orbs/` (route health in `route-health.json`; final screenshots from the 5.6.0 real-GPU
QA pass in `evidence/polarity-orbs/screens/final`). Catalog verification `playable`. Since the 5.6.0 Idol pass the backdrop islands, crystals, magnet and resonance coil are fal Idol image-to-3D GLBs (`speridlabs/idol/max`; spec `tools/idol/specs/polarity-orbs.json`, files and provenance in `assets/idol/`); the rest stays native `@aura3d/engine` procedural geometry. The
licensed GT Walsheim Bold font is documented in `public/aura-assets/PROVENANCE.md`.