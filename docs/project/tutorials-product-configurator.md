# Tutorial: Product Configurator

Version: 1.0.0

This tutorial points to the current allowlisted product configurator surface inside the advanced gallery.

## Run

```sh
pnpm install
pnpm exec vite --host 127.0.0.1 --port 5181 --strictPort
```

Open:

```text
http://127.0.0.1:5181/apps/advanced-examples-gallery/#product-configurator
```

## Source

- `apps/advanced-examples-gallery/`
- `packages/product-studio/src/index.ts`
- `packages/workflows/src/index.ts`

## Verify

```sh
pnpm advanced-gallery
```

## Boundary

The product configurator route is local browser evidence. Do not describe it as externally hosted or production-proven unless deployment evidence exists.
