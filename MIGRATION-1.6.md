# Migrating to Aura3D 1.6

**Short version: for the overwhelming majority of projects there is nothing to do.** No package
was removed, no public symbol became unreachable, and every intentional break below has a named
replacement.

This document is also the input to the version decision (§12 of
`Aura3D-1.6-Replatform-PRD.md`), which is stated at the bottom with the measurements that
produced it.

## Migration matrix

Measured against `v1.5.2`, comparing the generated public API surface
(`docs/api/public-api.md`, 2,498 → 2,501 exported symbols) and the root `exports` map.

| Change | Kind | Affects you if… | What to do |
| --- | --- | --- | --- |
| Root `./three-compat` subpath removed | **fix, not a break** | you wrote `import … from "@aura3d/engine/three-compat"` | Import `@aura3d/three-compat` instead. This subpath **never worked for an installed consumer**: the root `files` field deliberately excludes `dist/three-compat`, so it resolved only inside a built worktree and threw `ERR_PACKAGE_PATH_NOT_EXPORTED` for everyone else. All 36 `*Compat` symbols still ship, unchanged, from the standalone package. |
| `PhysicsBackend` is now a one-member union (`"cannon-es"`) | **break** | you passed `backend: "aura-js"` to `PhysicsWorld` | Remove the option, or pass `"cannon-es"`. Passing the old value now **throws by name** rather than silently selecting a different solver. See *Physics* below — this is the change most likely to alter behaviour, and in every case it alters it toward correctness. |
| `PhysicsBackendSelection.fallback` and `.jsFallbackAvailable` removed | **break** | you read either field from `world.snapshot().backend` | Delete the read. There is no fallback to report; with one solver there is nothing to fall back to. |
| `solverIterations` default 1 → 10 | **behaviour change** | you relied on the default | Nothing, unless you were compensating for it. This was a defect: the value is written straight onto cannon's solver, which defaults to 10, so every world that did not pass the option ran a tenth of the constraint quality the backend ships with. A 6-box stack collapsed completely. Pass an explicit value to keep the old behaviour, though there is no good reason to. |
| Capsule colliders are now a true capsule | **behaviour change** | you used `Shape.capsule` on sloped ground | Nothing. They were built as flat-ended cylinders, so a character rested on a rim ~0.1 above any incline and `grounded` was permanently `false`. If you added an offset to compensate, remove it. |
| `raycast` / `sphereCast` now respect body rotation | **behaviour change** | you cast against a rotated box or capsule | Nothing. Queries previously used the axis-aligned bounding box and returned axis-aligned normals, so slopes did not exist as far as any query was concerned. Contacts always respected rotation; only queries did not. |
| New: `@aura3d/physics/solverless`, `@aura3d/physics/world`, `@aura3d/engine/rendering/webgpu`, `@aura3d/engine/media-node` | **additive** | — | Optional. Import from `./solverless` if your scene has no rigid bodies and you do not want the solver on your critical path. |
| New: `@aura3d/engine/lean`, `@aura3d/engine/lean-product`, `@aura3d/engine/lean-game` | **additive, recommended for new apps** | you want the production renderer without the compatibility barrel | Use `./lean` for primitive scenes, `./lean-product` for typed GLB product viewers, and `./lean-game` for input + the shared production physics owner. The broad root remains available for existing apps and advanced helpers. |
| New narrow internals: `@aura3d/rendering/lean-runtime`, `@aura3d/assets/gltf-runtime`, `@aura3d/scene/math` | **additive** | you build a package-level adapter | Prefer the three public engine entries above for apps. These subpaths prevent a narrow adapter from crossing the broad inspection/fixture barrels. |
| New: `GameRacingSnapshot.vehicle` | *not shipped in 1.6* | — | Reverted with the racing rewire; see ADR 0002. |

### Root bundle policy

Aura3D 1.6 chooses PRD WS-2.2 option **(a)**: the root `@aura3d/engine` entry remains
compatibility-heavy so an existing import does not silently lose any of its 1.5 surface. New apps
should use the narrow entry matching their workload:

- `@aura3d/engine/lean` — WebGL2 scene graph, camera, PBR material, primitives.
- `@aura3d/engine/lean-product` — the same core plus the real GLB/glTF production pipeline.
- `@aura3d/engine/lean-game` — the same core plus input, the shared `PhysicsWorld`, and the public
  physics runtime; it does not define a second integrator.

This is a performance recommendation, not a removal. The README's first code example uses the
product entry, and the canonical bundle scenarios measure the matching entry. Fresh measurements
are **0.556x / 1.249x / 0.810x** the equivalent Three.js stacks against unchanged limits of
1.25x / 1.25x / 1.50x. The compatibility root is still intentionally broad and is not presented as
the smallest entry.

### Nothing else changed

- **Packages: 27, unchanged.** None removed. `packages/ecs` and `packages/scripting` were
  candidates and were **retained** — R8 refused the deletion and ADR 0001 records why.
- **Public symbols: zero non-`three-compat` removals.** 36 removed, all `*Compat`, all still
  reachable from `@aura3d/three-compat`. 39 added, all additive.
- **No renames.** No symbol was renamed without an alias.

## Physics: what to expect at runtime

The 1.6 physics work removed a second solver rather than repairing it. Through 1.5.x,
`PhysicsWorld` ran either `cannon-es` or an in-house `aura-js` integrator behind one `step()`, and
they diverged:

- **joints were a no-op on the default backend.** A body on a `fixed` joint free-fell to
  y ≈ −18.8 over two seconds instead of hanging. The other branch solved them, which is why the
  joint tests passed.
- **`applyForce` was silently dropped on the default backend.** It accumulated and was never
  forwarded. Impulses worked, which made the gap look like a physics quirk.
- **collider `material`, declared `inertia`, and 3 of the 7 public `Shape` kinds** were only
  honoured on the non-default branch. Adding one mesh collider silently moved the **entire world**
  onto the other solver.

If your project worked around any of that, remove the workaround. If it looked broken, it should
now behave. Nine named invariants cover the production backend:
`tests/unit/physics/production-backend-invariants.test.ts`.

## Version decision (§12)

**1.6.0.** The §12 rule is explicit: *"If packages disappear and commonly used imports break, it is
`2.0.0`."* Measured, neither happened.

| §12 criterion | Measured | Verdict |
| --- | --- | --- |
| Packages disappear | 0 of 27 removed | no |
| Commonly used imports break | 0 non-`three-compat` symbols removed; the one removed subpath was already unusable when installed | no |
| High-value public concepts preserved | 2,501 symbols vs 2,498; all additive | yes |
| Most source compatibility retained | Only `backend: "aura-js"` and two fallback fields break, and both were part of the defect | yes |

§12 anticipated `2.0.0` because "two packages are already slated for removal and the engine barrel
is being split". Both premises turned out false: R8 refused the package removals (ADR 0001), and
the barrel split added narrower entry points **without** removing the wide one. So the answer the
matrix produces is `1.6.0`, not the one the prose expected.

**Bundle boundary:** 1.6.0 clears the §B.1 release condition through the recommended lean entries,
not by shrinking the compatibility-heavy root. The frozen scenarios measure **0.556x / 1.249x /
0.810x** the equivalent Three.js stacks against limits of **1.25x / 1.25x / 1.50x**. Existing
root imports remain supported; new applications should select the matching lean entry when bundle
cost matters. These are scenario-specific build measurements, not universal performance claims.
