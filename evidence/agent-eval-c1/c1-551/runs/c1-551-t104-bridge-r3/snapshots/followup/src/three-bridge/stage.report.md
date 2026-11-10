# three.js bridge report: stage

Generator `recipes/stage.mjs` (sha256 3083f3375a83), seed 1, params `{"plinth":"#2b3040","pillar":"#3a4560","band":"#e8b04a","pillars":7,"radius":11,"height":70}`, three r185.
GLB `.aura3d/three-bridge/stage.glb` (432480 bytes, sha256 c653fa729d52).

Supported 4, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (4)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `plinth` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `pillar` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `band` | exported as glTF metallic-roughness PBR |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
