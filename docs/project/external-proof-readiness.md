# External Proof Readiness

Generated: 2026-05-29T07:18:00Z

This document records the current machine state for the `TestV4PlanPRD.md`
items that require external services, subscriptions, credentials, or real
participants. It is not a pass substitute. It exists so the remaining gaps are
specific and reproducible instead of vague.

## Summary

| Area | Current State | Result |
|---|---|---|
| Cursor agent eval | `cursor agent --trust 'Reply with exactly: cursor-agent-ready'` exits with `You've hit your usage limit`. | blocked by Cursor usage/subscription limit |
| GitHub Copilot eval | `gh copilot --help` exits with `unknown command "copilot"`. | blocked by missing Copilot CLI/extension path |
| Sketchfab CC0 corpus | Public Sketchfab search finds a downloadable CC0 model, but `GET /v3/models/{uid}/download` returns HTTP 401 with `Authentication credentials were not provided.` | blocked by missing Sketchfab auth token |
| Meshy corpus | No `MESHY_*` credential is present in the environment. | blocked by missing Meshy auth/API access |
| Cloudflare Pages deployment | No `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is present. | blocked by missing Cloudflare credentials/project target |
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

Actual download link retrieval fails without auth:

```text
GET https://api.sketchfab.com/v3/models/01371cd3990f4d9587d40244b5e2a0a8/download
HTTP/2 401
{"detail":"Authentication credentials were not provided."}
```

This keeps the authenticated Sketchfab CC0 corpus item open.

### Meshy

No Meshy environment variables are present:

```text
MESHY_*: none
```

This keeps the Meshy export corpus item open.

### Deployment Hosts

Vercel public smoke now passes separately in
`tests/reports/external-deployment-smoke.json`. Cloudflare Pages and Netlify
remain credential-blocked.

```text
CLOUDFLARE_API_TOKEN: missing
CLOUDFLARE_ACCOUNT_ID: missing
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
- Sketchfab auth capable of downloading a CC0 model.
- Meshy export/API access.
- Cloudflare Pages credentials and project target.
- Netlify credentials and project target.
- npm auth or an approved GitHub-release beta artifact path.
- Three real marketing-comprehension participants.
- Five outside beta testers, with at least three starter renders recorded.
