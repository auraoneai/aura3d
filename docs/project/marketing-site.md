# Marketing Site

Version: 1.0.10

## Purpose

The `marketing/` app is the local Aura3D developer-facing website. It should welcome developers with live route embeds, clear package/workflow positioning, current WebGL2 and WebGPU wording, and links back to the root route registry.

It is not the source of truth for example allowlisting. The root `index.html` remains the local route registry and allowlist.

## Run Locally

Start the root route registry first:

```sh
pnpm exec vite --host 127.0.0.1 --port 5181 --strictPort
```

Then start the marketing site:

```sh
cd marketing
npm run dev
```

The marketing site expects live routes to be available at `http://127.0.0.1:5181` by default.

## Live Route Embeds

Marketing embeds use:

- `data-route="/apps/wow-.../"` for root routes;
- `data-demo="product-configurator"` for advanced-gallery hash routes;
- `data-url="https://..."` only when a full URL is required;
- `data-priority="eager"` only for the first hero route;
- `data-priority="soon"` for lightweight above-fold support routes;
- `data-quality="marketing"` for iframe previews.

At runtime, `marketing/src/main.ts` composes these into iframe URLs using `window.DEMO_ORIGIN` or `window.DEMO_BASE` when provided. Without overrides, it uses:

```text
http://127.0.0.1:5181
```

## Embed Performance

The site intentionally avoids loading every live route at once. The current loader:

- loads only the hero route eagerly;
- waits for scroll and idle time before loading below-fold routes;
- caps iframe startup to two active iframe documents at a time;
- adds a visible loading state to each live stage;
- appends `quality=marketing` when a stage requests preview quality.

`quality=marketing` is handled by `apps/wow-common/src/route-quality.ts` and caps embedded route render resolution without changing standalone route defaults.

## Heavy Example Notes

Some examples are heavy because they are real asset routes. For example, the concept-car route loads:

- `fixtures/environment-corpus/hdri/studio_small_08_1k.hdr` at roughly 1.4 MB;
- renderer, shader, asset-loader, and diagnostics modules in Vite dev mode;
- GLB buffers, textures, GPU resources, stage geometry, and first-frame diagnostics.

Do not promise that every heavyweight route will load like a static landing-page image. When a page embeds many routes, use lightweight examples near onboarding content and lazy-load heavier GLB/HDR routes lower on the page.

WebGPU route wording must stay evidence-backed. Current WebGPU routes prove native backend availability, compute dispatch, render-target/readback behavior, instancing submissions, and imported-asset/PBR route plumbing when a browser grants a WebGPU adapter. Product/PBR WebGPU routes now use native canvas depth and are covered by `pnpm webgpu:product-quality`, which captures real route screenshots and rejects washed-out stage overdraw or tiny/hidden imported assets.

## Optimization Backlog

For future production hosting, prioritize:

- prebuilt application bundles instead of Vite source-module fan-out;
- optimized GLB derivatives for marketing previews when source assets are too large;
- Draco or Meshopt geometry compression where appropriate;
- KTX2/Basis texture compression and texture-size budgets;
- cached or precomputed HDR/PMREM artifacts;
- route-level first-ready and first-frame telemetry in generated reports;
- asset prefetch on hover or when the next section is near the viewport.

## Production SEO Checklist

Before publishing the marketing site, confirm:

- Every public page has a unique `<title>`, meta description, canonical URL, Open Graph title/description/image, and Twitter card metadata.
- Website docs pages are crawlable HTML pages, not raw Markdown links.
- The homepage H1 and meta description include `TypeScript browser 3D SDK`, `AI agents`, `scene kits`, `typed GLB/glTF assets`, `diagnostics`, `screenshots`, and `deploy checks`.
- Public docs include pages for agent quickstart, prompt recipes, typed assets, Vite templates, deployment, public API, release notes, and evidence.
- A sitemap and robots policy are generated before public hosting.
- Open Graph image assets exist and match the current positioning.
- Image and iframe previews have accessible titles or alt-equivalent labels.
- Heavy GLB/HDR examples are lazy-loaded and not required for first contentful paint.
- Lighthouse/performance budgets are recorded for the public marketing build.
