# three.js bridge report: studio

Generator `recipes/studio.mjs` (sha256 e6c3821e49d0), seed 1, params `{"radius":0.8,"spacing":2.1,"part":"cyc"}`, three r185.
GLB `.aura3d/three-bridge/studio.glb` (9980 bytes, sha256 95c0c32f3b2a).

Supported 3, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (3)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `cyc` | exported as glTF metallic-roughness PBR |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
