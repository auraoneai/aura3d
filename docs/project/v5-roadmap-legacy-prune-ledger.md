# V5 Legacy Prune Ledger

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This ledger preserves cleanup from EngineReadiness, V2, V3, and V4. Deleted demo-era files must stay deleted unless this ledger explicitly allows a V5 product-grade replacement.

## docs/project/v4-engine-readiness-plan.md legacy deletions

| Path | Deletion reason | Allowed to return | V5 replacement path | Replacement evidence |
| --- | --- | --- | --- | --- |
| `examples/product-configurator/` | Pre-V5 one-off demo replaced by product-grade V4/V5 workflow templates. | no | `examples/three-compat-examples/product-configurator/` | pending Milestone 16 |
| `examples/postprocess-lab/` | Legacy lab replaced by V5 postprocess studio/example requirements. | no | `examples/three-compat-examples/postprocess-bloom/`, `examples/three-compat-examples/postprocess-dof/` | pending Milestone 11 and 16 |
| `examples/shadow-lab/` | Legacy lab replaced by renderer/shadow readiness and V5 renderer breadth. | no | `examples/three-compat-examples/architecture-interior/` | pending Milestone 5 and 16 |

## docs/project/v2-roadmap-product-asset-pipeline-plan.md legacy deletions

| Path | Deletion reason | Allowed to return | V5 replacement path | Replacement evidence |
| --- | --- | --- | --- | --- |
| `examples/portfolio/` | Screenshot portfolio is not a product surface and must not become release proof. | no | `tests/reports/three-compat-gallery/` | pending V5 gallery |
| `examples/portfolio/screenshots/animation-state-machine.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/character/character-animation.png` | pending V5 gallery |
| `examples/portfolio/screenshots/architecture-viewer.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/architecture-day/interior-daylight.png` | pending V5 gallery |
| `examples/portfolio/screenshots/asset-viewer.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/assets/asset-inspector.png` | pending V5 gallery |
| `examples/portfolio/screenshots/editor-authored-project.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/threejs-migration/migrated-threejs-scene.png` | pending V5 gallery |
| `examples/portfolio/screenshots/game-slice.png` | Static legacy screenshot and not a V5 product claim. | no | none | blocked |
| `examples/portfolio/screenshots/pbr-camera-comparison.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/materials/material-library.png` | pending V5 gallery |
| `examples/portfolio/screenshots/pbr-material-lab.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/materials/material-library.png` | pending V5 gallery |
| `examples/portfolio/screenshots/physics-sandbox.png` | Static legacy screenshot and not a V5 product claim. | no | none | blocked |
| `examples/portfolio/screenshots/postprocess-lab.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/postprocess/cinematic-postprocess.png` | pending V5 gallery |
| `examples/portfolio/screenshots/product-configurator.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/product/premium-product-viewer.png` | pending V5 gallery |
| `examples/portfolio/screenshots/rendering-large-scene.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/large-scene/large-instanced-scene.png` | pending V5 gallery |
| `examples/portfolio/screenshots/shadow-lab.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/architecture-night/interior-night.png` | pending V5 gallery |
| `examples/portfolio/screenshots/showcase-world.png` | Static legacy screenshot. | no | `tests/reports/three-compat-gallery/vfx/particle-vfx.png` | pending V5 gallery |

## docs/project/v3-roadmap-product-workflow-plan.md legacy deletions

| Path | Deletion reason | Allowed to return | V5 replacement path | Replacement evidence |
| --- | --- | --- | --- | --- |
| `examples/architecture-viewer/` | Legacy example replaced by V5 architecture/interior template and app requirements. | no | `examples/three-compat-examples/architecture-interior/`, `templates/three-compat-architecture-interior/` | pending Milestone 16 and templates |
| `examples/game-slice/` | Legacy game slice is not a V5 supported replacement claim. | no | none | blocked |

## docs/project/v4-roadmap-visual-engine-plan.md legacy deletions

| Path | Deletion reason | Allowed to return | V5 replacement path | Replacement evidence |
| --- | --- | --- | --- | --- |
| `examples/product-configurator/` | V4+ use versioned product configurator examples and templates. | no | `examples/three-compat-examples/product-configurator/` | pending Milestone 16 |
| `examples/postprocess-lab/` | V5 must use product-grade postprocess examples and app. | no | `apps/three-compat-postprocess-studio-pro/`, `examples/three-compat-examples/postprocess-bloom/` | pending Milestone 11 and 16 |

## V5 Retained Baseline Evidence

V4 evidence may remain only as comparison, baseline, migration, or regression evidence. It must not be counted as V5 flagship completion:

- `tests/reports/external-gallery/`
- `tests/reports/external-parity-threejs-visual-parity/`
- `docs/project/v4-*-roadmap/`
- `docs/project/v4-roadmap-visual-engine-plan.md`

