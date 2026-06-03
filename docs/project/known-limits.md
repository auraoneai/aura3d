# Aura3D Roadmap focus

Version: 1.0.0

## Current Report Limits

- `tests/reports/` is ignored by git, so report state is local and must be regenerated in clean checkouts, release jobs, and any workspace used for public claim evidence.
- Passing local reports support only the exact measured categories and routes named by those reports.

## Rendering Limits

- Renderer scene frustum culling is implemented, but it is not a broad large-scene performance claim.
- WebGPU behavior depends on browser and hardware support.
- PBR/IBL/material claims are feature-specific and route/report-specific. HDR environment map input is supported on named paths, but it is not physically complete image-based lighting.
- Postprocess support covers named passes and routes, not every low-level renderer code or game-engine post stack.
- Material coverage includes one primary UV path for glTF render resources, bounded KTX2/Basis transcoding coverage, GPU capability-driven format selection, and no product-studio material-matrix visual coverage.
- Shadow coverage includes unit-level moving-camera cascade split stress and point/spot shadow maps, but browser visual stress for long moving-camera paths remains evidence-bound.
- Skinning palette strategy and external character breadth remain evidence-bound.

## Asset Limits

- glTF/GLB support is strongest for checked fixtures and tested extension paths.
- Compression depends on decoder/transcoder availability and browser/device texture support.
- External marketplace and DCC export coverage requires explicit fixture and report evidence.

## Workflow Limits

- A3D is not documented as a Unity or Unreal replacement.
- Local examples are not public hosted demo evidence.
- Template scaffolds are starter projects and require build/run verification.

