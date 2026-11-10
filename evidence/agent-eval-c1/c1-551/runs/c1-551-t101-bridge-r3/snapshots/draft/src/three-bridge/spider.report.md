# three.js bridge report: spider

Generator `recipes/spider.mjs` (sha256 023c5918d944), seed 1, params `{"period":2,"bodyColor":"#3b2a24","legColor":"#5a3d30"}`, three r185.
GLB `.aura3d/three-bridge/spider.glb` (457176 bytes, sha256 4560beb340af).

Supported 12, approximated 0, unsupported 0. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).

## supported (12)

| construct | subject | note | native route |
|---|---|---|---|
| MeshStandardMaterial | `spider_meshstandard_0` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `spider_meshstandard_1` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `spider_meshstandard_2` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `spider_meshstandard_3` | exported as glTF metallic-roughness PBR |  |
| MeshStandardMaterial | `spider_meshstandard_4` | exported as glTF metallic-roughness PBR |  |
| HemisphereLight | `hemispherelight` | emitted as native lights.hemisphere (world-space position/target; three intensity carried 1:1) |  |
| DirectionalLight | `key` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| DirectionalLight | `fill` | emitted as native lights.directional (world-space position/target; three intensity carried 1:1) |  |
| Scene.background | `scene` | emitted as scene({ background }) |  |
| AnimationClip | `walk` | exported explicitly through GLTFExporter({ animations }) |  |
| PerspectiveCamera | `camera` | emitted as camera.perspective (position, look-at target, vertical fov, near, far) |  |
| WebGLRenderer.toneMapping | `output` | emitted as createAuraApp({ output: { toneMapping: "aces", exposure } }) |  |
