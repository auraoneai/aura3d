# Aura3D Claim Guidelines

Version: 2.0.0

Public claims and release wording are governed by `docs/project/product-studio-claim-registry.md`.

Date: 2026-06-18
Status: canonical project claim policy

Every public claim must identify the exact Aura3D path it applies to and the
evidence that proves it. A package, internal renderer, prototype route, or future
roadmap item cannot be used as proof for the public root `createAuraApp` path.

## Claim Labels

Use one of these labels in release notes, showcase READMEs, launch copy, and
internal handoff docs:

| Label | Meaning | Evidence required |
| --- | --- | --- |
| `proven` | The claim is implemented on the named path and passes current tests. | Browser or CLI evidence generated from the named path, with screenshots or logs available to reviewers. |
| `partial` | Some behavior exists, but coverage, quality, device support, or route scope is limited. | Exact supported subset plus remaining limitations. |
| `prototype` | A route or API exists for exploration, but it is not a durable product promise. | Source path, evidence status, and explicit non-launch wording. |
| `internal` | The behavior exists only in package internals or production-runtime code not exposed to public examples. | Internal package path and warning that public root examples cannot claim it. |
| `planned` | The behavior is on the roadmap and not shipped. | Roadmap item, owner area, and acceptance checks. |
| `blocked` | The behavior must not be promoted until named blockers close. | Blocking gate and next required evidence. |

## Required Claim Scope

Every public claim must name one of these scopes:

- `root createAuraApp safe API`;
- `production-runtime`;
- `rendering package internals`;
- `CLI asset pipeline`;
- `template scaffold`;
- `showcase route`;
- `benchmark comparison`;
- `roadmap`.

Examples:

- Allowed: "The root `createAuraApp` path can render typed static GLB assets
  with base-color materials when the route imports `model(assets.x)`."
- Allowed: "The production-runtime package contains stronger renderer concepts,
  but they are not the default public root path until the bridge lands."
- Blocked: "Aura3D has production renderer quality" without naming the path,
  route, tests, screenshots, and fallback behavior.

## Evidence Rules

Valid evidence for public claims includes:

- browser tests that import only public `@aura3d/engine` for root API claims;
- desktop and mobile screenshots with subject visibility checks;
- screenshot comparisons that prove animation, input, particles, or effect
  changes in the claimed region;
- route-health JSON declaring primary assets, primitive count, renderer backend,
  fallback state, route category, and claims;
- CLI asset validation with durable source/license/provenance metadata;
- source scans that reject `model("...")`, raw GLB/GLTF URLs, `unsafeModelUrl`,
  `GLTFLoader`, `three` imports, and direct renderer hacks;
- package tests, build logs, npm pack/install smoke checks, and generated API
  docs for package-track claims.

Invalid evidence for broad public claims includes:

- nonblank screenshot checks by themselves;
- screenshots where the main subject is tiny, clipped, hidden, or covered by UI;
- route-local evidence text not verified by tests;
- ignored local reports without regeneration context;
- source-only demos;
- primitive-only primary subjects for real-world or game examples;
- CSS or DOM effects standing in for scene particles, labels, or 3D rendering;
- internal renderer tests used as proof of root `createAuraApp` behavior;
- roadmap docs, deleted PRDs, or historical release notes.

## Blocked Claims

Do not claim these until the named gates pass:

- "Aura3D is a Three.js/Babylon/Unity/Unreal replacement." Use scoped
  comparison language only after
  `docs/project/superiority-evidence-workflow.md` passes.
- "Root `createAuraApp` uses the production renderer by default" is allowed only
  with the narrower boundary proven by
  `tests/reports/public-renderer-normal-path/report.json`: safe authored
  renderable scenes mount `production-runtime`; this is not a claim of complete
  Three.js renderer-feature parity.
- "Public examples have full PBR, HDR/IBL, production shadows, or cinematic
  postprocess." Blocked unless exact route screenshots prove those pixels.
- "Root examples generically support skinned GLB animation or morph targets."
  Blocked as a broad claim. A named route may make the narrower claim only when
  root-only screenshot pairs prove pose/morph changes for its exact typed asset.
- "Native WebGPU particles/rendering" is allowed only for the named SDK workload
  and six evidence routes in
  `tests/reports/webgpu-current-architecture/report.json`. Root-default WebGPU,
  general TSL/node-material parity, WebXR, and feature-complete WebGPU remain
  blocked. The narrower paired-source `PortableShaderMaterial` claim is allowed
  only with `tests/reports/portable-custom-materials/report.json`.
- "A showcase route is flagship quality." Blocked until
  `docs/project/showcase/quality-gates.md` passes for that route.
- "A game route is production playable." Blocked unless keyboard input changes
  visible state and tests prove movement, objective/scoring/fail state, reset,
  and genre mechanics.
- "The asset catalog returns production-ready game art." Blocked. Catalog search
  finds candidates; release readiness requires validation, license review,
  visual review, and route evidence.
- "Aura3D matches or exceeds Three.js performance." Blocked while the
  comparative performance report has six missing evidence inputs; feature
  inventory status and stale visual captures are not performance measurements.

## Allowed Product Wording Today

Use wording like:

- "Aura3D is an agent-friendly TypeScript browser 3D SDK."
- "Agents write normal TypeScript or JavaScript against public
  `@aura3d/engine` APIs."
- "Aura3D supports typed GLB/glTF asset workflows through the CLI and generated
  `src/aura-assets.ts`."
- "The public root API currently proves typed assets, basic GLB rendering,
  scene composition, runtime nodes, frame updates, and diagnostics on tested
  routes."
- "Advanced rendering, animation, and game-kit claims are path-specific and
  remain gated by current browser evidence."

## Review Checklist

- [ ] The claim names its scope.
- [ ] The claim uses a label: `proven`, `partial`, `prototype`, `internal`,
  `planned`, or `blocked`.
- [ ] The cited evidence exists, is current, and matches the scope.
- [ ] The claim does not rely on nonblank screenshots or local-only report names.
- [ ] The claim does not imply root API support from internal renderer evidence.
- [ ] The claim is consistent with `docs/project/status/known-limits.md` and
  `docs/project/launch-positioning.md`.
