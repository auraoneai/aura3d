# three.js bridge report: stage

Generator `recipes/stage.mjs` (sha256 b4142ba31e24), seed 1, params `{"plinth":"#2b3040","floor":"#05060a"}`, three r185.
GLB `.aura3d/three-bridge/stage.glb` (23552 bytes, sha256 03f69e42f233).

Supported 4, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (4)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `stage_meshstandard_0` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `stage_meshstandard_1` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
