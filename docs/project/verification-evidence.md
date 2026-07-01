# Verification Evidence

Date: 2026-06-18
Status: evidence policy

This document defines what counts as evidence for release and showcase claims.
It does not certify that all evidence currently exists.

## Evidence Classes

| Class | Proves | Does not prove |
| --- | --- | --- |
| Package checks | Build, typecheck, tests, packaging, install smoke for a package release. | Visual quality, showcase readiness, benchmark superiority. |
| Public root browser tests | Behavior available through root `@aura3d/engine` imports. | Internal production-runtime capability unless the route actually uses the public bridge. |
| Route-health JSON | Declared category, primary assets, primitive count, backend/fallback state, and claims for a route. | Pixel readability by itself. |
| Desktop/mobile screenshots | First-load visual state and responsive framing. | Animation, input, or effects unless compared across interactions/frames. |
| Screenshot deltas | Visible animation, particle, input, or material/effect changes. | The exact cause of the change unless tied to telemetry and source state. |
| CLI asset validation | Typed asset presence, inspection metadata, license/provenance fields, and validation diagnostics. | Production art quality by itself. |
| Hosted deploy checks | Public URL availability and static asset serving. | Local route quality unless screenshots and route-health come from the hosted origin. |
| Frozen benchmark results | Scoped comparison outcome for a locked prompt/protocol. | General market superiority beyond the benchmark scope. |

## Required Route Evidence

Every promoted showcase route must provide:

- route category and claim label;
- primary asset list and whether each asset is typed;
- primitive count and route-specific primitive budget;
- renderer/backend/fallback state;
- desktop screenshot;
- mobile screenshot;
- source scan result for unsafe asset/rendering patterns;
- route claims and matching evidence paths.

Game routes must additionally provide:

- keyboard input test;
- visible movement or state change after input;
- objective, scoring/fail state, reset, and progression/loop evidence;
- genre-specific mechanic evidence.

Animation, particle, postprocess, material, WebGPU, and skinned/morph claims
must include screenshot or video evidence that isolates the claimed behavior.

## Evidence Rejection Rules

Reject evidence when:

- the route imports `three`, `GLTFLoader`, renderer internals, or raw GLB URLs;
- the root API claim depends on internal-only code;
- the route uses `model("...")` rather than `model(assets.x)`;
- the primary subject is primitive-only for a real-world or game claim;
- screenshots are only checked for file size or nonblank pixels;
- the main subject is tiny, clipped, hidden, or covered by UI;
- route-local text claims a capability that tests do not detect;
- report files are local/ignored and cannot be regenerated;
- WebGPU claims lack adapter/backend/dispatch/render/fallback evidence.

## Current Evidence Status

The remediation PRD identifies current evidence gaps. Until the new gates are
implemented, treat prior "complete" or "verified" language in older docs as
historical and insufficient for public release claims.

Current minimum public-safe statement:

"Aura3D has package, CLI, typed asset, basic browser route, and diagnostics
surfaces. Showcase and advanced renderer/game claims remain route-specific and
must pass the updated evidence gates before promotion."
