# Group A visual polish (2026-10-25)

Software WebGL2 (SwiftShader) remote frames plus a local CPU model render. Not real-GPU evidence.

## What changed
- **Face tool** (`tools/hoops-athlete-retexture/retexture-face.mjs`): `fit` mode reads the palette and the leg, sleeve and
  hem layout from the shipped model (agreement with the shipped regions 92% to 100% of body vertices); boundaries split down to
  6 mm (4 mm on the face); the jersey and shorts meet at one clean waist height instead of where the skin-weight dominant joint
  flips; smooth normals recomputed (55 degree crease) and roughness 0.86; the face is small round eyes (warm sclera, dark pupil),
  a thin brow and a small mouth. Red Zone athletes keep no face under the helmet (`face: false`).
- Re-run for Hoops (2), Diamond, Links golfer, FC striker and keeper (named flat materials plus a white `eyes` material that the
  team tint does not touch) and Red Zone (2). `tools/hoops-athlete-retexture/rewire.mjs` swaps file name, sha256 and sizeBytes in
  every manifest; `preview-athlete.mjs` renders a model sheet.
- **Links:** on phones (aspect below 1.15) the address and aim cameras come nearly onto the shot line, step back 1.9 m and open
  the fov by up to 16 degrees, so the golfer beside the ball fits. The golf cart is rebuilt with smooth normals and matte
  materials (`tools/links-cart-retexture/retexture-cart.mjs`).

## Seen in frames
- Links 390x844 (`aura-links-3d/rework/polish/after-390-*.jpg`): golfer fully in frame at aim and through the swing; strokes 1
  after one swing.
- FC 1280x720 (`aura-fc-3d/rework/polish/after-1280-play.jpg`): shorts end in a clean edge; the flared shorts shape is the mesh
  itself. Model before and after: `striker-before-after-model.png`.
- Hoops 1280x720 (`after-1280-play-first-face.jpg`): faces read as eyes but the first pass looked like goggles at distance, so the
  eyes were made smaller with a dark pupil (`final-face-model.png`, model render only: the final face size is NOT yet seen in a game
  frame).

## Not fixed: Diamond bat grip during the swing
`aura-diamond-3d/rework/polish/grip-strip-stance-to-140ms.jpg`: the knob is in the hands at stance and early load, then from about
120 ms the bat floats beside the head while the hands are at the chest. The bat is attached to `RightForearm` (the rig has no hand
bones) while the swing arms are posed procedurally; the socket most likely reads the clip pose of the forearm before the
procedural arm override is applied. The fix belongs in the engine attach update order (attachments after pose overrides) or the
bat must follow the solved palm (the game already measures `knobToHand` in its QA evidence). Needs its own lane.
