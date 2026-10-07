# Q-15-2 — four duplicate public symbol declarations (unique-ownership)

**Filed by:** Lane 15 (PRD-15 T6.11)
**Status:** open — allowlisted until 2026-11-15 (`tools/arch-gates/allowlist.json`)

The `unique-ownership` gate (fail mode since T5.9) flags four names declared by
two packages each with *different declarations*. These need an owner decision
(rename, unify, or namespace) — they are recorded, not fixed in place.

| Symbol | Declared by | Nature |
|---|---|---|
| `AnimationAssetCategory` | `@aura3d/asset-index` (05) + `@aura3d/editor-runtime` (15) | different unions (`horizon`/`panorama`/… vs `character`/`set`/…) — **lane 05 decision**, documented here for them |
| `Vector3Like` | `@aura3d/controls` + `@aura3d/rendering` | controls interface vs `effects/Particle.ts` type alias |
| `clamp` | `@aura3d/controls` + `@aura3d/math` | `ControlTypes.ts#280` decl vs `Interpolation.ts` function |
| `RaycastHit` | `@aura3d/physics` + `@aura3d/rendering` | physics concrete type vs rendering `RaycastHit<T>` generic |

Convention per T5.8: collisions allowlist with expiry and converge in a
follow-up — for the three 15↔15 pairs lane 15 picks a rename/unification
direction and repoints one side; `AnimationAssetCategory` additionally needs
lane 05.
