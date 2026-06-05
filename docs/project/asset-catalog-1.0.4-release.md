# Aura3D 1.0.4 Asset Catalog And Prompt Resolution Release

Version: 1.0.5
Status: Source-ready; release proof pending build, package smoke, and launch evidence.

Aura3D 1.0.4 folds the federated asset catalog and prompt-resolution seam into the engine release track. The goal is simple: when a developer or AI coding agent asks for a real object, Aura3D should resolve a real, license-aware GLB/glTF candidate instead of generating placeholder primitives or hallucinating raw URLs.

## Release scope

- `@aura3d/asset-index` provides the normalized catalog model, source adapters, federation, ranking, embeddings, and refresh interfaces.
- The Cloudflare Worker read path is `https://aura3d-asset-index-cron.newsroom.workers.dev/search`.
- The catalog aggregates roughly 847,000 assets across Objaverse, Sketchfab, Poly Pizza, OS3A, Poly Haven, Khronos samples, CC0 mirrors, and marketplace deep-links.
- The CLI exposes `aura3d assets search <query>` and `aura3d assets resolve <query> --name <name>`.
- The engine prompt-plan API supports unresolved intent subjects and requires them to be resolved to typed assets before compile.
- `llms.txt` and agent docs steer coding agents away from Three.js, `GLTFLoader`, raw GLB URLs, string asset IDs, and primitive substitutes for named real-world objects.

## Catalog architecture

```text
source adapters -> refresh/ingestion tools -> D1 catalog -> /search worker API -> CLI resolve -> typed aura-assets.ts -> model(assets.x)
```

The catalog is an index of source metadata, license state, quality signals, thumbnails, source pages, and pull URLs. It is not a blanket file host. Auto-pull is allowed only when the adapter reports a verified, redistributable, direct-download asset. Marketplace and unverified candidates remain deep-links.

## Search contract

The production `/search` endpoint accepts natural-language intent:

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

The CLI should then feed the existing typed asset pipeline:

```ts
import { model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

scene().add(model(assets.helmet));
```

## License policy

- CC0 and verified CC-BY direct assets are auto-pullable by default.
- Unknown, unverified, marketplace-only, and non-commercial assets are not auto-pullable by default.
- License metadata travels with the candidate and generated asset evidence.
- Unknown license is treated as unverified, never guessed.

## Prompt-plan API boundary

The engine stays network-free. It exposes structural interfaces only:

- `AuraPromptResolvedSubject`
- `AuraPromptIntentSubject`
- `AuraPromptPlanSubject`
- `AuraPromptSubjectResolver`
- `resolvePromptPlanSubject(...)`
- `promptSubjectIsResolved(...)`

Hosts and the CLI can implement the resolver by calling the hosted catalog, downloading an approved asset, and registering it through the typed asset pipeline. `compilePromptPlan(...)` must reject unresolved intent subjects.

## Release Evidence

This document records the source intent that began in the 1.0.4 track and feeds the 1.0.5 public release. `@aura3d/engine@1.0.5`, `@aura3d/asset-index@1.0.5`, and `@aura3d/cli@1.0.5` are published; release claims remain tied to these evidence classes:

- typecheck evidence
- build evidence
- package smoke evidence
- CLI asset search/resolve evidence against the live worker
- docs readiness evidence
- GameShowcase launch evidence if AuraClash is included in the same launch claim
