# Verification Evidence

Date: 2026-08-08
Status: Aura3D 1.6.0 evidence policy and candidate status

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

The 1.6 candidate has current focused evidence for package exports, lean bundle
entries, the single production physics owner, 35 Tier 1/2 browser routes, the
selected 54-row Three.js inventory, seven named same-asset animation fixtures,
resource lifecycle, and nine restored public evidence routes. Those results are
scoped to their named commands, routes, assets, browsers, and thresholds.

The aggregate public showcase gate is still held until a human verdict is
recorded for Product Configurator, Smart City Control, Cinematic Architecture,
and Digital Twin Operations. Blockfall Reactor, Turbo Drift Circuit, and Skyline
Runner remain `prototype-blocked` regardless of their technical evidence.

The release itself is not proven complete until two serial full-suite runs from
the same clean commit pass and npm registry, tarball integrity, Git tag, GitHub
release, Vercel deployment, production-origin routes, and clean installed-package
checks have durable receipts. Until then the public-safe statement is:

"Aura3D 1.6.0 is a release candidate with current package, bundle, typed-asset,
browser-route, and scoped comparison evidence. Showcase and advanced
renderer/game claims remain route-specific, and publication/deployment claims
remain pending until their post-release checks pass."
