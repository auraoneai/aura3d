# Release Tracks

Date: 2026-08-08
Status: 1.6.0 release-candidate tracks

Aura3D releases are split into independent tracks. Passing one track does not
grant claims for another.

## Track 1: Package Runtime Release

Purpose: publish SDK packages, CLI packages, templates, and generated docs.

Allowed claims when this track passes:

- packages build and typecheck;
- package entrypoints match generated API docs;
- npm pack/install smoke checks pass;
- CLI commands used by the release are runnable;
- docs describe the public API contract for the shipped package version.

Not allowed from this track alone:

- showcase routes are flagship quality;
- root `createAuraApp` has production-renderer parity;
- high-end material, lighting, postprocess, animation, or WebGPU behavior exists
  in public examples unless route evidence proves it;
- game routes are production playable.

Required gates:

- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration` when relevant
- `pnpm build`
- `pnpm verify:api-docs -- --write` after export changes
- `pnpm verify:package-install-smoke:fresh`
- `pnpm verify:package-provenance`
- `npm pack --dry-run --json`
- `node tools/release/publish-all.mjs --dry-run` for the 26-package monorepo
  release, with npm auth stored outside the repository

## Track 2: Showcase Candidate Release

Purpose: classify and test showcase routes as demos, diagnostics, prototypes, or
public release candidates.

Allowed claims when this track passes for a route:

- the route loads and exposes route-health evidence;
- the route uses typed primary assets or is explicitly abstract;
- desktop and mobile screenshots show a readable main subject;
- interaction changes scene state where interaction is claimed;
- game input visibly changes gameplay state where a game claim is made.
- visual review passes for public release candidates.
- game routes have retained game-geometry evidence when they claim public
  racing or platformer quality.

Not allowed from this track alone:

- public marketing launch without Track 3;
- benchmark superiority;
- broad claims about all Aura3D examples.

Required gates:

- `docs/project/showcase/quality-gates.md`
- source scan for unsafe asset/rendering patterns;
- per-route primitive budget;
- route-health JSON;
- desktop and mobile screenshots;
- game input tests for game routes;
- copy review against `docs/project/claim-guidelines.md`.
- `node tools/showcase-library/build-and-check.mjs`

Current status for this track: four non-game route-library candidates have current automated
evidence and await a recorded human visual verdict. Blockfall Reactor, Turbo Drift Circuit, and
Skyline Runner remain `prototype-blocked` and cannot be promoted. Aura Clash is tracked separately
as a development showcase. Data Galaxy and WebGPU Particle Lab remain internal diagnostics.

## Track 3: Marketing Launch Release

Purpose: publish website, README, examples, and public copy.

Allowed claims:

- only claims listed as allowed in `docs/project/launch-positioning.md`;
- only route-specific showcase claims with current evidence;
- package claims only if Track 1 passed for the selected version.

Required gates:

- Track 1 for package claims;
- Track 2 for every promoted route;
- marketing-site checks in `docs/project/marketing-site.md`;
- claim review against `docs/project/claim-guidelines.md`;
- public deployment checks for hosted route claims.

## Track 4: Benchmark/Superiority Release

Purpose: compare Aura3D against external or low-level renderer baselines.

Allowed claims:

- only the exact comparison result from the frozen protocol;
- only after neutral scoring and engine parity checks pass.

Required gates:

- `docs/project/frozen-benchmark-release-gates.md`;
- `docs/project/superiority-evidence-workflow.md`;
- committed benchmark results, scoring artifacts, and decision file;
- no owner-only scoring bypass.

## Track 5: Roadmap/Internal Capability

Purpose: document planned or internal work without marketing it as shipped.

Allowed claims:

- internal package contains a capability;
- roadmap item is planned;
- prototype demonstrates direction but is not a public contract.

Required gates before promotion:

- library acceptance checks in `docs/project/roadmaps/library-gap-roadmap.md`;
- public root API tests when the claim targets root `@aura3d/engine`;
- docs updates that explain fallback behavior and limitations.

## Current Recommendation

Treat package/runtime work and showcase/marketing work as separate. Do not promote a candidate
until its route-level gates and current human visual review pass. Never infer visual quality from
package stability, and never broaden the scoped comparison reports into universal superiority.
