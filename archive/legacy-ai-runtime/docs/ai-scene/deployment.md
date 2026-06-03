# Deployment

Version: 0.1.0

AI scene deployment must separate deterministic local execution from optional live provider calls. Aura3D can integrate with OpenAI, Anthropic, Gemini, and local models, but deployed apps must choose how provider access is handled.

## Deployment Modes

| Mode | Provider behavior | Use |
|---|---|---|
| Static mock | Mock provider or checked-in scene IR only | Docs, CI, static demos, route health |
| Server proxy | Browser calls app server, server calls provider | Public demos and production apps |
| Local model | Browser or server calls local model endpoint | Private development or self-hosted workflows |
| Precomputed scenes | Prompts resolved before deployment | Marketing pages and high-traffic demos |

## Public Demo Rules

Public demos should not expose provider keys. Use one of:

- precomputed `AuraSceneIR`;
- mock provider;
- server-side provider proxy with redaction and rate limits.

## Server Proxy Requirements

A live-provider proxy should provide:

- secret storage outside the browser bundle;
- provider allowlist;
- request size limits;
- timeout and cancellation;
- rate limiting;
- structured error responses;
- prompt/provenance logging policy;
- secret redaction before reports;
- abuse monitoring.

## Export Artifacts

Deployments should be able to export:

- scene IR JSON;
- runtime diagnostics;
- asset provenance;
- draft artifact list;
- screenshot;
- patch history;
- quality-level report.

## Rollback

If live provider behavior breaks, the route should fall back to mock or precomputed IR with a visible status. It should not produce a blank scene or silently claim a live provider result.
