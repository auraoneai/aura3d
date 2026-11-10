# three.js bridge report: studio

Generator `recipes/studio.mjs` (sha256 f69b219f76bb), seed 1, params `{"radius":0.8,"spacing":2.2,"part":"floor"}`, three r185.
GLB `.aura3d/three-bridge/studio.glb` (3256 bytes, sha256 e9f0e8c2caeb).

Supported 2, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (2)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `cyclorama` | exported as glTF metallic-roughness PBR |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "none", exposure } }) |  |
