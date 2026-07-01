# MARKETING KNOWLEDGE BASE

**Scope:** `marketing/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 8 - separate site and public claim surface.

## OVERVIEW

Marketing is a separate Vite site with public copy and generated build output.
It must obey the same claim labels as docs and showcase apps.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Site source | `src/`, `public/` | Edit source, not generated output. |
| Site config | `package.json`, `vite.config.ts`, `tsconfig.json` | Local app build setup. |
| Generated output | `dist/`, `.vercel/output/` | Build artifacts; do not hand-edit. |
| Static assets | `public/aura-assets/` | Generated/copy assets used by the site. |

## CONVENTIONS

- Public claims must match `docs/agents/claims-and-boundaries.md`.
- Copy can describe Aura3D as a TypeScript SDK and asset deployment pipeline,
  but must not imply unproven production renderer parity.
- Use real route screenshots or evidence-backed media for product claims.
- Keep marketing app dependencies local to `marketing/package.json`.
- If marketing references a showcase route, confirm that route still has
  matching route-health or launch evidence.

## ANTI-PATTERNS

- Do not edit `.vercel/output`, `dist`, or copied build artifacts as source.
- Do not use aspirational product claims without `prototype` or `roadmap`
  wording.
- Do not present CSS/DOM visuals as Aura3D renderer evidence.
- Do not invent assets or screenshots for public copy.

## VERIFY

Run the marketing build/test command from `marketing/package.json` when source
changes. For copy changes, also check the referenced evidence or docs label.
