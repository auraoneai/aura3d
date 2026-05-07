# Galileo3D

Version: 0.0.0-rebuild

Galileo3D is an experimental TypeScript web 3D engine prototype. The current repository contains verified subsystem slices, browser examples, product-style validation demos, and v2 release-readiness documentation.

The current evidence supports internal validation claims only. Do not describe this checkout as production-ready, a full Unity/Unreal replacement, a production PBR renderer, or broadly better than Three.js. Competitive wording is limited by `docs/v2/claim-registry.md` and `docs/known-limits.md`.

## Start Here

- `docs/getting-started.md`: practical first steps for running a checked example and building a starter app.
- `docs/v2/README.md`: v2 execution scope, gates, and current status.
- `docs/known-limits.md`: explicit boundaries for unsupported behavior.
- `examples/README.md`: browser examples and product-style proof slices.

## Local Verification

Run focused checks from the repository root:

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
pnpm test:visual
pnpm verify:demos
pnpm verify:claims
pnpm verify:trace
```

The full release gate is stricter:

```sh
pnpm verify:release
pnpm verify:release:repeat
```

Those commands are not currently proof of production readiness unless they pass from a clean checkout with current reports, versioned release evidence, external demo evidence, and independent reproduction evidence.
