# Cloud Runner port assets

- `textures/*.jpg`: CC0 1.0, ambientCG (regraded).
- `meshy/*.glb`: Meshy-generated models from original text prompts (2026-10-23), generated through Kiro Prism with the AuraOne Meshy account.
  Terms are those of the account's Meshy plan at generation time (not CC0, no exclusivity claim). Task ids, prompts and rights basis:
  `PORTING-NOTES.md` (Meshy art pass) and `provenance/*.rights.json` / `provenance/*.meta.json`.

## hero.glb palette change (2026-10-24)

`hero.glb` (Meshy-generated runner) had its base-colour texture recoloured so the runner no longer reads as the character of the game that inspired this route: tunic orange to teal, sash and wrist bands blue to gold, near-black hair to plum. Skin, soles, eyes, geometry, skin weights, normals and animation are unchanged. Produced with `tools/kid-goku/recolor-hero.py` (a masked hue shift of the baked JPEG); the new sha256 is in `models.ts`. The spiky-hair silhouette comes from the mesh and is not changed by a palette edit. Rights basis is unchanged (see `provenance/hero.rights.json`).
