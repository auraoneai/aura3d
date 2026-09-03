# Aura3D 2.0.4 Release Notes

Version: 2.0.4

Status: published and verified on npm, GitHub, and the canonical production site

Date: 2026-09-03

Aura3D 2.0.4 adds a bounded Meshy integration to the **CLI asset pipeline**. The official Meshy CLI remains the owner of provider authentication, spend planning, task execution, resumption, and artifact download. Aura3D owns local candidate admission, inspection, hashing, sanitized provenance, typed asset generation, and validation. This release does not add Meshy to the browser runtime and does not change renderer or engine capability.

## Meshy CLI asset pipeline

- `assets import-meshy` imports one selected local GLB from a completed Meshy output.
- The command reuses Aura3D's existing add, inspect, hash, manifest, and type-generation path.
- Imported output defaults to `quality: candidate`; import cannot certify release quality.
- Ambiguous GLBs require an explicit `--file`.
- Optional local thumbnail evidence may be retained without persisting temporary signed query strings.
- Prop, environment, vehicle, and humanoid profiles emit bounded admission diagnostics and next actions.
- Missing measurements remain unproven rather than passing.

## Secure operational integration

- Repository setup pins `@meshy-ai/cli@0.2.0` and requires Node.js 24 or newer.
- Documented paid workflows require a dry run, explicit approval, and an approved `--max-credits` ceiling.
- OAuth is preferred for local CLI use. Authorized headless jobs receive `MESHY_API_KEY` from their secret manager.
- Credentials are not accepted through command arguments, prompts, manifests, or committed configuration.
- The optional MCP setup pins `@meshy-ai/meshy-mcp-server@0.5.1` and injects its key only when the process starts.
- Routine tests use fakes and make no paid Meshy request.

## Bounded pilot evidence

The Meshy relic pilot uses the generated typed reference `assets.arenaRelic` through a mounted Aura3D browser route. Its focused browser contract covers visible rendering, keyboard movement, collection, score change, reset, desktop framing, and 390px mobile framing.

The route is labeled `prototype`. Its collection mechanic uses an authored center-distance threshold. It is not evidence of imported collision geometry or a general collision system.

The first independent exact-artifact review rejected clipped mobile framing. After the camera correction, a fresh review passed the hash-bound desktop, collected-state, and 390px mobile artifacts recorded in `MeshyPRD.md`.

## Claim boundary

This release does not establish that:

- Meshy generation runs inside Aura3D or in browser game code;
- Aura3D owns provider authentication, pricing, task execution, polling, resumption, or download;
- a successful import establishes a license or commercial-use right;
- imported output is automatically game-ready or release-ready;
- imported output has proven collision, rigging, animation, topology, optimization, or visual quality;
- renderer, engine, PBR, WebGPU, animation, physics, or universal Three.js-parity capability has expanded.

Rights evidence is supplied and recorded, not inferred. Provider terms such as "game-ready" do not bypass Aura3D validation, route evidence, screenshots, or independent review.

## Install

Aura3D 2.0.4 is published on npm:

```sh
npx @aura3d/cli@2.0.4 assets import-meshy \
  artifacts/meshy/arena-relic/ \
  --name arenaRelic \
  --quality candidate \
  --role prop \
  --profile prop \
  --rights-evidence artifacts/meshy/arena-relic/rights.json
```

See `docs/meshy-cli.md` for provider setup, spend controls, asynchronous task handling, retention boundaries, import behavior, and troubleshooting.

## Validation before publication

- Focused Meshy and asset tests: 84 passed.
- Setup/launcher/Keychain scripts and Node policy tests: 36 passed.
- Pilot browser proof: one passed route covering typed rendering, collection, score, reset, desktop/mobile captures, and clean console/page/response evidence.
- Repository TypeScript, docs, shellcheck, actionlint, ESLint, whitespace, and Meshy secret-scan gates passed before release preparation.
- The optimized candidate is 3,486,768 bytes with 76,556 triangles and 1024px textures; the original provider output remains outside the release tree.

## Publication record

- Release commit: `aa0d79599235ae50b0b2ce3f879482820725475d`.
- Git tag and release: [`v2.0.4`](https://github.com/auraoneai/aura3d/releases/tag/v2.0.4), published 2026-09-03 with 29 exact npm tarballs plus machine-readable release-plan and registry-verification receipts.
- npm: all 29 public packages are visible at `2.0.4`, use `latest`, are not deprecated, and match their local SHA-512 integrity receipts.
- Production deployment: `dpl_ARgfFqv1SyvoRkoCq9f6Ex6kuXUe`, READY and aliased to `https://aura3d.auraone.ai`, `https://aura3d.vercel.app`, and `https://aura3d-veerone.vercel.app`.
- Canonical checks returned HTTP 200 for `/` and `/apps/showcase-meshy-relic-pilot/`; the homepage contains `2.0.4`.
- The deployed `arenaRelic.0b04ec2f.glb` is 3,486,768 bytes, begins with `glTF`, and has SHA-256 `0b04ec2f66f20109d8d7e3c385f61fa80459938201210a79f44f513f327c7381`.
- The pilot remains labeled `prototype`; imported output remains candidate-only and rights evidence remains supplied rather than inferred.
