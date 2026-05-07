# Galileo3D Public API

The generated entrypoint export reference is maintained at [`docs/api/public-api.md`](./public-api.md).

Regenerate and verify it with:

```sh
pnpm verify:api-docs
```

## Package Entrypoints Used By Product Demos

| Package | Public imports used by Agent 6 demos |
|---|---|
| `@galileo3d/rendering` | `Renderer`, `Geometry`, `PBRMaterial`, `UnlitMaterial`, `ParticleEmitter`, `ParticleSystem` |
| `@galileo3d/physics` | `PhysicsWorld`, `Shape` |
| `@galileo3d/animation` | `AnimationClip`, `AnimationMixer`, `AnimationTrack` |
| `@galileo3d/input` | `InputSystem`, `InputSnapshot` |
| `@galileo3d/audio` | `AudioSystem` |

## Scope

The generated reference is an entrypoint export contract for every non-private package in `packages/*`. It is intentionally tied to `src/index.ts` exports so documentation drift is caught by `pnpm verify:api-docs`.

Narrative subsystem guides and examples live in the rest of `docs/`.
