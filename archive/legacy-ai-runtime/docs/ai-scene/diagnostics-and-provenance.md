# Diagnostics And Provenance

Version: 0.1.0

AI scene diagnostics explain what Aura3D actually built from a prompt. Provenance explains where the scene data came from without leaking secrets.

## Diagnostics Include

- provider and model
- selected backend
- quality target
- resolved assets
- placeholder assets
- approximations
- unresolved items
- warnings
- export readiness

## Provenance Includes

- provider id
- model id
- prompt hash or preview
- generated timestamp
- network usage flag
- patch history

Do not store API keys, bearer tokens, raw authorization headers, or provider secrets in diagnostics, provenance, reports, screenshots, or browser bundles.

## Verification

```sh
pnpm ai-scene:prompt-evidence
pnpm ai-scene:secret-audit
```
