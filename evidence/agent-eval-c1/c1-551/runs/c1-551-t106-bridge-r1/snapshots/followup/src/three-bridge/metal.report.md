# three.js bridge report: metal

Generator `recipes/studio.mjs` (sha256 e6c3821e49d0), seed 1, params `{"radius":0.8,"spacing":2.1,"part":"metal"}`, three r185.
GLB `.aura3d/three-bridge/metal.glb` (284320 bytes, sha256 33d95067a5c0).

Supported 5, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (5)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `metal` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.roughnessMap | `metal` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| material.metalnessMap | `metal` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
