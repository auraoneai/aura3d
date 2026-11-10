# three.js bridge report: stage

Generator `recipes/stage.mjs` (sha256 4fa5e38d6241), seed 1, params `{"radius":2.4}`, three r185.
GLB `.aura3d/three-bridge/stage.glb` (261672 bytes, sha256 5d76818ee752).

Supported 5, approximated 1, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## approximated (1)

| construct | subject | note | native route |
|---|---|---|---|
| GLTFExporter | `export` | THREE.GLTFExporter: Creating normalized normal attribute from the non-normalized one. |  |

## supported (5)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `showroom_floor` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `bezel_chrome` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `ring_light` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
