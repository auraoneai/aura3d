# three.js bridge report: windmill

Generator `recipes/windmill.mjs` (sha256 58ef4470d79f), seed 1, params `{"sail":"#3c6fb0","tower":"#d8d2c4","roof":"#2f4a3a","height":4.8,"rpm":15}`, three r185.
GLB `.aura3d/three-bridge/windmill.glb` (55956 bytes, sha256 9cd94f64ab61).

Supported 14, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (14)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `grass` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `tower` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `roof` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `wood` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `metal` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `sail` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `flag` | exported as glTF metallic-roughness PBR |  |
| HemisphereLight | `hemispherelight` | emitted as native lights.hemisphere (world-space position/target; three intensity carried 1:1) |  |
| DirectionalLight | `sun` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| Scene.background | `scene` | emitted as scene({ background }) |  |
| AnimationClip | `rotor_spin` | exported explicitly through GLTFExporter({ animations }) |  |
| AnimationClip | `breeze` | exported explicitly through GLTFExporter({ animations }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
