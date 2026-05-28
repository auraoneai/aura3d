# External Deployment Results

Generated: 2026-05-28

This document records the real external deployment smoke attempts for Round 13
of `TestV4PlanPRD.md`. Local static preview is already covered by
`tests/reports/package-clean-install.json`; this file is only for public-host
evidence.

## Summary

| Host | Status | Evidence | Result |
|---|---|---|---|
| Vercel | attempted | `vercel deploy --yes --cwd tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/dist` | deploy succeeded, but public smoke failed because the URL returns HTTP 401 deployment protection |
| Cloudflare Pages | not run | environment check | missing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
| Netlify | not run | environment check | missing `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` |

## Vercel Attempt

The machine is authenticated to Vercel as `gchahal1982`. The first upload hit a
transient TLS upload error, then a retry succeeded.

Created deployment URLs:

- `https://dist-oi5ldvhus-veerone.vercel.app`
- `https://dist-n022d0avm-veerone.vercel.app`

Both URLs return HTTP 401 before the Aura3D app can load. A redeploy with
`vercel deploy --yes --public --force` also returned HTTP 401; the CLI reported
that `--public` is deprecated and ignored for this protection setting.

## Current Verdict

External deployment smoke is not complete. Vercel reached a real external host
but did not produce a publicly readable rendered canvas. Cloudflare Pages and
Netlify could not be executed from this machine because the required account
credentials are not present.

## Next Action

Disable Vercel deployment protection for the smoke project or provide a project
that allows unauthenticated preview access, then rerun the same cinematic-scene
public smoke. Provide Cloudflare Pages and Netlify credentials or pre-created
project targets, then run the same build/deploy/HTTP/canvas/screenshot/MIME
checks for those hosts.
