# three.js bridge report: metal

Generator `recipes/studio.mjs` (sha256 fdb12e0b2d72), seed 1, params `{"radius":0.62,"spacing":1.65,"only":"metal"}`, three r185.
GLB `.aura3d/three-bridge/metal.glb` (285888 bytes, sha256 f50844eb0677).

Supported 4, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (4)

| construct | subject | note | native route |
|---|---|---|---|
| MeshPhysicalMaterial | `metal` | exported as glTF PBR with KHR_materials_* extensions (clearcoat, transmission, sheen, iridescence, ior, specular) |  |
| material.map | `metal` | DataTexture pixels baked into the GLB as PNG (static procedural pattern) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
