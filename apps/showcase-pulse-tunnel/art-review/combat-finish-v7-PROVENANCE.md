# Pulse Tunnel combat-finish V7 provenance

Status: **materially improved isolated candidate; not registered or integrated;
visual comparator status remains `reference` pending independent review**.

## Original source and deterministic outputs

- Builder: `apps/showcase-pulse-tunnel/scripts/build-combat-finish-v7.py`
- Builder SHA-256: `4f64e2580d5fa176fa6275336fee3a75baacff562959db03d634a83d90faaea3`
- Author/license: Aura3D route-local synthesis, CC0-1.0
- Inputs: fixed numeric meshes/materials and fixed stdlib-generated textures;
  no downloaded or cross-game model inputs.

| Artifact | SHA-256 | Bytes | Bounds | Structure |
| --- | --- | ---: | --- | --- |
| `pulsePhaseMantaV7.candidate.glb` | `d33f6418e9cb44f560f09750cf1acf8f51985556f9ab616e6e1d0c5e65dd5ce5` | 963,232 | 4.288×1.040×3.730 | 16 meshes, five materials |
| `pulseCathedralSentinelV7.candidate.glb` | `d4920ac4db53594560efb42dd98df7adbb0fe5193c712df52f4324bb77d6b4af` | 1,601,400 | 5.502×3.418×1.645 | 32 meshes, five materials |
| `pulseBraidedReactorWorldV7.candidate.glb` | `0714c8f14011b29d92f2035ae8aaee5e3579be5b74d43697b4384a5bbed5219e` | 1,852,564 | 9.398×4.742×14.800 | 52 meshes, six materials |

Texture hashes are runner
`16f3960ddfcf0d5e471c60465e5e8a09974f8842b26a2247b0b8d054658cefb2`,
sentinel
`a5c3ad1a467066c06cbbaaf128542577f055dc54fe93d51623fdd8e0646e0f02`,
and deck
`29ad0afe1c38aa0d4c98efe4c0cc375682ee66c9b2defabd1a341a8facf24f39`.
Two independent Blender 5.2.1 processes produced byte-identical outputs for all
six artifacts through the canonical V6 writer.

## Audition and gates

- Review page: `art-review/pulse-combat-finish-v7.html`
- Review scene SHA-256: `5631b80cb4cde185d7511a059b7518840e4899db020ac367661af470e582ca85`
- Candidate exact: `art-review/output/pulse-combat-finish-v7.png`
- Exact SHA-256: `c34bd01d0b691aa80514729e355ccc2761c11906ca718bbe8531a0b9faee9ec6`
- App TypeScript: pass.
- Focused Pulse clock units: 22/22 pass.
- App production build: pass.
- Diff whitespace check: pass.

## Honest result

V7 is materially stronger than V6: the player reads as one low manta craft
instead of four side-on pod cylinders, its drives are face-on and bounded, the
boss has a large vertical crown/eye anatomy with a clear red threat hierarchy,
the exchange uses five readable cyan orbs against four red cutting waves, and
the route camera has a genuine dark contact plane under the player. The new
textures have substantially higher cyan/white/red contrast.

It is still not self-accepted. Large safe-basic world surfaces and arches remain
visually simple, the purple distance field still dominates the background, and
the modeled lighting/material response remains behind the Furi reference's
production finish and combat-impact density. V7 is suitable for independent
anonymous comparison and possible root-owned registration only if that review
selects it. Until then, do not mutate the shared manifest or current route and
keep Pulse Tunnel labeled **`reference`**.
