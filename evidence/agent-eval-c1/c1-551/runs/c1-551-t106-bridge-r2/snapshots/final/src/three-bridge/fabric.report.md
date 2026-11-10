# three.js bridge report: fabric

Generator `recipes/studio.mjs` (sha256 fdb12e0b2d72), seed 1, params `{"radius":0.62,"spacing":1.65,"only":"fabric"}`, three r185.
GLB `.aura3d/three-bridge/fabric.glb` (342776 bytes, sha256 4806e612a2ae).

Supported 5, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (5)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `fabric` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.map | `fabric` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| material.normalMap | `fabric` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
