# External Deployment Results

Generated: 2026-05-29T07:49:20.504Z

This document records real external deployment smoke evidence for Round 13
of `TestV4PlanPRD.md`. Local static preview remains covered by
`tests/reports/package-clean-install.json`; this file records public-host
evidence only.

## Summary

| Host | Status | Evidence | Result |
|---|---|---|---|
| vercel | protected | `https://dist-veerone.vercel.app` | Vercel deployment exists but is blocked by deployment protection before Aura3D can render. |
| vercel | protected | `https://dist-gchahal1982-veerone.vercel.app` | Vercel deployment exists but is blocked by deployment protection before Aura3D can render. |
| vercel | protected | `https://dist-3n5lgxoky-veerone.vercel.app` | Vercel deployment exists but is blocked by deployment protection before Aura3D can render. |
| vercel | public-smoke-pass | `https://aura3d-vercel-smoke.vercel.app` | Public Vercel route rendered Aura3D canvas with 36770 lit sample pixels and 78 color buckets. |
| vercel | failed | `https://dist-gray-iota-68.vercel.app` | Public Vercel route failed visual or MIME checks: visualPass=false, mimePass=true. |
| cloudflare-pages | public-smoke-pass | `https://aura3d-product-context-smoke.pages.dev` | Public Cloudflare Pages route rendered Aura3D canvas with 31873 lit sample pixels and 75 color buckets. |
| netlify | credential-blocked | environment check | Missing NETLIFY_AUTH_TOKEN and/or NETLIFY_SITE_ID; no secret values were inspected or recorded. |

## Public Host Smoke Detail

- Host: vercel
- URL: `https://aura3d-vercel-smoke.vercel.app`
- Ready: true
- Backend: webgl2
- Draw calls: 32
- Canvas screenshot bytes: 299112
- Pixel profile: lit=36770, center=10366, buckets=78
- Model resources: 200 model/gltf-binary https://aura3d-vercel-smoke.vercel.app/aura-assets/product-fixture.glb
- Diagnostics overlay visible: true. This is acceptable for deployment smoke evidence only; polished public demos should decide explicitly whether diagnostics are shown.
- Local screenshot evidence: `tests/reports/external-deployment-smoke/aura3d-vercel-smoke-vercel-app.png`

- Host: cloudflare-pages
- URL: `https://aura3d-product-context-smoke.pages.dev`
- Ready: true
- Backend: webgl2
- Draw calls: 32
- Canvas screenshot bytes: 340000
- Pixel profile: lit=31873, center=10797, buckets=75
- Model resources: 200 model/gltf-binary https://aura3d-product-context-smoke.pages.dev/aura-assets/product-fixture.glb
- Diagnostics overlay visible: true. This is acceptable for deployment smoke evidence only; polished public demos should decide explicitly whether diagnostics are shown.
- Local screenshot evidence: `tests/reports/external-deployment-smoke/aura3d-product-context-smoke-pages-dev.png`

## Current Verdict

External deployment smoke is not complete. Passing public hosts: vercel, cloudflare-pages. Remaining hosts: netlify.

## Next Action

Provide credentials or project targets for netlify, then run the same build/deploy/HTTP/canvas/screenshot/MIME checks for those hosts.

