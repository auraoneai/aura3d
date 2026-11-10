# three.js bridge report: cosmos

Generator `recipes/cosmos.mjs` (sha256 9072c2a68481), seed 1, params `{"stars":450,"shell":230,"orbits":[5,7.4,9.8,12.4,17,22,26.5,30.5],"lineWidth":0.1}`, three r185.
GLB `.aura3d/three-bridge/cosmos.glb` (257584 bytes, sha256 b9279605b9d7).

Supported 2, approximated 9, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## approximated (9)

| construct | subject | note | native route |
|---|---|---|---|
| MeshBasicMaterial | `cosmos_meshbasic_0` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `cosmos_meshbasic_1` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `cosmos_meshbasic_2` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `cosmos_meshbasic_3` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `cosmos_meshbasic_4` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `cosmos_meshbasic_5` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `cosmos_meshbasic_6` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `cosmos_meshbasic_7` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `cosmos_meshbasic_8` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |

## supported (2)

| construct | subject | note | native route |
|---|---|---|---|
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
