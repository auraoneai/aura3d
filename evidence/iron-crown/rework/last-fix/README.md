# Iron Crown: flat stylised faces, first names on phones

Branch `game-rework`. Remote runner (software WebGL2); spec `tests/browser/fixdl-iron-crown.spec.ts`; run `fixdl-ic`. Not real-GPU evidence.

- `tools/iron-crown-restyle/flatface.mjs` flattens every skin texel of the atlas, moves the head's skin triangles into their own primitive
  with a small flat face texture (eyes, brows, nose, mouth, projected from the front of the head) and paints the head's hair triangles a
  flat colour. Skeleton, skin weights, clips (10 animations, 720 channels, same as before) and cloth are unchanged. Preview:
  `tools/iron-crown-restyle/preview-head.mjs`.
- Applied to Kenji Arashi (`ironcrownKenji.b210a2e7.glb`) and Mara Volt (`ironcrownVolt.78649874.glb`); manifests, typed assets and evidence
  records updated (`aura-evidence/restyle/*.flatface.json`).
- The four other roster fighters (Boulder, Seraph, Jinx, Sovereign) were not changed in this pass.
- 390 px: the health plates show the first name ("KENJI", "MARA"); the full name stays as the tooltip.
- A small leftover from the old atlas remains on Kenji's chin (a soft shading band); it no longer reads as a photographic face.

Frames: `compare-*.jpg` (left before from `screens/final`, right after), `after-*.jpg`.
