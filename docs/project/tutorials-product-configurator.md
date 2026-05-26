# Tutorial: Product Configurator

Version: 1.0.0

This tutorial points to the current product configurator example and app surfaces.

## Run

```sh
pnpm install
pnpm exec vite --host 127.0.0.1 --port 5180 --strictPort
```

Open:

```text
http://127.0.0.1:5180/examples/product-configurator/index.html
```

The production app route is also available at:

```text
http://127.0.0.1:5180/apps/product-configurator/
```

## Source

- `examples/product-configurator/`
- `apps/product-configurator/`
- `packages/product-studio/src/index.ts`
- `packages/workflows/src/index.ts`

## Verify

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts
pnpm exec playwright test tests/browser/production-runtime-product-configurator.spec.ts
```

## Boundary

The product configurator route is local browser evidence. Do not describe it as externally hosted or production-proven unless deployment evidence exists.
