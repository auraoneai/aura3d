# Teleoperator: fare card as a bottom sheet, name tags that avoid panels, flat-paint robotaxi

Branch `game-rework`. Remote runner (software WebGL2, SwiftShader), built from the working tree with `vite.fixdl.config.ts`
(3 routes); spec `tests/browser/fixdl-teleoperator.spec.ts`; run `fixdl-tele3`. Not real-GPU evidence.

| Measure (from the page DOM) | Before | After |
|---|---|---|
| 390x844: fare card height | about 33% of the screen, stacked under the wallet | 14.8% (bottom sheet), 4% collapsed |
| 1280x720: name tag over a panel (px^2) | 4 tags, up to 2,800 | 0 |
| 1280x720 and 390x844: tag over tag (px^2) | several (marcus_v8 over kaya_sf and sf_muni) | 0 |
| Tags moved off a panel with a leader line | 0 | 4 at 1280, 3 at 390 |
| Console errors | 0 | 0 |

- Tap the card title (the small caret) to collapse the sheet to one line; the state is shared by the fare card and the trip card.
- Robotaxi: the Meshy GLB baked its paint into a shard-shaped atlas (`/tmp` notes: noisy fragments, invented marks) and its
  normals were noisy, which a flat colour turned into blotchy shading. `tools/teleop-vehicle-retexture/retexture.mjs` paints the same mesh
  by region (body, glass, tyre, rim, lights, pod, mirror, underbody) into flat materials, subdivides region boundaries (depth 2, wheels
  keep their triangles), and recomputes smooth normals with a 55 degree crease. The cover discs are gone (the marks are no longer
  in any texture). 33,495 triangles, 1.0 MB, no textures. Preview tool: `tools/teleop-vehicle-retexture/preview.mjs`.
- Edges between glass and body are still slightly serrated at depth 2; deeper subdivision costs triangles (depth 3 is 43.9k).
- The robotaxi silhouette is still a compact crossover with a roof pod: that comes from the Meshy mesh and needs new art to change.

Frames: `compare-*.jpg` (left before from `screens/final`, right after), `after-*.jpg`.
