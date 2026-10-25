# Cumulus Dash: names and runner palette (2026-10-24)

Frames are software WebGL2 from the remote runner; not real-GPU evidence.

- **Title card:** "Beyond the Cloud Runner" is now "Cumulus Dash" with the line "Sky ridge run". `before-title.390x844.jpg` / `after-...`.
- **Lore terms:** the chapter name in the game state is now "Cumulus Ridge"; "star orbs" are "sky pearls" in the HUD text, toasts and results card. Internal identifiers and QA hook keys are unchanged.
- **Runner outfit:** the baked texture of `hero.glb` had its tunic orange recoloured to teal, the sash and wrist bands blue to gold, and the near-black hair to plum (`tools/kid-goku/recolor-hero.py`, a masked hue shift; skin, soles, eyes, geometry and animation untouched; new sha256 in `models.ts`, note in `assets/ATTRIBUTION.md`). `before-key-run.390x844.jpg` / `after-...`. The short curly hair silhouette comes from the mesh, so a palette change cannot alter it.
- The device-scale viewport problem is handled by another lane.
