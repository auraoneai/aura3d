# Asset Corpus Report

Version: 0.1.0-alpha.0

This page summarizes the checked-in asset corpus report used by the current external-claim gates. It is a bounded compatibility report, not a production asset guarantee.

## Source Report

- Report: `tests/reports/gltf-corpus.json`
- 100-asset classification report: `tests/reports/gltf-100-classification.json`
- Loader compatibility scaffold: `tests/reports/asset-compatibility-threejs.json`
- Blender-export fixture validation: `tests/reports/blender-export-validation.json`
- Manifest schema: `gltf-corpus-v1`
- Report schema: `gltf-corpus-report-v1`
- Compatibility schema: `asset-compatibility-report-v1`
- Source corpus: Khronos glTF Sample Assets
- Source revision: `2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf`
- Asset count: 17
- 100-asset classification count: 100

## Current Summary

| Status | Count | Meaning |
|---|---:|---|
| pass | 11 | The asset is expected to pass the current importer/render-resource profile. |
| warn | 4 | The asset is usable for importer validation with a documented caveat. |
| expectedFail | 2 | The asset intentionally documents a known unsupported path. |

## 100-Asset Classification Summary

`tests/assets/corpus/gltf-100-classification.manifest.json` records 100 pinned Khronos GLB entries from the same source revision with SHA-256 hashes. `tests/reports/gltf-100-classification.json` classifies those entries as source-level pass/warn/expected-fail evidence:

| Status | Count | Meaning |
|---|---:|---|
| pass | 38 | The asset has no source-metadata caveat in the classification manifest. |
| warn | 62 | The asset is pinned and classified, but source metadata indicates extension, showcase, issue-tagged, or video-texture coverage that requires focused importer/render/visual validation before compatibility claims. |
| expectedFail | 0 | No entry in this 100-asset classification report is marked as an expected failure. |

## Blender-Export Fixture Validation

`tests/assets/corpus/blender/blender-export-fixtures.manifest.json` records three pinned Blender-exported glTF fixtures copied from Khronos Vulkan Samples Assets revision `8db8ce9c528330f0b1261b07531b009732b08731`. The manifest stores SHA-256 hashes, upstream paths, license metadata, and expected Blender generator metadata for each fixture.

`tests/reports/blender-export-validation.json` validates those fixtures through Galileo3D's glTF loader and scene renderable collection:

| Status | Count | Meaning |
|---|---:|---|
| pass | 3 | The fixture contains Blender generator metadata, matches its pinned SHA-256 hash, loads through Galileo3D's glTF loader, and produces at least one renderable. |
| warn | 0 | No fixture currently has a non-fatal Blender-export validation caveat. |
| fail | 0 | No fixture currently fails the bounded Blender-export validation runner. |

## Known Corpus Caveats

- `multi-uv-test` is expected to fail because the current material path supports one UV set per draw.
- `meshopt-cube-test` is expected to fail in the default no-decoder corpus profile, and passes in the package-backed decoder integration test where `meshoptimizer` is injected.
- `box-textured` carries a trademark/license warning and should not be used as product art.
- `duck`, `cesium-man`, and `damaged-helmet` carry license/trademark caveats and should be used only for importer validation under their upstream license terms.

## Loader Compatibility Scaffold

`createAssetCompatibilityReport()` emits a bounded compatibility matrix from the same pinned manifest. The Galileo3D column mirrors the current corpus classification and preserves normalized import settings for color space, mipmaps, compression, scale, normals/tangents, animation import, and material variants.

The Three.js and Babylon.js columns are executed with pinned loader versions in a Node compatibility harness. The same-corpus `blender-export` column remains `not-run` because the 17-entry Khronos loader corpus is not a Blender re-export corpus. Separate Blender-export fixture evidence now lives in `tests/reports/blender-export-validation.json`. This report exists to prevent accidental parity claims from being based on scaffold-only or unrun loader evidence.

The 17-entry corpus remains the bounded loader-compatibility corpus. The 100-entry report proves real pinned source classification breadth, but it is intentionally not a loader/render/visual parity claim. Separate package-backed tests now prove bounded Draco and Meshopt decoder integration against pinned Khronos assets, the KTX2/Basis transcode path has a separate real Khronos fixture test, and the Blender-export path has a three-fixture validation report. The corpus still does not prove a local Blender executable export round trip, broad Blender/exporter corpus coverage, broad KTX2/Basis corpus coverage, visual parity, or production asset compatibility.
