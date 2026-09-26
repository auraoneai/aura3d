# Worked example: aura3d-evidence-review

Goal: decide whether the `product-viewer` template's shipped fixture can carry
a public "asset-backed product viewer" claim.

Environment: a temporary copy of `packages/create-aura3d/templates/product-viewer`
and the built CLI from this repo. No `npm run build`, Playwright, or dev server
ran locally, so there is no `dist/`.

## Pre-registered rubric

1. Product centered and seated on the plinth.
2. Studio lighting visible.
3. Metal and rubber materials read differently.
4. Primary asset has durable provenance.

## Commands run

```bash
aura3d assets validate --release   # exit 1
```

Trimmed `failures`:

```text
Missing license/provenance evidence for "product". Add it with assets add --license ... --source-url ... or pass --provenance <evidence.json>.
Release validation warning is blocking: product: durable provenance is missing; add source page, download URL, license URL/name, author, and acquisition timestamp.
Release validation warning is blocking: product: manifest bounds [1.900, 2.900, 1.100 ...
```

```bash
aura3d assets thumbnail
```

Trimmed output: `"messages": ["Generated 1 thumbnails."]`, which wrote
`public/aura-assets/product.thumb.svg` in the temporary copy.

```bash
aura3d check-deploy --dist dist
```

This printed `"ok": true` with empty `failures`, even though no `dist/`
existed in the temporary copy. The skill therefore runs `check-deploy` only
after a real `npm run build` and never treats its result as visual evidence.

## Verdicts

- Rubric 4: `fail`, citing the `--release` failures above.
- Rubrics 1 to 3: not graded. They need the screenshot spec's PNG and pixel
  metrics (`metalPixels`, `centerObjectPixels`, `uniqueBuckets`), which run
  remotely.

Label: `prototype`. The fixture is a template scaffold asset without durable
provenance. The critique loop's cheapest fix is to admit a licensed product GLB
with `assets add` and full provenance flags, then rerun `--release`.

## Evidence that would be captured remotely

CI or a remote runner would execute `npm run build && npm run test`. It would
retain `tests/reports/screenshot.png` and `screenshot.json` for desktop and
mobile viewports, together with route-health output and hashes, and then
regrade rubrics 1 to 3.
