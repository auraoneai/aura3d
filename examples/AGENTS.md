# EXAMPLES KNOWLEDGE BASE

**Scope:** `examples/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 10 - small file count, high public-claim risk.

## OVERVIEW

Examples are public teaching material. Keep them boringly safe: public
`@aura3d/engine` imports, typed assets, one `createAuraApp(...)`, and claims
that match browser evidence.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Data scene example | `data-galaxy/src/main.ts` | Route-style example entry. |
| Product example | `product-configurator/src/main.ts` | Product/asset claim surface. |
| Example tests | `tests/browser/`, `tests/unit/apps/` | Proof usually lives outside the example folder. |
| Shared assets | `aura.assets.json`, `src/aura-assets.ts`, `public/aura-assets/` | Generated typed asset source. |

## CONVENTIONS

- Prefer compact, copyable public API snippets over clever local abstractions.
- Keep examples aligned with `docs/agents/api-surface.md` and
  `docs/agents/templates.md` when public docs reference them.
- If an example needs a named object, resolve a real asset through the CLI and
  use `model(assets.name)`.
- Route text, README text, and comments must not imply production parity or
  reusable kits beyond the tested example.

## ANTI-PATTERNS

- No `three` imports, `GLTFLoader`, raw GLB URLs, string model IDs, or
  renderer hand-wiring.
- No fake renderer proof via DOM/CSS/canvas.
- No primitive-only primary product, vehicle, character, or world for a named
  prompt.
- Do not copy code from `archive/`, `benchmark/context/`, or generated
  scaffold reports into examples without revalidating it against current rules.

## VERIFY

For visible example changes, run a browser or screenshot test that mounts the
route. A successful TypeScript build is not public evidence by itself.
