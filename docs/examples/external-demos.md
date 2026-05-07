# External Demo Status

Version: 0.1.0-alpha.0

Galileo3D currently has checked-in local product examples, but this repository does not contain evidence of externally hosted or independently openable public demo URLs.

## Current Local Demos

- `examples/product-configurator/index.html`
- `examples/architecture-viewer/index.html`
- `examples/game-slice/index.html`

These can be served from a local checkout and are verified by browser, visual, and performance tests. They do not satisfy the production-ready checklist row `External demos exist` because that row requires externally hosted/openable demos with durable URLs and verification that those URLs load outside the local development server.

## Static Export Artifact

The three required demos can be bundled for static hosting with:

```sh
pnpm build:external-demos
```

The command writes a deployable static bundle under:

```text
release-artifacts/external-demos/0.1.0-alpha.0/
```

It also writes:

```text
tests/reports/external-demo-static-export.json
```

That export artifact is build readiness only. It still does not satisfy the production-ready checklist until the exported pages are deployed to durable public HTTPS URLs and validated through `pnpm verify:external-demos`.

## Required Evidence To Mark External Demos

- Public URL for each externally hosted demo.
- Browser smoke report that opens each public URL directly.
- Screenshot or visual artifact from each public URL.
- Documented package/build version deployed at each URL.
- Explicit note if a URL is private, access-controlled, temporary, or local-only.
- A report artifact that distinguishes public URL validation from local `localhost` or file-server validation.

## Validation Path

Record public URLs in:

```text
docs/examples/external-demo-urls.json
```

Then run:

```sh
pnpm verify:external-demos
```

The verifier rejects empty, local, private, temporary, and non-HTTPS URLs. A passing run writes:

```text
tests/reports/external-demo-validation.json
tests/reports/external-demo-<demo-id>.png
```

`pnpm verify:release:repeat` reads that report when evaluating the production hard gate for external demos.

Until those artifacts exist, the external demo row must remain unchecked.
