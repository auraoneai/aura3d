# Render census 5.0.1 (branch fix/5.0.1-contact-shadow-mount)

Method: `node marketing/scripts/build-showcase-routes.mjs` (the real deploy route build, local engine source), served with
`python3 -m http.server` from `marketing/dist`; REA `capture_browser_scenario`, local Chrome 156, 960x540, 9-12 s settle
(REA default `reduced_motion: reduce`), screenshot + console. "Drawn" = the 3D scene visible in the PNG; errors = console
level "error" excluding `Failed to load resource ... 404` (unrelated missing fonts/thumbs).

## Final census (25 live games, last build = commit 9fdf418b2 + test-only edits)
| # | game (url) | drawn | error-level console (non-404) | root cause(s) fixed | fix commit |
|---|---|---|---|---|---|
| 1 | top-tennis | yes | 0 | contact-shadow guard | 07ea2266c |
| 2 | roadster-rush | yes | 0 | contact guard, then PRD07 snapshot stale in precompile | 07ea2266c, 9fdf418b2 |
| 3 | heatsink (Thermal Drift) | yes | 0 | contact guard | 07ea2266c |
| 4 | teleoperator | yes | 0 | contact guard | 07ea2266c |
| 5 | iron-crown | yes | 0 | blended caster "Alpha-hashed depth is not implemented" | 9fdf418b2 |
| 6 | pips-big-leap | yes | 0 | vertex shader used undeclared `a_tangent` (wind-only deform hook) | 9fdf418b2 |
| 7 | aura-hoops-3d | yes | 0 | stale manifest hashes (14), then transmission without lobe | 9fdf418b2 |
| 8 | aura-diamond-3d | yes | 0 | stale manifest hashes (19) | 9fdf418b2 |
| 9 | aura-fc-3d | yes | 0 | stale manifest hashes (6) | 9fdf418b2 |
| 10 | aura-links-3d | yes | 0 | reduced-motion pond had zero waves (`world.water` needs one; also broken at 4.7.13 under reduced motion) | 9fdf418b2 |
| 11 | bunker-zero | yes (menu overlay over blurred scene) | 0 | transmission without lobe | 9fdf418b2 |
| 12 | slingshot-siege | yes | 0 | alpha-to-coverage caster depth (two throw sites) | 9fdf418b2 |
| 13 | dot-dash-3d | yes | 0 | blended caster | 9fdf418b2 |
| 14 | cross-hop | yes | 0 | contact guard | 07ea2266c |
| 15 | craterline-gp (strange-orbit-port) | yes | 0 | blended caster | 9fdf418b2 |
| 16 | chroma-roll (splat-rush-port) | yes | 0 | blended caster | 9fdf418b2 |
| 17 | serpentine-sky-run | yes | 0 | blended caster | 9fdf418b2 |
| 18 | gridlock-courier (drift-and-deliver-port) | yes | 0 | `instances.mesh` registration tree-shaken from the source-aliased route build | 9fdf418b2 |
| 19 | ion-circuit (heatsink-port) | yes | 0 | none needed | - |
| 20 | shadowstep-gauntlet | yes | 0 | blended caster (+ pre-existing warning "draw skipped: Missing shader attribute a_position" for spiralorb-sparks) | 9fdf418b2 |
| 21 | lamplight-line | yes | 0 | blended caster | 9fdf418b2 |
| 22 | saltwind-highway | yes | 0 | blended caster | 9fdf418b2 |
| 23 | the-bellkeepers-walk | yes | 0 | blended caster | 9fdf418b2 |
| 24 | duneglide | yes | 0 | blended caster | 9fdf418b2 |
| 25 | cumulus-dash | yes | 0 | ImageBitmap flipY throw in WebGL texture upload | 9fdf418b2 |

Also verified earlier at 07ea2266c: kart-havoc (not in the live-25 list) draws.

## Other findings
- `GL_INVALID_VALUE: glGetProgramiv: Program object expected`: absent on the rolled-back live 4.7.13 top-tennis page (1 console event total) and
  absent after the fix; it was a symptom of the failed mount, not a separate defect.
- Local-serving artifacts (not defects): per-app `vite dev` lacks the deploy aliases and the root `public/` assets; the deploy route
  build above is the faithful way to serve. `apps/*/public` symlinks I created earlier are untracked (`.git/info/exclude`).
- Asset integrity: 5.0 verifies SHA-256 at load; 39 manifest entries in three route manifests no longer matched the shipped GLBs
  (files were rewritten in place after the manifest hashes were minted). Manifests were corrected to the shipped bytes. Other apps
  were scanned (426 refs): no further mismatches. The shipped files, not the manifests, are what 4.7.13 rendered.

## Throw-site audit (5.0 vs v4.7.13, default paths)
Decision key: DEGRADE = non-strict degrades with a one-time `console.warn` code, `A3D_QR_STRICT` keeps the throw; KEEP = legitimate validation of invalid input.

| site | code | decision |
|---|---|---|
| Renderer.ts contact guard (2 sites) | CONTACT_SHADOW_DEPTH_UNSUPPORTED | DEGRADE (`CONTACT_SHADOW_DEGRADED: <reason>`) |
| Prd02ContactShadowsContributor.validateContactDepthItems | CONTACT_SHADOW_DEPTH_UNSUPPORTED | DEGRADE |
| Prd07RendererBridge assert (precompile only) | PRD07_ATMOSPHERE_SNAPSHOT_STALE | re-bind to the live snapshot in precompile; frames still fail closed |
| DepthPass depthAlphaVariantForItem / assertCasterAlphaContract | DEPTH_ALPHA_HASH_UNSUPPORTED | DEGRADE (`DEPTH_ALPHA_HASH_DEGRADED`, casts as opaque like 4.7.x) |
| DepthPass alpha-to-coverage (2 sites) | DEPTH_ALPHA_COVERAGE_UNSUPPORTED, DEPTH_ALPHA_PROVIDER_UNSUPPORTED (feature prd04.alphaToCoverage only) | DEGRADE (`DEPTH_ALPHA_COVERAGE_DEGRADED`) |
| ForwardPass | TRANSMISSION_CAPTURE_UNAVAILABLE, GENERATED_DIFFUSE_TRANSMISSION_LOBE_UNAVAILABLE | DEGRADE (draws without transmission) |
| webgl2/TextureUpload.preflightSourceUpload | UNSUPPORTED_TEXTURE_FORMAT (ImageBitmap flipY) | DEGRADE (`TEXTURE_FLIPY_DEGRADED`, uploaded unflipped as in 4.7.x) |
| ProgramGenerator vertex source | GLSL compile error (undeclared a_tangent) | real bug, fixed |
| AssetIntegrityError (SHA-256) | AssetIntegrityError | KEEP (validation is correct; manifests repaired) |
| world.water zero waves | "at least one wave is required" | KEEP (unit-tested); links game fixed |
| engine public entry | `instances.mesh` factory not registered | real bug, fixed (side-effect imports) |
| remaining DepthPass masked-depth contracts (specialized geometry, packed member, instance alpha, forward alpha providers other than A2C), Renderer output-alpha/temporal/native-DOF/splat/volume/transmission-replay throws | various | NOT exercised by any of the 25 games; left as is. This list was read from the v4.7.13..HEAD diff, not exhaustively proven safe: a game that hits one will show the same blank-canvas failure and needs the same treatment. |

## Not done
- Templates (create-aura3d, 20) were not captured (time box).
- P1 note: contact shadows are skipped (not applied) in every scene that has another contributor pass or transparent queue
  (`contactGraphIsSafe()` is only true for a lone contact producer); 4.7.13 applied them.
