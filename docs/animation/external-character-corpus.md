# External Animated Character Evidence

Version: 1.1.0

The current checked character corpus is small and local. It is useful for loader, animation, and skinning coverage, not for a broad marketplace-character claim.

## Assets

- `tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb`
- `tests/assets/corpus/khronos/Fox/Fox.glb`
- `tests/assets/corpus/animated-character-corpus.manifest.json`
- related GLB and product fixtures under `fixtures/asset-corpus/`

## What The Corpus Supports

- Imported glTF animation clips.
- Skeleton and skin data import.
- Motion and pose diagnostics in route tests.
- Selected browser-visible character routes such as `apps/wow-soldier-animation-viewer/`, `apps/wow-additional-cesium-man-animation/`, and `apps/wow-robot-expressive-rig/`.

## What It Does Not Support

- A claim that all third-party character assets import correctly.
- A claim that every rig, retargeting setup, facial-animation setup, or animation-controller workflow is production complete.
- A visual-quality claim without the corresponding browser screenshots and review reports.
