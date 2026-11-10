# three.js bridge report: backdrop

Generator `recipes/backdrop.mjs` (sha256 e0494f906e72), seed 1, params `{"stars":900,"radius":260}`, three r185.
GLB `.aura3d/three-bridge/backdrop.glb` (521356 bytes, sha256 6a59d7da4312).

Supported 2, approximated 3, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## approximated (3)

| construct | subject | note | native route |
|---|---|---|---|
| MeshBasicMaterial | `stars_white_mat` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `stars_blue_mat` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |
| MeshBasicMaterial | `stars_warm_mat` | exported with KHR_materials_unlit (parsed with limits by the Aura3D loader) |  |

## supported (2)

| construct | subject | note | native route |
|---|---|---|---|
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
