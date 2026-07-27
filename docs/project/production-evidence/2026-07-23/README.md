# Aura3D Production Evidence — 2026-07-23

This directory records the Aura3D 1.4.5 public developer-product launch. Aura3D is
distributed as npm packages plus a branded marketing/docs/showcase site; it is not a
hosted multi-tenant SaaS application.

## Release Receipts

| Surface | Result |
| --- | --- |
| npm registry | 26/26 public workspace packages resolve to version 1.4.5 |
| Representative registry smoke | Published engine, `create-aura3d`, and CLI checks pass |
| GitHub release | `v1.4.5`, public, non-prerelease, 26 assets |
| Production deployment | `dpl_HbEsEz44zJSnu8R1zkvg2RmmXG9b` |
| Immutable production URL | `https://marketing-1q5qqbfdf-veerone.vercel.app` |
| Branded URL | `https://aura3d.auraone.ai` |
| Retained rollback | `dpl_6xp2zFcQ8ryLoFxfuKhReebzJzLg` |
| Public route health | 15/15 probes returned HTTP 200 |
| Visual proof | 10/10 home and promoted showcase checks passed |
| Aura Clash proof | 3/3 public aliases passed canvas, resource, release, and control checks |

DNS resolves through Vercel, the certificate includes `aura3d.auraone.ai`, HTTP
redirects to HTTPS, and HSTS is enabled.

## Artifacts

- `visual-proof.json` — desktop/mobile marketing and promoted showcase route results.
- `aura-clash-visual-proof.json` — three-route WebGL canvas, GLB/audio resource,
  release-version, and interaction proof.
- `home-desktop.png` and `home-mobile.png` — branded production home at 1440x900 and
  390x844.
- `showcase-index.png` — public showcase library.
- `product-configurator.png`, `smart-city-control.png`,
  `cinematic-architecture.png`, `digital-twin-ops.png`, `blockfall-reactor.png`,
  `turbo-drift-circuit.png`, and `skyline-runner.png` — promoted route screenshots.
- `aura-clash-playable.png`, `aura-clash-app-alias.png`, and
  `aura-clash-canonical.png` — the three verified public Aura Clash routes.

All screenshots were captured from `https://aura3d.auraone.ai` after the production
alias pointed to `dpl_HbEsEz44zJSnu8R1zkvg2RmmXG9b`.
