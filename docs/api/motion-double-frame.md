# checkDoubleFrame: find the "double framed" player

`import { checkDoubleFrame } from "@aura3d/engine/game"`

```ts
const r = checkDoubleFrame({
  draws: drawList.map((d) => ({ meshId: d.id, skeletonId: d.skeleton })),
  instances: players.map((p) => ({ id: p.id, modelId: p.model, position: p.position })),
  layers: animationLayers // { name, clip, weight, blendMode }
});
if (!r.ok) console.warn(r.findings);
```

Findings:
- `shared-skeleton`: two meshes bound to one skeleton in the same frame draw the pose twice.
- `coincident-model`: two instances of the same model within `epsilon` (0.08 m) read as a ghost.
- `double-blend`: override layers whose weights sum past 1, or one clip applied on two layers.

Call it from a QA hook during a run and assert `ok` in the game's remote spec.
