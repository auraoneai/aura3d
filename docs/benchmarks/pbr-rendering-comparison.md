# PBR Rendering Comparison

Version: 0.0.0-rebuild

This report documents the narrow rendered PBR comparison slice for Galileo3D v2.

## Scope

The comparison renders one checked-in perspective-camera scene in Galileo3D WebGL2 and a same-page Three.js reference. The scene uses three material spheres, direct lights, a shared generated RGBA8 equirectangular environment source, and retained screenshot artifacts.

The report artifact is:

```text
tests/reports/pbr-rendering-comparison.json
```

The retained image artifacts are:

```text
tests/reports/pbr-material-lab-galileo.png
tests/reports/pbr-material-lab-threejs.png
tests/reports/pbr-material-lab-diff.png
```

## Claim Boundary

Allowed wording is limited to a bounded comparison scene. It must not be described as production PBR parity, full IBL, HDR environment support, broad visual superiority, loader parity, or a general Three.js replacement.

## Verification

Generate the report with:

```sh
pnpm exec playwright test tests/visual/pbr-environment-pixels.spec.ts
```

The full visual aggregate also runs this check:

```sh
pnpm test:visual
```
