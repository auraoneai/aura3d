# Claim Registry

Version: 1.0.0

This file is retained because `pnpm verify:claims` reads it as the public claim registry. It is no longer a product-studio milestone roadmap.

## Allowed Today

| Claim | Gate | Evidence Required |
|---|---|---|
| A3D has first-party browser 3D engine packages and workflow APIs. | Package/API verification | `package.json`, `packages/engine/src/index.ts`, `docs/api/public-api.md` |
| A3D has current generated evidence for tracked Three.js feature inventory and visual parity slices. | Three.js parity reports | `tests/reports/threejs-parity/threejs-inventory.json`, `tests/reports/threejs-parity/same-scene-render.json`, `tests/reports/threejs-parity/visual-review.json` |
| A3D has Three.js superiority feature and visual-quality aggregate reports in the current local report tree. | Three.js superiority focused reports | `tests/reports/superiority/feature-parity.json`, `tests/reports/superiority/visual-quality.json` |

## Blocked Until Gates Pass

| Claim | Gate | Evidence Required |
|---|---|---|
| A3D is better than Three.js. | Full measured Three.js superiority claim-defense gate | The generated Three.js superiority audit and claim-defense reports must exist and pass, and the public wording must match the measured categories exactly. |
| A3D is production-ready for every browser 3D use case. | Release, browser, and support matrix gates | Current release, browser, package, route, and support reports must pass for the exact claim. |
| A3D has full WebGPU support. | WebGPU hardware and route matrix | `tests/reports/webgpu-hardware-matrix.json` plus route reports must prove the named browsers/devices. |
| A3D is Unity/Unreal for the web. | Out of scope | No current gate supports this claim. |

## Notes

The current local Three.js parity and superiority report sets pass after regeneration in this workspace. Because `tests/reports/` is ignored by git, clean checkouts and release jobs must regenerate those reports before making any report-backed claim. Do not publish unqualified "better than Three.js" wording unless the generated superiority audit, claim-defense report, and release boundary docs support that exact language.
