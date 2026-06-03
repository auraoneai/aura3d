# External Proof Readiness

Generated: 2026-05-29T07:40:00Z

This document records the current machine state for external services, subscriptions, credentials, or real participants required by scoped release evidence and benchmark-superiority gates. It is not a pass substitute. It exists so the remaining gaps are
specific and reproducible instead of vague.

## Summary

| Area | Current State | Result |
|---|---|---|
| Cursor agent eval | `cursor agent --trust 'Reply with exactly: cursor-agent-ready'` exits with `You've hit your usage limit`. | blocked by Cursor usage/subscription limit |
| GitHub Copilot eval | `gh copilot --help` exits with `unknown command "copilot"`. | blocked by missing Copilot CLI/extension path |
| Sketchfab CC0 corpus | Authenticated Sketchfab API access downloaded a CC0 GLB, then Aura3D `assets add`, `assets validate`, typegen, build, and browser render passed. | pass |
| Meshy corpus | Meshy does not provide API access for the current free-user account. | blocked by unavailable Meshy auth/API access |
| Cloudflare Pages deployment | Authenticated Cloudflare Pages deployment and public browser smoke passed at `https://aura3d-product-context-smoke.pages.dev`. | pass |
| Netlify deployment | No `NETLIFY_AUTH_TOKEN` or `NETLIFY_SITE_ID` is present. | blocked by missing Netlify credentials/project target |
| npm beta publish | `npm whoami` returns `E401 Unauthorized`. | blocked by missing npm auth |
| GitHub beta intake | `gh auth status` is logged in as `gchahal1982`; `.github/ISSUE_TEMPLATE/aura3d_beta_dogfood.yml` exists. | intake template ready, but no outside users have run it |

## Exact Probe Results

### Cursor

```text
cursor agent --trust 'Reply with exactly: cursor-agent-ready'
S: You've hit your usage limit Get Cursor Pro for more Agent usage, unlimited Tab, and more.
```

This means the Cursor five-task context-only eval cannot be completed from this
machine without additional Cursor agent usage.

### GitHub Copilot

```text
gh copilot --help
unknown command "copilot" for "gh"
```

This means the Copilot five-task context-only eval needs a separate subscribed
Copilot environment or an installed Copilot-capable CLI/workflow.

### Sketchfab

Public search works:

```json
{
  "uid": "01371cd3990f4d9587d40244b5e2a0a8",
  "name": "Mermaid2",
  "license": { "label": "CC0 Public Domain" },
  "downloadable": true
}
```

Authenticated download and import now pass:

```json
{
  "model": "Mermaid2",
  "uid": "01371cd3990f4d9587d40244b5e2a0a8",
  "license": "CC0 Public Domain",
  "format": "glb",
  "checks": [
    "sketchfab-download",
    "sketchfab-assets-add",
    "sketchfab-assets-validate",
    "sketchfab-typegen-created",
    "sketchfab-browser-render"
  ]
}
```

Evidence: `docs/project/sketchfab-asset-corpus-results.md` and
`tests/reports/sketchfab-asset-corpus.json`. Secret values were supplied only
through process environment for the run and were not written to repository
files.

### Meshy

Meshy API access is unavailable for the current free-user account:

```text
MESHY_*: unavailable for current account
```

This keeps the Meshy export corpus item open.

### Deployment Hosts

Vercel and Cloudflare Pages public smoke now pass in
`tests/reports/external-deployment-smoke.json`. Netlify remains
credential-blocked.

```text
CLOUDFLARE_API_TOKEN: supplied for run, not recorded
CLOUDFLARE_ACCOUNT_ID: supplied for run, not recorded
NETLIFY_AUTH_TOKEN: missing
NETLIFY_SITE_ID: missing
```

### Beta Publication And Intake

GitHub auth exists and the beta issue template exists, but npm publication is
not available from this machine:

```text
npm whoami
npm error code E401
npm error 401 Unauthorized
```

This means a tarball or GitHub-release beta handoff can be prepared, but npm
beta publication and outside-user dogfood cannot be honestly marked complete
until real testers run the install/scaffold flow and file evidence.

## Remaining External Inputs Needed

- Cursor agent usage or a subscribed Cursor environment.
- Copilot agent/CLI access.
- Meshy export/API access.
- Netlify credentials and project target.
- npm auth or an approved GitHub-release beta artifact path.
- Three real marketing-comprehension participants, if validating marketing
  copy. This is not library release proof under `docs/project/frozen-benchmark-release-gates.md`.
- Five outside beta testers, with at least three starter renders recorded, for
  post-1.0 product feedback rather than the library release gate.
