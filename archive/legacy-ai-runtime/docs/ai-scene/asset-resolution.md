# Asset Resolution

Version: 0.1.0

AI scene asset resolution maps semantic requirements from `AuraSceneIR.assetRequirements` to local fixtures or explicit placeholders.

## Current Behavior

- Known fixtures resolve from the local asset library.
- Missing production assets become primitive placeholders.
- Reports list resolved assets, placeholders, missing assets, and diagnostics.
- No network downloads are required.

## Fixture Manifest

The deterministic fixture manifest for AI scene tests is:

```text
fixtures/ai-scene-asset-library/manifest.json
```

It documents placeholder assets for robot, flower, and wet-stage requirements.

## Verification

```sh
pnpm ai-scene:prompt-evidence
```
