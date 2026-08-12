# Navigation migration for Aura3D 2.0

Aura3D 2.0 removes the in-house grid navigation, local
steering, and quadratic crowd simulation exports from `@aura3d/physics`.
`@aura3d/navigation-recast` is the sole selected owner for 3D navmesh
generation, Detour path queries, crowds, serialization, and temporary
obstacles. It is optional and does not enter core, product, or arcade bundles.

## Import migration

Install the optional adapter and its exact runtime dependency through the
workspace/release dependency set, then initialize it lazily:

```ts
import { createRecastNavigation } from "@aura3d/navigation-recast";
import { assets } from "./aura-assets";

const startWorldPosition: readonly [number, number, number] = [-8, 0, -8];
const endWorldPosition: readonly [number, number, number] = [8, 0, 8];
const navigation = await createRecastNavigation();
const navMesh = await navigation.importAsset(assets.levelNavigation);
const path = navMesh.computePath(startWorldPosition, endWorldPosition);

if (!path.success) {
  throw new Error(path.error ?? "No navigation path");
}
```

Add the serialized file with
`aura3d assets add ./level.navmesh --name levelNavigation`; type generation
produces an `AuraAssetRef<"navigation">`, and `importAsset()` verifies its
manifest SHA-256 hash before importing it. For static worlds, generate the
navmesh offline and ship the serialized bytes.
Use runtime or worker generation only for procedural geometry. The browser
workload verifies worker transfer, import, path queries, crowds, temporary
obstacles, deterministic serialization, repeated disposal, and cached/cold
loading.

## Removed-to-replacement map

| Removed `@aura3d/physics` surface | Replacement |
| --- | --- |
| `NavigationGrid.findPath()` | `RecastNavMeshHandle.computePath()` |
| `NavigationAgent` | Follow the returned world-space points in route/game logic |
| `CrowdSimulation` | `RecastNavMeshHandle.createCrowd()` and `RecastCrowdHandle` |
| `SteeringAgent` and local steering functions | Detour crowd movement, or route-local authored-unit movement when no navmesh is needed |

The APIs are intentionally not presented as drop-in aliases: the removed grid
worked in two coordinates and did not model walkable 3D geometry, whereas the
replacement consumes world-space triangle soup and returns three-dimensional
paths. Keeping an alias would conceal that semantic break and recreate a second
navigation owner.

## Evidence and rollback

- Decision: `docs/architecture/adr/0005-navigation-is-optional-recast-detour.md`
- Browser evidence: `tests/browser/optional-recast-navigation.spec.ts`
- Bake-off producer: `tools/navigation-backend-bakeoff/index.ts`
- R8 proof: `tests/reports/navigation-legacy-delete-final.json`

Git history is the rollback archive. Restore the deleting commit's parent only
for an emergency compatibility branch; do not reintroduce the algorithms into
the recommended runtime graph.
