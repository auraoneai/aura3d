# three.js bridge report: fabric

Generator `recipes/studio.mjs` (sha256 f69b219f76bb), seed 1, params `{"radius":0.8,"spacing":2.2,"part":"fabric"}`, three r185.
GLB `.aura3d/three-bridge/fabric.glb` (2200560 bytes, sha256 d57c37ee852c).

Supported 4, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (4)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `fabric` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.map | `fabric` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| material.normalMap | `fabric` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
