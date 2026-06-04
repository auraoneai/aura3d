# Cinematic Quality Gates

cinematic previs quality gates prevent draft artifact-looking output from being described as cinematic realtime previs. They combine schema checks, runtime checks, screenshot checks, asset checks, secret checks, and claim checks.

## Required Evidence

A cinematic route should produce reports for:

- provider contracts;
- route health;
- screenshot quality;
- runtime readiness;
- scene-diff quality;
- asset readiness;
- secret audit;
- claim scan;
- completion audit.

Reports should include `schema`, `generatedAt`, `pass`, `inputs`, `evidence`, `providerMode`, `backend`, and `failures`. Reports must distinguish `fixture`, `mock`, and live provider modes.

## Runtime Gates

Runtime readiness should fail when:

- the public cinematic route uses `canvas2d-previs` as the claimed backend;
- the scene has no hero object;
- the scene has no environment or set geometry;
- the scene has no cinematic light;
- the scene has no camera path or timeline;
- the scene reports unresolved hero assets;
- provider failure blanks the scene instead of falling back visibly.

## Screenshot Gates

Screenshot gates should fail when:

- the image is blank or near-blank;
- the route depends mainly on DOM/CSS overlays for cinematic content;
- rain, fog, neon, or the hero flower are not renderer-owned scene content;
- the composition looks like a product turntable rather than the north-star cinematic route;
- draft artifact colors, grid-only scenes, or debug labels dominate the frame;
- the screenshot cannot be tied to provider mode, backend, prompt, and generated time.

Useful metrics include non-background pixel ratio, luminance variance, color diversity, contrast, central subject occupancy, atmospheric layer presence, and repeated draft artifact-color detection. Metrics should support human review, not replace it.

## Asset Gates

Asset readiness should fail when:

- `asset-manifest.json` is missing;
- manifest schema is absent or unsupported;
- no hero role exists;
- no environment or set role exists;
- no VFX or material role exists for the cinematic fixture;
- a required asset lacks provenance;
- public fixture hero roles resolve to draft artifacts.

## Secret Gates

Secret audit should fail when:

- browser bundles include raw provider keys;
- diagnostics, screenshots, exports, reports, or logs include secrets;
- a template asks users to put provider keys in `VITE_*` variables;
- live mode can run without an explicit server-side proxy configuration.

The audit should redact authorization headers, bearer tokens, cookies, `x-api-key`, provider-specific key variables, and key-shaped strings before writing evidence.

## Claim Gates

Claim scan should block final-film language unless the page is explicitly explaining that the claim is not allowed. Avoid:

- final film;
- studio-final;
- Pixar-quality;
- production animation replacement;
- finished VFX;
- offline renderer equivalence.

Preferred wording is "cinematic realtime previs" or "asset-backed realtime previs."

## Template Gate

Template starter projects include a local `pnpm quality` script. It checks the manifest, provider-mode text, export support, no-key defaults, and obvious secret leaks. This is a starter gate, a focused production workflow for full cinematic previs route screenshots and runtime evidence.
