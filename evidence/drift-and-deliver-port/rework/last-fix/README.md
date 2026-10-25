# Gridlock Courier: phone layout and car body (last fix)

Verified by frames (remote run `fixbl-courier`, software WebGL2, not a GPU, 4 specs passed):
- Phone layout (390 px): the minimap is under the score at the top right (92 px), the speed readout is bottom right, the nitro bar bottom left. Nothing overlaps (`before/drive-390.jpg`, `before/mid-action-390.jpg` vs `after/drive-390.jpg`, `after/mid-action-390.jpg`).
- Car, first version (committed): glass, headlight, taillight and underside regions only apply to outward-facing triangles; the underside is a dark body blue; the paint has a subtle vertical COLOR_0 gradient (`tools/gridlock-car-retexture`). In `after/pickup-1280.jpg` the car still looks translucent: the Meshy mesh is thin overlapping plates with gaps (each half of the mesh, split by facing, is sparse), so interior structure shows through whatever the classification. Classification cannot fix this.

Not verified: a core loft (a 468-triangle solid shape behind the plates, body paint, dark glass under the cabin) built in `tools/gridlock-car-retexture/retexture.mjs` to fill the gaps. Its remote capture (`fixbl-courier2`) had not returned frames when this was written, so it is on the backup branch `fix-b-last-car-loft`, not on `game-rework`. The real fix is a regenerated or remeshed car (the `drift` Meshy tag is already over its cap, 440 of 420).
