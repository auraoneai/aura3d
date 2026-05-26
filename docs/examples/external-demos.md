# External Demo Status

Version: `1.0.0`

The repository contains local external-demo example folders and templates, but this document should not be read as proof that durable public demo URLs are deployed.

## Local Sources

- `examples/external-product-configurator/`
- `examples/external-material-studio/`
- `examples/external-asset-gallery/`
- `examples/external-interactive-showcase/`
- `examples/external-interior-scene/`
- `examples/external-character-viewer/`
- `examples/external-gallery/`
- `templates/external-parity-product-viewer/`
- `templates/external-parity-material-studio/`
- `templates/external-parity-asset-gallery/`
- `templates/external-parity-interactive-scene/`

## Verification

Useful focused checks:

```sh
pnpm build:external-demos
pnpm verify:external-demos
pnpm exec playwright test tests/browser/external-parity-examples.spec.ts
```

## Boundary

Local build or Playwright evidence is not the same as externally hosted evidence. A public demo claim needs a deployment artifact, durable HTTPS URL, and verification that the URL loads outside the local dev server.

This document does not contain evidence of externally hosted demos. Any checklist item claiming external hosted demos must remain unchecked until durable deployment evidence exists.
