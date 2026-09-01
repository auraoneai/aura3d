# Pulse Tunnel V9 Quaternius source-family provenance

Status: **licensed external-source audition rejected by a fresh independent
label-hidden critic; not registered; Pulse remains `reference`**.

## Bounded source search and license

The bounded external search screened Kenney Space, KayKit Space Base, and the
Quaternius science-fiction packs. Kenney and KayKit were rejected before
download because the available sets did not provide one coherent player,
vertical boss, and environment family. The selected lane uses only models by
one author, Quaternius, under one embedded license, CC0 1.0 Universal:

- Sci-Fi Essentials Kit (official pack page):
  <https://quaternius.com/packs/scifiessentialskit.html>
- Modular Sci-Fi MegaKit (official pack page):
  <https://quaternius.com/packs/modularscifimegakit.html>
- Modular Sci-Fi MegaKit standard archive (authoritative OpenGameArt uploader
  page): <https://opengameart.org/content/modular-sci-fi-megakit>
- Downloaded MegaKit archive SHA-256:
  `4ca9acbc7a13e7baa48e24c4853b779889b7ab21587004c36668826e705c8a10`
- Essentials standard mirror commit:
  `db3df04d1e4714298a09510b26fb6de6645138a2`
- The route-local `License_Standard.txt` files both state “CC0 1.0 Universal
  (CC0 1.0), Public Domain Dedication” and “Models by @Quaternius.” Their
  hashes are Essentials
  `2687fba65dca7bbd2f9ab2fb7a8c1a16bce89b2836a0ecf34ece7e2fab96769`
  and MegaKit
  `885b700f02932c08a41163b35cc97d1abe0895a05de29d9a9062fde5132969a8`.

The exact selected source files and required texture dependencies are retained
under `art-review/external-source/quaternius/`. No known franchise or existing
Aura game identity is reused.

## Selected family and inspection

| Role | Source | Source SHA-256 | Source inspection |
| --- | --- | --- | --- |
| player | `Enemy_EyeDrone.gltf` | `ae39f7a2cc7698aaa774c9c84df3263d833023d69e7638e417d88e79cb3c7005` | 10 nodes, one mesh/material, three real PBR images, source bounds 0.996×0.995×0.892 |
| warden | `Alien_Scolitex.gltf` | `7ea407580bad6ca7b918eca815f6b55e70667143a97d7e8c7ca0e51de2c6f049` | 35 articulated nodes, one mesh, three authored color materials, source bounds 3.432×3.362×3.227 |
| environment | `WallAstra_Straight.gltf` | `76ca46a4cac44e9c7a0971bdb2d1912f9d5d7e00fe2e8f7ffa488e98856a1368` | five materials and 11 texture-image references |
| environment | `Platform_DarkPlates.gltf` | `1fb445848b118fcda47b9c8c4ecd5c25d0120c4633877a0204564b285d3b262b` | one material and three texture-image references |
| environment | `Column_Pipes.gltf` | `7b5a852e82ae98fdb717a878372b1fa70a4efedc354ad9ac8cc106171d7e97b5` | three materials and nine texture-image references |
| environment | `Door_Frame_A.gltf` | `b37935929f3d58fceea361568982cabec51c7dc7443a96bc775a9ee1b5532430` | three materials and seven texture-image references |

## Reproducible audition outputs

Builder: `scripts/build-quaternius-source-v9.py`, SHA-256
`135adeed83e75a0846f3e1bfc5e4df17051a37ff61d7ae14595a786d2dc998fa`.
Two independent Blender 5.2.1 invocations produced byte-identical GLBs:

| Candidate | SHA-256 | Bytes | Export structure |
| --- | --- | ---: | --- |
| `pulseQuaterniusEyeRunnerV9.candidate.glb` | `c39a2f5153382b1f4450a546df5112aba6a7ab50b47188bcb394742a654815b6` | 4,628,876 | 10 nodes, one mesh/material, three embedded images |
| `pulseQuaterniusScolitexWardenV9.candidate.glb` | `097c16edbc1e76a95aab8318ef2821b46888816733803904a894af351cdbbcf1` | 446,128 | 35 nodes, one mesh, three materials, no bitmap images |
| `pulseQuaterniusReactorArenaV9.candidate.glb` | `64731eade5c980f7461599b033551f9f59ef2c7ab3dd8579bfedbc9f59f2e9e3` | 26,654,304 | 23 nodes/meshes, 69 material instances, 14 embedded images |

The Blender exporter warned that several imported MegaKit materials reference
more than one image node and therefore use the first node as the glTF sampler.
This is an honest fidelity limitation of the conversion, not a silent pass.

## Exact route audition and verdict

- Review scene: `art-review/pulse-quaternius-source-v9.html` and `.ts`
- HTML SHA-256:
  `308d0d9718f244a66a7a3e3a9cfb08e62acfc67f8bb018e4f9bfece0b97e3bac`
- TypeScript SHA-256:
  `857806e31f6d4aeb7033273cc33a25d03f408f9c2c12d3e6a0a7741d60b14b54`
- Exact: `art-review/output/pulse-quaternius-source-v9.png`
- Exact SHA-256:
  `5d2792a16c5077328affa6a6485c5a58ed2aa80fea3a8eb36eef1f97bfc94364`
- Runtime: WebGL2 safe API, 1440×900, 101 draw calls, zero diagnostics errors.
- Combat staging: ten cyan player projectiles, 15 red warden projectiles, two
  3D lock/impact rings, two legible primary actors, and a compact state HUD.

The external family materially fixes V7’s generic procedural-arch lane: it has
a distinct textured oculus player, a large articulated vertical alien warden,
and a continuous authored modular causeway. The exact still has visible
limitations: the safe-basic material response is flat and desaturated, the
central floor consumes too much of the frame, the warden uses color materials
rather than image textures, and the projectile exchange is still sphere-led.
The fresh independent label-hidden critic selected Furi for clearer
player/enemy staging, denser readable combat, richer modeled arena/material
finish, stronger lighting/depth/effects/composition, and a more integrated
HUD. V9 is therefore rejected and unregistered. It was allowed only one
bounded same-family presentation pass, V10; V9 itself must never be promoted.
