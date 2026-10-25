# Serpentine Sky Run: runner, aura and touch buttons (last fix)

Problems (final retake): the runner looked washed out and semi-transparent in jump frames; Slide and Fly were nearly invisible on phones; the orange suit with a teal sash and wristbands needed a likeness review.

Causes and fixes:
- Washed out: a solid orange surge shell (aura-outer 0.8, aura-inner 0.55 solidity, intensity 1.0) was drawn around the runner whenever the surge chip was active (it is at "SURGE x1" in the jump frames), plus an orange emissive wash on the model (strength 0.3). The shell is now 0.5 and 0.3 solid at 0.7 intensity and the wash is 0.12, so the runner reads through it.
- Likeness: the default style "EMBER" (orange suit, teal belt and sash, blue boots) is replaced by "TIDE" (teal suit, silver trim). The rigged model's own base-colour atlas is recoloured by `tools/runner-recolor/recolor.mjs` (saturated orange pixels to deep teal, dark blue trim to silver; skin and hair untouched; geometry, rig and clips untouched; provenance in `assets/provenance/runner.recolor.json`). The other two colourways (violet, verdant) now use mild tints on the same texture, so they differ less from each other than before.
- Touch buttons: 48 px high, solid dark fill, 1.5 px light border, bold label and a shape icon (Slide, Fly, Surge).

Frames: `before/jump-1280.jpg`, `before/jump-390.jpg` and `after/*` (title, early, roll, jump, mid-action, results at 1280 and 390, plus `jump-card2x.jpg`). Remote run `fixbl-serp2` (software WebGL2, not a GPU), 4 specs passed. The tiny anime-style face fragments inside the model's texture atlas are untouched.
