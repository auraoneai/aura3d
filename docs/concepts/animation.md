# Animation

The animation package covers runtime playback primitives, imported clips, mixers, and bounded morph/skinning paths. It should be documented as a runtime system, not as a full authoring suite.

## Runtime Boundary

Animation updates produce sampled values for scene nodes, skeletons, morph weights, or app-controlled state. The renderer consumes the resulting transforms or material/geometry state after animation has advanced.

## Asset Boundary

glTF animation import supports validated channels, interpolation modes, skins, morph target weights, and CUBICSPLINE tangent sampling in the current evidence set. Unsupported animation targets should fail clearly during import rather than being ignored.

## Editor Boundary

The browser editor can exercise play-mode and command workflows, but timeline editing and a full animation state-machine UI are not current production claims.

## Current Limits

Broad retargeting, IK authoring, blend-tree authoring, motion matching, and visual timeline workflows remain outside the current verified docs slice.
