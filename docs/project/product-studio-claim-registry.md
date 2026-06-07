# Claim Registry

Version: 1.1.0

This file is retained because `pnpm verify:claims` reads it as the public claim registry. It is no longer a product-studio milestone roadmap.

## Allowed Today

| Claim | Gate | Evidence Required |
|---|---|---|
| A3D has first-party browser 3D engine packages and workflow APIs. | Package/API verification | `package.json`, `packages/engine/src/index.ts`, `docs/api/public-api.md` |

## Blocked Until Gates Pass

| Claim | Gate | Evidence Required |
|---|---|---|
| A3D is better than low-level renderer code. | Full measured low-level renderer code superiority claim-defense gate | The generated low-level renderer code superiority audit and claim-defense reports must exist and pass, and the public wording must match the measured categories exactly. |
| A3D is production-ready for every browser 3D use case. | Release, browser, and support matrix gates | Current release, browser, package, route, and support reports must pass for the exact claim. |
| A3D has unqualified WebGPU support across browsers and devices. | WebGPU hardware and route matrix | `tests/reports/webgpu-hardware-matrix.json` plus route reports must prove the named browsers/devices. |
| A3D is Unity/Unreal for the web. | Out of scope | No current gate supports this claim. |

## Notes

