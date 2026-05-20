# Production-Grade G3D Core Platform And Advanced Gallery PRD

Status: active execution directive
Last reviewed: 2026-05-20
Primary objective: build reusable G3D core platform capability first, then prove it through a production-grade advanced examples gallery comparable to official advanced Three.js showcase demos, without route-local hacks, fake assets, false claims, or screenshot churn.

This document is the ordered source of truth for the work. It is not a gallery-only checklist. It is not a loose backlog. It is a file-owned PRD that defines what must be fixed, where it must be fixed, what tests must prove it, and when the ten advanced examples can be accepted.

## 1. Current Truth

Do not start from optimism. Start from the current evidence.

- `0/10` advanced gallery routes are accepted.
- `product-configurator` is visually failed.
- `data-galaxy` is visually failed.
- `reactor-post` remains a candidate with clarity/postprocess risk.
- The other seven routes are candidates, not accepted.
- Automated screenshots and route smoke checks do not equal acceptance.
- Automated image metrics are a floor only. They previously allowed dense/noisy or weak screenshots to look better than they are.
- Product and Data screenshots are visibly below the required Three.js-class bar.
- The active work is source-owned recovery and platform hardening, not repeated screenshot runs.
- `pnpm v9:advanced-gallery:review` must remain blocked until exact current screenshot hashes and human review metadata accept all ten routes.

Current broken evidence that must be handled, not ignored:

- `tests/reports/v9/advanced-examples-gallery/product-configurator.png`
- `tests/reports/v9/advanced-examples-gallery/product-configurator-hero.png`
- `tests/reports/v9/advanced-examples-gallery/product-configurator-viewport.png`
- `tests/reports/v9/advanced-examples-gallery/product-configurator-renderer-environment-background-on.png`
- `tests/reports/v9/advanced-examples-gallery/product-configurator-renderer-environment-background-off.png`
- `tests/reports/v9/advanced-examples-gallery/data-galaxy.png`
- `tests/reports/v9/advanced-examples-gallery/data-galaxy-hero.png`
- `tests/reports/v9/advanced-examples-gallery/data-galaxy-viewport.png`
- `tests/reports/v9/advanced-examples-gallery/data-galaxy-renderer-environment-background-on.png`
- `tests/reports/v9/advanced-examples-gallery/data-galaxy-renderer-environment-background-off.png`
- `tests/reports/v9/advanced-examples-gallery/reactor-post.png`
- `tests/reports/v9/advanced-examples-gallery/reactor-post-hero.png`
- `tests/reports/v9/advanced-examples-gallery/reactor-post-viewport.png`

Detailed baseline carried forward from the previous directive:

- Latest known contact-sheet SHA-256: `a8367fba4c0dafaa7efe676742305ddf018806c9859f8eee541b8fac0f3c5e2f`.
- Latest known contact-sheet source-set SHA-256: `72d4d626071587064afa8da7217e5f5fd76e56a4ddbef059c92f7b772c62c105`.
- Latest known contact-sheet timestamp: `2026-05-19T23:08:45.477Z`.
- Latest known visual-review summary: `10` demos, `0` accepted, `8` candidate, `2` failed, `10` blocked, `6/10` automated image-quality passing, and `1` known visual-artifact risk.
- Latest known report-audit summary: `10/10` expected route reports present, `10/10` reusable-system evidence, `10/10` unsupported disclosures, `10/10` measured performance evidence, `10/10` screenshot hashes, `10/10` image stats, `0` audit blockers, and `2` asset-quality audit warnings.
- The audit warnings explicitly flagged that `data-galaxy` active authored GLBs have zero texture-backed material evidence and that `product-configurator` still has more no-texture support-fixture draw items than texture-backed hero draw items.
- Other known automated image-quality warnings: `ocean-observatory` detail-edge density was just below the floor and `robotics-lab` detail-edge density was just below the floor.
- These numbers are historical baseline facts, not acceptance. They must be refreshed after the next full qualified gallery run.

Current known facts about Product Configurator:

- The intended source assets are real GLBs:
  - `fixtures/v8/assets/vehicles/car-concept.glb`
  - `fixtures/v8/assets/product/chronograph-watch.glb`
  - `fixtures/v8/assets/product/materials-variants-shoe.glb`
  - `fixtures/v8/assets/product/sunglasses-khronos.glb`
- Generated/support assets may exist, but they may not replace the source-of-truth Product hero unless material, node, texture, extension, and visual equivalence are proven.
- Current visible failures include weak PBR clarity, fuzzy/white edge artifacts, weak grounding, weak studio/background read, support fixture dominance risk, crop/stage artifacts, and non-premium composition.
- Product must stay failed until direct visual review accepts exact current screenshots.
- Focused product status carried forward from the previous directive:
  - The visual hero was restored toward the original texture-backed `car-concept` GLB rather than the generated `car-concept-batched` derivative.
  - `GLTFRenderResources` had work to stabilize glossy clearcoat imports using nearest-filtered normal maps without dedicated clearcoat normals.
  - A focused report showed `338` authored draw items: `109` from original `car-concept`, including `101` texture-backed draw items and `15` textures, plus `229` support draw items from the no-texture product-studio GLB.
  - The no-texture product-studio GLB was demoted toward support-only swatch/hotspot/separation metadata, with many excluded support nodes reported, but visible support clutter still leaked into screenshots.
  - Cropping, weak grounding, low detail-edge density, low local contrast, imported GLB edge/material artifacts, and sub-12 FPS RAF cadence still blocked visual acceptance.
- Focused Product status after the reusable lighting-route source fix on 2026-05-20:
  - `apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts` now consumes `createLightingRig({ preset: "product-shot" })` from `packages/rendering/src/LightingRig.ts` instead of using Product-specific `sceneBuilders.lights("product-*")` route branches.
  - `tests/unit/apps/v9-route-scene-modules.test.ts` verifies the Product route emits the reusable `product-key`, `product-fill`, and `product-rim` lights plus LightingRig unsupported-boundary disclosures.
  - `pnpm exec vitest run tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/rendering/environment-lighting-reflection-platform.test.ts --reporter=dot` passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "product-configurator renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only.
  - The generated Product screenshots still fail visual review: the gray catch plane/stage remains visually dominant, grounding is weak, imported edge/material artifacts remain visible, `pngStats.detailEdgeDensity` is `0.008396`, `pngStats.localContrast` is `20.817365`, and `performanceEvidence.rafFrameMs` is `511.9`.
  - Latest focused Product screenshot hashes: full `db84c671586c081d18ecb93b44ab809dd039db7fb6733c2b0cb5eda321d305c4`, hero `82a9c07de547b193f463432e28b8fec5faf50dced8f83c0ec2e1b9bea07ca32d`.
- Focused Product status after reusable contact-grounding/stage platform work on 2026-05-20:
  - `packages/rendering/src/EnvironmentPlatform.ts` now exposes environment contact-grounding descriptors and `product-premium` indoor stages emit compact layered receiver geometry without expanding route framing.
  - `packages/rendering/src/shadows/ContactShadows.ts` now exposes a deterministic layered contact-shadow plan that keeps screen-space/depth-blurred contact shadows, true area-light penumbra, and physical contact-shadow maps unsupported unless implemented separately.
  - `packages/rendering/src/LightingRig.ts` now exposes softbox proxy diagnostics for `product-shot`/`studio-softbox` rigs while preserving the true-area-light/IES/GI/contact-shadow-map boundary.
  - `tests/unit/rendering/environment-platform.test.ts` and `tests/unit/rendering/environment-lighting-reflection-platform.test.ts` cover the platform contracts.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "product-configurator renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only after the platform change.
  - The latest focused Product runtime now lists `contact grounding helper` and the approximations disclose layered receiver geometry rather than a true renderer contact-shadow pass.
  - The generated Product screenshots still fail visual review: `detailEdgeDensity` is `0.008128`, `localContrast` is `21.585546`, `performanceEvidence.rafFrameMs` is `576.1`, support assets remain awkward/clipped in the frame, and imported material/edge artifacts remain visible.
  - Latest focused Product screenshot hashes after contact grounding: full `87e1e05a179b3bfc31f31897a868661e9c03fdf3ac7a1538a1c95be7a9793ed8`, hero `ca16a91a4ce1be835db504c7faff21c89e7742d8e7c53f2056a072b1ec5b0b16`.
- Product status after compact stage/support composition work on 2026-05-20:
  - `packages/rendering/src/EnvironmentPlatform.ts` now makes `studioTone: "product-premium"` use a smaller catch-plane footprint and moves/dims the analytical softbox proxy panels so they no longer read as visible random bars in the accepted Product view.
  - `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` now stages the existing original watch, car, sunglasses, and shoe GLBs tighter inside the reusable product stage. No Product asset was replaced or removed.
  - `apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts` now uses a stronger reusable `product-shot` lighting intensity and a denser bounded turntable tick ring to keep Product above the candidate smoke detail floor without adding unrelated props.
  - `pnpm exec vitest run tests/unit/rendering/environment-platform.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-product-configurator-policy.test.ts --reporter=dot` passed after the stage/composition changes.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the stage/composition changes.
  - Focused Product capture passed after the stage/composition changes.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm v9:advanced-gallery` was rerun after Product fixes: all ten route runtime/screenshot tests passed and only the intentional visual-acceptance guard failed.
  - `pnpm v9:advanced-gallery:review` remains correctly blocked at `0/10 accepted`.
  - `pnpm v9:advanced-gallery:audit` reports `10/10` route reports, `10/10` current screenshot artifacts, `10/10` reusable systems/unsupported disclosures/measured performance/screenshot hashes/image stats, `0` blockers, and `0` warnings.
  - Current full-gallery Product remains failed: `uniqueColorBuckets 205 < 400`, `detailEdgeDensity 0.006068 < 0.028`, `localContrast 19.422484 < 35`, and RAF cadence remains below 12 FPS. It is structurally cleaner but not visually accepted.
  - Current full-gallery Product screenshot hashes: full `89447fc61d653dfb0ec2f43a88bc66f0a82ababd6ba7d496aef5b34e4fd0624c`, hero `d35313b52079c617b2950939880c74265df5ea1dba50b36a354aa4540857bdb8`, viewport `b51c1fbc41ee30954983549c9fd15f1ed69611e574f14c1cd70ca5b6fd8f7714`.
- Product status after removing route-local original-asset material overrides on 2026-05-20:
  - `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` no longer mutates original `car-concept` or `chronograph-watch` material appearance through route-local `u_baseColor`, roughness, specular, transmission, clearcoat, normal-scale, or environment-specular overrides. Product material quality must be fixed in renderer/material/importer owners, not hidden in authored activation.
  - `tests/unit/apps/v9-product-configurator-policy.test.ts` now includes a guard that blocks reintroducing Product original-GLB material appearance patches in `authoredLayer.ts`.
  - `pnpm exec vitest run tests/unit/apps/v9-product-configurator-policy.test.ts tests/unit/apps/v9-route-scene-modules.test.ts --reporter=dot` passed after the removal.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the removal.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/product-configurator-reference.spec.ts --reporter=line --timeout=360000` passed after the removal, proving the original same-asset harness still loads the source GLBs.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "product-configurator renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only after the removal.
  - The focused Product screenshot improved versus the previous full-gallery metrics but remains failed: `uniqueColorBuckets 258 < 400`, `detailEdgeDensity 0.010161 < 0.028`, `localContrast 24.748883 < 35`, and RAF cadence remains below 12 FPS. The current focused screenshots were opened directly and still are not accepted.
- Product status after renderer environment-lighting composition work on 2026-05-20:
  - `packages/rendering/src/EnvironmentLighting.ts` adds reusable `composeEnvironmentLighting(...)` so route/stage ambient/procedural lighting can be preserved while sampled HDR cube/equirect/BRDF bindings are added. This fixes the source-owned Product problem where loaded HDR lighting replaced the reusable Product studio environment instead of augmenting it.
  - `apps/v9-advanced-examples-gallery/src/main.ts` now uses the helper for renderer environment lighting. Product gets a shared studio-product sampled HDR floor of `environmentMapIntensity 0.78` and `environmentMapSpecularIntensity 0.76` without car/watch route-local material overrides.
  - `apps/v9-advanced-examples-gallery/src/rendererEnvironmentBackgroundEvidence.ts` now records the active composed renderer lighting values, not only the raw dim HDR bundle.
  - `tests/unit/rendering/environment-lighting-reflection-platform.test.ts` covers the composition contract: preserve route/stage color, intensity, and procedural map while adding sampled HDR texture bindings.
  - `pnpm exec vitest run tests/unit/rendering/environment-lighting-reflection-platform.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-product-configurator-policy.test.ts --reporter=dot` passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/product-configurator-reference.spec.ts --reporter=line --timeout=360000` passed after the platform change.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "product-configurator renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only.
  - Latest focused Product runtime reports composed renderer environment lighting with `environmentMapIntensity 0.78`, `environmentMapSpecularIntensity 0.76`, rotation `0.18`, and mip count `8`.
  - Latest focused Product metrics improved materially but remain failed: `uniqueColorBuckets 279 < 400`, `detailEdgeDensity 0.012297 < 0.028`, `localContrast 36.290998`, `foregroundCoverage 0.240237`, and `performanceEvidence.rafFrameMs 507.95`.
  - Latest focused Product screenshot hashes: full `43cf97823fd771eb9273f004375636f6bbab851c3b0f8df9030d74d5045bcdf6`, hero `a25a0168f825cd620c783da3c5b754ca6d1883c9d93365e63c50103c3b04f274`, viewport `df7a2e43a145a89f41474f7372c1dbce75d7ea9956aa781c1510358d4f744a49`.
  - The hero screenshot was opened directly. The original car/watch/shoe/sunglasses assets are visibly present and car paint/specular response is much better, but Product is still not accepted because the composition/stage, low edge detail, and capture cadence remain below the premium bar.
- Product status after imported-variant composition/stage refinement on 2026-05-20:
  - `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` now stages the existing original watch, car, sunglasses, and shoe GLBs with more deliberate support placement and imported default variants: watch `Midnight Gold`, car `Carmine Candy`, and shoe `beach`. No Product asset was replaced or hidden.
  - `packages/rendering/src/EnvironmentPlatform.ts` now uses a smaller/darker reusable `product-premium` receiver footprint for the current Product stage. This remains a reusable stage approximation, not a true renderer contact-shadow or reflection solution.
  - `tests/browser/v9-advanced-examples-gallery.spec.ts` now asserts the current imported variant defaults for the watch and shoe instead of stale `Khronos Red`/`street` expectations.
  - `pnpm exec vitest run tests/unit/apps/v9-advanced-gallery-route-policies.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-product-configurator-policy.test.ts tests/unit/rendering/environment-platform.test.ts --reporter=dot` passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "product-configurator renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only.
  - Latest focused Product metrics improved but remain failed: `uniqueColorBuckets 348 < 400`, `detailEdgeDensity 0.017215 < 0.028`, `localContrast 39.000007`, `foregroundCoverage 0.240816`, and `performanceEvidence.rafFrameMs 575.3`.
  - Latest focused Product screenshot hashes: full `f0be6d4aa4d711f452d6b5eca04a1281a07b105fe43f01d17f9aaec7c6305ea4`, hero `59006a6601bbec14ac698f9c4f2d4830b526d3efc114d02441eee963dfbcb151`, viewport `c1296d7b1a09e224a34244268f2fc4b1296d470692423241e2224f48f6735bc3`.
  - The full, hero, and viewport screenshots were opened directly. Product is cleaner and uses the intended original assets, but it remains visually failed because the car/stage still dominate low-detail frame area, PBR/imported edge fidelity is not premium enough, and capture cadence remains unhealthy.
- Product status after package-owned Product Studio layout extraction on 2026-05-20:
  - `packages/product-studio/src/ProductShowcaseLayout.ts` now owns a deterministic compact multi-product layout and hero frame for Product Configurator instead of keeping all placement/camera bounds as app-only coordinates.
  - `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` consumes `createProductShowcaseLayout(...)` for the original watch, car, sunglasses, and shoe placement/scale/default imported variants. No Product asset was replaced.
  - `apps/v9-advanced-examples-gallery/src/galleryRoutePolicies.ts` consumes the same package-owned layout frame for Product hero padding and bounds.
  - `tests/unit/product-studio/product-showcase-layout.test.ts` covers the layout schema, frame bounds, original asset slots, imported variant defaults, and limitation disclosure.
  - `pnpm exec vitest run tests/unit/product-studio/product-showcase-layout.test.ts tests/unit/product-studio/product-camera.test.ts tests/unit/product-studio/product-asset-loader.test.ts tests/unit/apps/v9-advanced-gallery-route-policies.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-product-configurator-policy.test.ts --reporter=dot` passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `pnpm build` passed to refresh the package `dist` export surface used by the browser bundle.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "product-configurator renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only.
  - Latest focused Product metrics improved on hue variety but remain failed: `uniqueColorBuckets 456`, `detailEdgeDensity 0.015637 < 0.028`, `localContrast 35.292374`, `foregroundCoverage 0.244437`, and `performanceEvidence.rafFrameMs 675.7`.
  - Latest focused Product screenshot hashes: full `e56b61ba7e770f0a0c27e658eeb8471fd7ea249ac262f8d9249db86986e80d00`, hero `dcfeb1a07063924a846b62598a5e325b6f16dfd25896d99f59bdad705688acd1`, viewport `a92189ebd427251597db944d1e03dfdc0b13e9a034d6ccd825d4b5d1ba2d06fa`.
  - The hero screenshot was opened directly. Product is still not accepted because the car/platform still occupy too much smooth low-detail frame area and capture cadence remains unhealthy. The next Product layout work must happen in the package helper or core material/shadow/cadence owners, not route-only overrides.
- Product status after package-owned layout detail-balance refinement on 2026-05-20:
  - `packages/product-studio/src/ProductShowcaseLayout.ts` now reduces the car's smooth-frame dominance, increases the detailed original watch/shoe/sunglasses support assets, and tightens Product hero framing through the reusable Product Studio layout helper.
  - `tests/unit/product-studio/product-showcase-layout.test.ts` and `tests/unit/apps/v9-advanced-gallery-route-policies.test.ts` were updated to pin the package-owned layout/frame contract.
  - `pnpm exec vitest run tests/unit/product-studio/product-showcase-layout.test.ts tests/unit/apps/v9-advanced-gallery-route-policies.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-product-configurator-policy.test.ts --reporter=dot` passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `pnpm build` passed to refresh `dist` exports for the browser bundle.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "product-configurator renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only, but took `3.2m`, reinforcing the route/capture cadence blocker.
  - Latest focused Product metrics remain failed: `uniqueColorBuckets 375 < 400`, `detailEdgeDensity 0.022079 < 0.028`, `localContrast 40.765531`, `foregroundCoverage 0.286457`, `loopMs 30.1`, `renderMs 26.5`, and `performanceEvidence.rafFrameMs 2108.3`.
  - Latest focused Product screenshot hashes: full `26331732020b7789a24d2930d206da06c2351e258359691253ef2efcbe0cb038`, hero `0da54c1c875d5d61c552b2ec7f8438ea17886857d890c5de67738f935526149c`, viewport `f7a5f02966b3208f3862bced8e30a6eaa28950aeecf969aae43504259b802557`.
  - The hero screenshot was opened directly. Product is closer on detail density but still visually failed. Further route-layout nudging is not enough; the next Product blockers are renderer/importer PBR fidelity, real grounding/shadow/reflection support, and capture/cadence/root performance reporting.

Current known facts about Data Galaxy:

- Active authored Data assets now include:
  - `fixtures/v9/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb`
- The previous generic animated cube fixtures were removed from the active Data Galaxy route asset list because they were unrelated filler, not premium Data Galaxy focal evidence:
  - `fixtures/v8/assets/animation/animated-morph-cube.glb`
  - `fixtures/v8/assets/animation/animated-colors-cube.glb`
  - `fixtures/v8/assets/animation/box-animated.glb`
- Current Data authored GLB evidence does not prove premium focal-hero quality. The generated Data core now has embedded generated data-glyph texture evidence at source, but it remains generated support content until current screenshots and review metadata accept it visually.
- Current visible failures include weak focal subject, generated support-scaffold risk, low contrast, noisy or unclear particle hierarchy, weak premium art direction, and CPU/static particle limitations.
- Data must stay failed until direct visual review accepts exact current screenshots.
- Focused Data status carried forward from the previous directive:
  - The reusable environment-stage gray floor/catch plane and named authored data-core platform mesh were disabled for the route.
  - The default route used lower CPU/static showcase density while higher stress modes remained selectable.
  - The background proof moved away from terrestrial HDRI toward a deterministic generated deep-space Radiance/RGBE fixture through `Renderer.environmentBackground`.
  - The generated data-core script reduced visible scaffold draw items and lowered emission/alpha intensity, but the route remained visually failed.
  - The remaining objective warnings included foreground coverage, local contrast, RAF cadence below 12 FPS, and authored GLB content with no texture-backed material evidence.
  - The route proved CPU/static particle evidence, not GPU compute parity or premium particle art direction.
- Latest source-level Data asset status after the generated texture-backed support update:
  - `tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py` now writes embedded generated data-glyph textures into key Data core materials.
  - `fixtures/v9/assets/data-galaxy-core-blender/manifest.json` now reports generated/support-only texture-backed evidence with `3` exported textures, `3` exported images, and `3` exported texture-backed materials.
  - This update removes the old "generated/no-texture" source classification, but it does not make the Data core an accepted premium hero. The route remains failed until fresh current screenshots, runtime reports, audit/review output, and direct visual review prove the whole scene.
  - `tests/unit/tools/v9-data-galaxy-generated-assets.test.ts` now verifies the current exported GLB counts: `11` materials, `3` textures, `3` images, `149` meshes, `154` nodes, and `3` texture-backed materials.
  - `pnpm exec vitest run tests/unit/tools/v9-data-galaxy-generated-assets.test.ts tests/unit/apps/v9-data-galaxy-budgets.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/tools/v9-advanced-gallery-report-audit.test.ts tests/unit/tools/v9-advanced-gallery-visual-review-gate-rules.test.ts --reporter=dot` passed after updating the generated texture-backed Data expectations.
  - `python3 -m py_compile tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py` passed after the generator update.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the Data generated texture-backed source/test updates.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "data-galaxy renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused verification.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm v9:advanced-gallery` was rerun after the source change: all ten route runtime/screenshot tests passed and only the intentional visual-acceptance guard failed.
  - `pnpm v9:advanced-gallery:review` remains correctly blocked at `0/10 accepted`.
  - `pnpm v9:advanced-gallery:audit` now reports `10/10` route reports, `10/10` current screenshot artifacts, `10/10` reusable systems/unsupported disclosures/measured performance/screenshot hashes/image stats, `0` blockers, and `0` warnings. This is structural evidence only; it does not promote any route.
  - Current Data full-gallery runtime reports `generatedNoTextureAuthoredGlb: false`, `3` texture-backed Data core draw items, `3` textures, CPU/static particles, and `0` native GPU compute dispatches.
  - Current Data screenshots remain failed: foreground coverage, detail-edge density, local contrast, and capture cadence still block visual acceptance.
- Focused Data status after route-owned default showcase/focal hierarchy work on 2026-05-20:
  - `apps/v9-advanced-examples-gallery/src/metadata.ts` now initializes the actual gallery control default to `12,000` particles, while `4,000` remains a selectable interactive mode and `24,000`/`50,000` remain stress/evidence modes.
  - `apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets.ts` now defines `DATA_GALAXY_DEFAULT_PARTICLES` as the `12k showcase` tier and allocates the majority of particles to the primary focal layer.
  - `apps/v9-advanced-examples-gallery/src/dataGalaxyEvidence.ts` now emits structured `defaultShowcaseMode`, focal hierarchy, CPU/static, generated support-only, and `0` GPU dispatch evidence.
  - `pnpm exec vitest run tests/unit/apps/v9-data-galaxy-budgets.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-advanced-gallery-route-policies.test.ts tests/unit/tools/v9-advanced-gallery-visual-review-gate-rules.test.ts tests/unit/tools/v9-advanced-gallery-report-audit.test.ts --reporter=dot` passed.
  - `pnpm exec vitest run tests/assets/gltf-inspection.test.ts tests/assets/gltf-extension-support.test.ts --config tests/assets/vitest.config.ts --reporter=dot` passed.
  - `pnpm exec vitest run tests/unit/rendering/pbr-lighting.test.ts tests/unit/rendering/shader-library.test.ts --reporter=dot` passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "data-galaxy renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only.
  - The latest focused Data runtime JSON reports `defaultShowcaseMode: true`, `mode: "showcase"`, `requestedParticles: 12000`, `effectiveParticles: 12000`, `primaryCount: 6480`, `nativeGpuComputeDispatches: 0`, and generated `data-galaxy-core-blender` support-only disclosure.
  - The generated Data screenshots still fail visual review: the generated authored core still reads as scaffold/support content rather than accepted premium focal proof, `foregroundCoverage` is `0.105993`, and `performanceEvidence.rafFrameMs` is `400.4`.
  - Latest focused Data screenshot hashes: full `53f0eedbbb4f62f2d01e89a6adbf23d6c7bdfc38033ccaef2e27436900b6974f`, hero `e424bd60c5fcf55332d4d029c04a061eae264ca1e7bd7813c4f3e83c13f71dd1`.
- Focused Data status after route-owned focal/detail recovery on 2026-05-20:
  - `apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets.ts` now gives the 12k showcase tier a larger route-owned foreground composition and higher curated overlay budget: `204` overlay spark points and `176` overlay line-segment budget.
  - `apps/v9-advanced-examples-gallery/src/dataGalaxyEvidence.ts` adds foreground-local data-system contour/spine geometry and keeps the generated data-core GLB disclosed as support-only. An attempted oversized shell was corrected after direct screenshot inspection; the accepted subject remains route-owned particles/lines, not a solid sphere or unrelated prop.
  - `apps/v9-advanced-examples-gallery/src/dataGalaxyScene.ts` now uses Data-specific particle materials from `sceneBuilders.ts` so Data can improve point readability without changing Smart City's shared particle pulse materials.
  - `apps/v9-advanced-examples-gallery/src/metadata.ts` and `authoredAssets.ts` now match current generated asset truth: the generated data-core GLB has limited generated texture evidence, but remains support-only and cannot be used as premium focal hero proof.
  - `pnpm exec vitest run tests/unit/apps/v9-data-galaxy-budgets.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-advanced-gallery-route-policies.test.ts --reporter=dot` passed after the route-owned budget/material changes.
  - `pnpm exec vitest run tests/unit/tools/v9-advanced-gallery-visual-review-gate-rules.test.ts tests/unit/tools/v9-advanced-gallery-report-audit.test.ts --reporter=dot` passed before the focused visual verification.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the route-owned Data changes.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "data-galaxy renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only.
  - Latest focused Data metrics improved on detail and contrast but remain failed: `uniqueColorBuckets 821`, `detailEdgeDensity 0.037849`, `localContrast 37.658669`, `foregroundCoverage 0.105954 < 0.14`, and `performanceEvidence.rafFrameMs 350.05`.
  - Latest focused Data screenshot hashes: full `7a73412a29167b68dca35099ee7b9e2268a42f8265c07b85b1d93b66e9b15806`, hero `d0cce1b0e851b2d171e725a7ea990f05cb103f94afe261e92b6e08f5a297cf27`, viewport `5f038f3bf0c3c5b5f72bd070959c45735d89c6416a177a003c320b4d642e04aa`.
  - The focused screenshots were opened directly. The route is better than the previous focused state on edge detail and contrast, but it is not accepted because foreground coverage and frame cadence remain below the bar and the generated support GLB cannot carry focal-hero proof.
- Focused Data status after route-owned foreground/focal mass recovery on 2026-05-20:
  - `apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets.ts` now increases the 12k showcase route-owned overlay budget to `331` spark/core/focal points and `248` trail/connection/contour/ring/ladder segments, tightens the showcase composition bounds, and keeps the package-backed layered particle budget contract intact.
  - `apps/v9-advanced-examples-gallery/src/dataGalaxyEvidence.ts` now enlarges the central route-owned data nucleus, focal cluster anchors, contour chords, and vertical spine evidence. The generated `data-galaxy-core-blender` GLB remains disclosed support-only content and was not promoted to hero proof.
  - `apps/v9-advanced-examples-gallery/src/galleryRoutePolicies.ts` and `tests/browser/data-galaxy-reference-harness.ts` now use tighter Data Galaxy hero framing for the route-owned focal system.
  - `pnpm exec vitest run tests/unit/apps/v9-data-galaxy-budgets.test.ts tests/unit/rendering/particle-diagnostics.test.ts tests/unit/apps/v9-advanced-gallery-route-policies.test.ts tests/unit/apps/v9-route-scene-modules.test.ts --reporter=dot` passed.
  - `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "data-galaxy renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed as focused-route evidence only.
  - Latest focused Data metrics now clear the automated foreground/detail/contrast floors but remain failed by direct review: `uniqueColorBuckets 846`, `foregroundCoverage 0.140326`, `detailEdgeDensity 0.045832`, `localContrast 45.458457`, and `performanceEvidence.rafFrameMs 408.3`.
  - Latest focused Data screenshot hashes: full `b110bee5fee85aebcab7d8e6e0eab9a11aebe42d0446ddd63ef5b66ec34ab6fe`, hero `74a7e8acd972bd21f216f4c014b785e041d17c06ff53bb1cbcfbfc1ef91179b1`, viewport `27011896e9b100edfaa0b679e45c88f5d0038abece6cbfa25e3310410d2bf7ac`.
  - The focused screenshots were opened directly. Data is still not accepted: the scene is visually busy, the generated support/scaffold read is still present, and RAF cadence remains unhealthy. The next fix must clean the route-owned focal system and/or reduce support-scaffold pressure without replacing the route subject or claiming GPU compute.

Current review result after the full gallery refresh on 2026-05-20:

- `pnpm v9:advanced-gallery:review` regenerated `current-contact-sheet.png`, `visual-regression-inventory.json`, and `visual-review-report.json`.
- The release gate remains correctly blocked: `Release gate: blocked (0/10 accepted)`.
- Latest visual-review summary: `10` demos, `0` accepted, `8` candidate, `2` failed, `10` blocked, `10` blocker issues, `9` warning issues, `7/10` image-quality passing, and `1` known visual-artifact risk.
- Latest contact-sheet SHA-256: `fb33e7c3a61e1c25457b87f9aa8c1d92b582c47ad51242a94c14a55293b4a157`.
- Latest contact-sheet source-set SHA-256: `897ebfacbd44b9ccfcb20f30aa3e457f0d1e0f868eed1c0a707c4e3eed3abe26`.
- Latest contact-sheet timestamp: `2026-05-20T09:44:19.782Z`.
- `pnpm v9:advanced-gallery:audit` now passes structurally with `10/10` route reports present, reusable systems/unsupported disclosures/measured performance/screenshot hashes/current screenshot artifacts/image stats all `10/10`, `0` audit blockers, and `0` warnings. This is non-promotional because visual review remains blocked with `0/10` accepted.

Current known facts about Reactor Post:

- Existing screenshots inspected without recapture:
  - `tests/reports/v9/advanced-examples-gallery/reactor-post.png`
  - `tests/reports/v9/advanced-examples-gallery/reactor-post-hero.png`
  - `tests/reports/v9/advanced-examples-gallery/reactor-post-viewport.png`
- Existing runtime report inspected:
  - `tests/reports/v9/advanced-examples-gallery/reactor-post.json`
- Current state is `candidate`, not accepted.
- The base scene is readable enough to remain a postprocess candidate: central reactor, floor etching, command wall, rings, holographic panels, and measured renderer postprocess are visible.
- The current postprocess plan reports only renderer-owned `tone-mapping`, `color-grade`, and `fxaa` in `rgba8`; bloom remains opt-in and the route does not prove DOF, motion blur, LUT/AOV layers, temporal accumulation, EffectComposer parity, or depth/velocity-input passes.
- Objective screenshot metrics are above the basic image floor (`detailEdgeDensity 0.036388`, `localContrast 41.599767`), but RAF cadence remains a blocker (`performanceEvidence.rafFrameMs 1199.2`) and the frame is close to crop/bounds risk (`foregroundBoundsCoverage 0.973043`).
- Reactor source-owner map:
  - If the next defect is noisy bloom/halo, owner is `packages/rendering/src/PostProcessPass.ts`, `RendererPostprocessPlan.ts`, and route postprocess policy.
  - If the next defect is weak base scene/crop/framing, owner is the Reactor route scene module or `sceneBuilders.ts` until a route-owned `reactorPostScene.ts` is created.
  - If the next defect is cadence/reporting, owner is renderer/report timing and gallery capture telemetry, not screenshot repetition.

Expected current review result until final acceptance:

```bash
pnpm v9:advanced-gallery:review
```

```text
Release gate: blocked
```

## 2. Product Definition

G3D is being developed into an AI-native cinematic scene engine for the web.

The product is not a set of patched examples. The gallery is the proof surface. The reusable platform underneath is the product:

- `packages/rendering`
- `packages/assets`
- `packages/input`
- `packages/controls`
- `packages/scene`
- `packages/animation`
- `packages/physics`
- reusable gallery/runtime helpers that can later graduate out of `apps/*`
- documentation, examples, reports, and acceptance tooling that make the system reproducible

The product distinction is:

- Three.js gives developers powerful low-level parts.
- G3D must provide reusable scene systems that are inspectable, reproducible, directable, and evidence-backed.
- Three.js is primarily code-first.
- G3D must remain code-first while becoming AI-directable through scene metadata, asset provenance, material assignments, lighting plans, camera shots, animation timelines, postproduction settings, unsupported-feature disclosures, and deterministic evidence reports.
- A G3D example is not accepted because it looks good once. It is accepted only when the same result can be generated, inspected, revised, captured, and explained through reusable renderer/runtime/gallery capability.

The intended claim is:

> G3D is an AI-native cinematic scene engine for the web, designed to let developers and AI agents create, inspect, revise, and ship premium interactive 3D scenes with evidence-backed renderer/runtime capability.

That sentence is product direction until current code, screenshots, runtime reports, metadata, and review gates prove it.

## 3. Non-Negotiable Rules

- Do not fake capabilities.
- Do not invent G3D APIs.
- Do not weaken review gates.
- Do not call a route `accepted` from smoke tests, route tests, or image metrics alone.
- Do not replace real texture-backed assets with random, generated, no-texture, or unrelated props to make screenshots look busier.
- Do not hide broken nodes, crop cameras, darken CSS, disable systems, add bloom, or add vignette as a substitute for renderer/material/loader/environment fixes.
- Do not keep route-specific hacks when the problem belongs in importer, renderer, material, animation, postprocess, physics, controls, environment, scene metadata, or gallery tooling.
- Do not downgrade demos into simple cubes, spheres, planes, particles, or placeholder props.
- Do not claim Three.js parity for a feature until reusable G3D source, focused tests, runtime evidence, screenshots, and known-limit metadata prove it.
- Do not run repeated screenshots after speculative edits. Screenshots are verification artifacts after source-owned fixes, not an iteration strategy.
- Do not remove unrelated files or revert unrelated dirty work.
- Do not use git reset or checkout to recover visual state. There was no clean checkpoint for the current regression.

## 4. Execution Order

The work must happen in this order. A later phase may start only when it does not hide or bypass an earlier source-owned blocker.

| Phase | Name | Owns | Exit Gate |
| --- | --- | --- | --- |
| P0 | Evidence and regression guardrails | Review tools, report audit, screenshot discipline, partial-run detection. | Review/report tooling blocks false acceptance and screenshot churn. |
| P1 | Renderer visual foundation | Color, tone mapping, exposure, HDR/LDR targets, DPR, capture consistency, frame cadence. | Renderer reports and tests prove stable output before route art direction. |
| P2 | Asset and material activation | GLTF diagnostics, render-resource metadata, PBR fallback, texture handling, variants, unsupported extensions. | Product/reference harness proves original GLBs render with credible material fidelity and honest limits. |
| P3 | Environment, lighting, grounding, reflection | Environment presets, HDR/RGBE backgrounds, fog, studio stage, softboxes, contact grounding, PMREM limits, reflection/refraction boundaries. | Product/Data/Fog/Water routes consume shared environment/lighting systems instead of route shells. |
| P4 | Controls, picking, scene metadata, animation, physics | Orbit/fly/picking/hotspots, entity inspection, scene schema, timeline, animation diagnostics, physics reset/debug. | Product/city/robotics/digital-twin/physics routes use shared contracts. |
| P5 | Active visual regression recovery | Product Configurator, Data Galaxy, Reactor Post. | Broken screenshots are mapped to source owners and fixed without asset replacement or hiding. |
| P6 | Remaining route remediation | Digital Twin, Robotics Lab, Smart City, Fog Cathedral, Physics Playground, Water Lab, Ocean Observatory. | Every route has file-owned fixes, current runtime evidence, and honest known gaps. |
| P7 | Core platform parity backlog | Reflection/refraction, postprocess composer, material presets, procedural helpers, WebGPU/compute boundaries, docs/examples. | Reusable package APIs, tests, examples, reports, or explicit unsupported status. |
| P8 | Naming and repository taxonomy migration | Remove turn-history `v1..v10` naming from active product taxonomy without breaking routes, reports, exports, fixtures, or docs. | Checked-in migration map, aliases, and alias tests pass before renames. |
| P9 | Cinematic / AI-native tier | Cinematic camera, timeline, render layers, MaterialX/USD strategy, character systems, prompt-to-scene metadata, review workflow. | Implemented as reusable systems with evidence, or kept non-claiming. |
| P10 | Final acceptance | Ten route visual review, report audit, screenshots, run docs, final output. | `pnpm v9:advanced-gallery:review` reports `accepted (10/10 accepted)`. |

## 5. Required Workflow For Every Task

Every task must follow this sequence:

1. Pick a task ID from this PRD.
2. State the exact write set before editing.
3. Inspect the owner files before patching.
4. Make source-owned changes only in the listed files.
5. Add or update focused tests.
6. Run typecheck and the focused tests for that source owner.
7. Run at most one qualified browser capture only if the task changes visible output.
8. Open the generated PNGs only to verify the written expected delta.
9. If the screenshot is still bad, stop capturing and update the defect-to-owner map before making another visual change.

Task classification must be explicit:

- `platform/shared`: reusable renderer, asset, loader, material, environment, controls, capture, review, audit, scene, animation, or physics behavior.
- `route modularization`: route-owned composition or policy moved out of shared app files without claiming new platform capability.
- `art-direction`: camera, composition, density, asset placement, color, backdrop, route styling, or content cleanup. This may improve a route but does not count as platform progress.
- `generated asset/content`: generated GLB/HDR/texture/backdrop content. This is never accepted as a replacement for real authored/reference-quality content unless metadata, runtime reports, and visual review disclose and accept it.

## 6. Phase P0 - Evidence And Regression Guardrails

Purpose: stop false progress. Tooling must make it impossible to claim acceptance from partial captures, stale screenshots, automated metrics, or hidden route hacks.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P0.1 | Required | Screenshot discipline | `execute.md`, `tests/browser/v9-advanced-examples-gallery.spec.ts`, `tools/v9-advanced-gallery-visual-review/index.ts` | Screenshots are verification only after a named source-owner fix. Focused route captures must not look like complete gallery runs. | Typecheck; review output clearly distinguishes partial/focused artifacts from full gallery evidence. |
| P0.2 | Done | Visual regression inventory | `tools/v9-advanced-gallery-visual-review/*`, `tests/reports/v9/advanced-examples-gallery/visual-regression-inventory.json` | Inventory Product/Data/Reactor current, older, baseline, recovered, and partial screenshot artifacts with hashes, dimensions, timestamps, and runtime JSON. Do not delete old artifacts. | `pnpm v9:advanced-gallery:review` now writes `visual-regression-inventory.json`; inventory reports current artifacts, hash/mtime evidence, historical candidates, and whether older baselines are human-verified. |
| P0.3 | Required | Review gate hardening | `tools/v9-advanced-gallery-visual-review/index.ts`, tests under `tests/unit/tools/*` | Block accepted state for stale hashes, partial route reports, missing human reviewer, missing known-gaps notes, asset/scaffold dominance, material failure, crop artifacts, bad cadence, or generated-asset overclaim. | Unit tests prove each blocker. |
| P0.4 | Done / Non-Promotional Audit | Report audit hardening | `tools/v9-advanced-gallery-report-audit/index.ts`, tests under `tests/unit/tools/*` | Audit route reports for reusable-system evidence, unsupported disclosures, screenshot hashes, image stats, material/texture evidence, generated-asset disclosure, CPU/GPU mode, performance, and full-gallery evidence mode. | Audit ignores non-route support reports such as `visual-regression-inventory.json`, blocks focused/partial route reports, and does not mark routes accepted. |
| P0.5 | Required | No-regression workflow | `tests/browser/v9-advanced-examples-gallery.spec.ts`, review tool, report audit | Any renderer/material/loader/environment/postprocess/gallery-shell change requires focused tests before one capture and full sweep only after focused gates pass. | Tooling or docs enforce sequence; no repeated screenshot loops. |
| P0.6 | Done / Audit Path | Partial report folder blocker | `package.json`, `tools/v9-advanced-gallery-report-audit/index.ts`, `tools/v9-advanced-gallery-visual-review/index.ts`, `tests/browser/v9-advanced-examples-gallery.spec.ts` | Focused route captures must not leave a report folder that audit/review can mistake for complete ten-route evidence. Audit must require exactly the expected ten route JSON reports before full-gallery claims. | `tests/unit/tools/v9-advanced-gallery-report-audit.test.ts` proves partial report folders fail audit; visual review still blocks current stale Product screenshots. |
| P0.7 | Required | Route-local hack containment | `apps/v9-advanced-examples-gallery/src/main.ts`, `sceneBuilders.ts`, `authoredLayer.ts`, `galleryRoutePolicies.ts`, Product/Data route modules | Route-specific camera, postprocess, visibility, product policy, and data density logic must move out of shared orchestration. `main.ts` stays renderer/shell orchestration. | Typecheck, route module tests, focused route tests, and no new route-specific `if` branches without PRD owner. |
| P0.8 | Done | Package script accountability | `package.json` | Keep scripts for full gallery capture, review, audit, and pipeline explicit. The audit script must be non-promotional and pipeline must run capture, review, and audit in order. | `package.json` exposes `v9:advanced-gallery:audit` and `v9:advanced-gallery:pipeline`; pipeline runs capture, review, and audit in order. |

P0 acceptance checklist:

- [x] `pnpm v9:advanced-gallery:review` remains blocked while current route metadata is not accepted.
- [x] Partial/focused captures cannot be mistaken for full gallery evidence.
- [x] Product/Data/Reactor visual defects are mapped to source owners before further screenshots.
- [x] Review tools do not weaken thresholds to make current screenshots pass.
- [x] Partial report folders fail audit/review loudly.
- [ ] Route-local decisions are in route policy modules, not buried in `main.ts`, `sceneBuilders.ts`, or `authoredLayer.ts`.
- [x] Accepted-state metadata gate is unit-tested for reviewer, timestamp, screenshot path/hash, comparison notes, known-gap acknowledgement, and rejection/scaffold language.
- [x] Accepted-state runtime gate is unit-tested for material diagnostics, scaffold dominance, crop/stage-edge risk, capture cadence, generated-asset disclosure, and Data Galaxy GPU overclaim.
- [x] Accepted-state runtime gate is unit-tested for Product/Data low local contrast and Product low detail-edge density so current bad screenshots cannot be promoted by metadata alone.
- [x] Accepted-state and audit gates are unit-tested for Product no-texture authored dominance, Data generated/no-texture focal-role overclaim, expanded slab/stage dominance language, low contrast/detail metrics, bad cadence, and focused/partial report blockers.
- [x] Accepted-state visual-review gate now blocks Data Galaxy generated/support authored GLB dominance even when the generated support GLB has limited texture-backed evidence; support-only content cannot carry Data acceptance.
- [x] `pnpm exec vitest run tests/unit/tools/v9-advanced-gallery-visual-review-gate-rules.test.ts tests/unit/tools/v9-advanced-gallery-report-audit.test.ts --reporter=dot` passed after updating Data generated-support gate wording.
- [x] `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the Data generated-support visual-review gate update.

## 7. Phase P1 - Renderer Visual Foundation

Purpose: make renderer output stable, sharp, correctly colored, and reportable before trying to polish routes.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P1.1 | Required | Color pipeline | `packages/rendering/src/Renderer.ts`, `packages/rendering/src/ForwardPass.ts`, `packages/rendering/src/RendererVisualPipelineReport.ts`, future `ColorManagement.ts`, tone/exposure files | First-class output color space, linear workflow, sRGB correctness, tone mapping presets, exposure, HDR/LDR target policy, screenshot color consistency. | Unit tests and browser proof that the same scene captures consistently. |
| P1.2 | Required | DPR and backing enforcement | `Renderer.ts`, `RenderDevice.ts`, browser tests, gallery report capture | Canvas backing size, device pixel ratio, screenshot downsample/upscale evidence, no soft/upscaled captures. | Runtime JSON reports DPR/backing/capture size; screenshots are sharp. |
| P1.3 | Required | Presentation state hardening | `ForwardPass.ts`, WebGL2 device/render pipeline files, postprocess path | Scene state must not leak into fullscreen presentation: sampler state, scissor/stencil/polygon offset/color mask, cull/depth/blend, framebuffer flush. | Focused renderer regression tests; product/data background proof does not black out or wash out. |
| P1.4 | Required | Frame cadence reporting | `RendererVisualPipelineReport.ts`, gallery capture/report files | Separate load timing, render work, RAF cadence, screenshot timing, post-load stable stats. | Runtime JSON distinguishes headless capture cadence from route performance claims. |
| P1.5 | Required | Visual clarity diagnostics | `packages/rendering/src/postprocess/CinematicDiagnostics.ts`, report audit | Detect washed-out tone, bloom/noise risk, soft detail, weak local contrast, unsupported pass claims. | Unit tests and route reports show clarity warnings without accepting routes. |

P1 acceptance checklist:

- [ ] Renderer exposes/report color space, tone, exposure, HDR/LDR path, DPR, backing size, and screenshot consistency.
- [x] Current Product/Data failures are not blamed on route composition until renderer clarity is proven in reference harnesses.
- [ ] No route uses CSS darkness or camera crop to hide renderer visual defects.

## 8. Phase P2 - Asset And Material Activation

Purpose: make GLB assets load, diagnose, bind, and render honestly. Raw GLB loading is not enough.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P2.1 | Required | GLTF extension truth | `packages/assets/src/GLTFLoader.ts`, `packages/assets/src/GLTFExtensionSupport.ts`, `packages/assets/src/AssetInspection.ts` | Bucket extensions as runtime-supported, decoder-required, parsed-with-limits, diagnostic-only, or unsupported. Required unsupported extensions must fail or warn loudly. | `tests/assets/gltf-extension-support.test.ts`; route JSON lists exact support/limits. |
| P2.2 | Required | GLTF render-resource metadata | `packages/assets/src/GLTFRenderResources.ts`, `packages/assets/src/index.ts`, tests under `tests/assets/*` | Per-renderable node, geometry, material, source material, primitive, variant, texture-backed slots, fallback-white counts, missing-material counts, missing-geometry counts. | Asset tests; Product runtime report proves original asset material/texture evidence. |
| P2.3 | Required | PBR fallback correctness | `packages/rendering/src/PBRMaterial.ts`, `TexturedPBRMaterial.ts`, `PbrReference.ts`, `ShaderChunks.ts`, `ShaderLibrary.ts`, `packages/rendering/src/shaders/pbr-direct.frag.glsl` | Fix clearcoat, specular, iridescence, transmission, glass opacity, normal-map sampler handling, environment specular over-brightening, fallback-white behavior. | Shader/PBR unit tests; Product reference harness screenshot. |
| P2.4 | Done / runtime-evidenced | Material override API | `GLTFRenderResources.ts`, gallery product policy files | Product controls must target imported material semantics through metadata, not blind route key scans. | Unit tests prove Product variant target planning through `GLTFRenderResources.materialVariants`; focused Product runtime JSON reports imported material-control binding counts for original car/watch/shoe GLBs. |
| P2.5 | Required | Texture/compression boundary | `GLTFLoader.ts`, decoder files, `KTX2BasisTextureTranscoder.ts`, `GLTFCompressionDecoders.ts`, `AssetInspection.ts` | Draco, Meshopt, KTX2/BasisU, WebP/AVIF, texture transform, mesh quantization, and unsupported decoder boundaries must be explicit. | Loader tests and diagnostics; no generic "loaded" claim hides missing support. |
| P2.6 | Required | EXR boundary | `packages/assets/src/loaders/EXRLoader.ts` or real EXR implementation | Diagnostic-only EXR must not be claimed as production decode. Implement real OpenEXR decode or keep unsupported. | Tests prove either real decode or explicit diagnostic-only status. |

P2 acceptance checklist:

- [x] Product reference harness renders original car/watch/shoe/sunglasses outside the gallery UI.
- [ ] Material failures are fixed in package code or remain blocked with explicit unsupported status.
- [ ] Route-level paint/glass overrides are not counted as platform material fixes.
- [x] Runtime reports disclose material/texture counts, extension support, fallback/missing counts, and imported material-control binding counts from current captured JSON.
- [x] `AssetInspection.ts` exposes render-resource diagnostics and per-material extension-support records so inspection reports can surface texture-backed materials, fallback-white counts, missing geometry/material counts, and parsed-with-limits material extension boundaries.
- [x] `tests/assets/gltf-inspection.test.ts` covers render-resource diagnostics, fallback-white warnings, missing binding diagnostics, and `KHR_materials_transmission` parsed-with-limits downgrade truth.
- [x] `packages/rendering/src/TexturedPBRMaterial.ts` now exposes `texturedPbrShaderActiveTextureSlots(...)` and `isTexturedPbrTextureSlotShaderActive(...)` so diagnostics can tell which runtime-bound texture slots are actually sampled by the selected textured-PBR shader variant.
- [x] `packages/assets/src/GLTFRenderResources.ts` now splits render-resource texture evidence into runtime-bound `textureSlotDiagnostics`, `shaderActiveTextureSlotDiagnostics`, and `shaderInactiveTextureSlotDiagnostics`; unsupported mixed extension texture groups can no longer be counted silently as fully shader-sampled material fidelity.
- [x] `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` now includes shader-active and shader-inactive texture slot diagnostics in authored material runtime reports.
- [x] `tools/v9-advanced-gallery-report-audit/index.ts` now blocks Product material evidence when runtime-bound texture slots are inactive in the selected textured-PBR shader variant, so reports cannot promote unsupported mixed extension texture groups as fully shader-sampled material fidelity.
- [x] `tests/assets/gltf-inspection.test.ts` includes a mixed clearcoat/specular texture fixture proving runtime-bound extension textures are reported as shader-inactive when the selected shader variant does not sample that group.
- [x] `tests/unit/rendering/shader-library.test.ts` covers the active textured-PBR slot map for base, clearcoat, and specular/sheen/anisotropy plus iridescence variants.
- [x] `tests/unit/tools/v9-advanced-gallery-report-audit.test.ts` covers Product audit blocking when shader-inactive texture slots are present in authored material diagnostics.
- [x] `pnpm exec vitest run tests/assets/gltf-inspection.test.ts --config tests/assets/vitest.config.ts --reporter=dot` passed after adding shader-active texture diagnostics.
- [x] `pnpm exec vitest run tests/unit/rendering/shader-library.test.ts tests/unit/apps/v9-route-scene-modules.test.ts --reporter=dot` passed after adding shader-active texture diagnostics to rendering and authored reports.
- [x] `pnpm exec vitest run tests/unit/tools/v9-advanced-gallery-report-audit.test.ts --reporter=dot` passed after adding the Product shader-inactive texture audit blocker.
- [x] `pnpm build` passed after updating package exports/dist for shader-active texture diagnostics.
- [x] Focused Product browser capture passed after rebuild; `product-configurator.json` now reports `shaderActiveTextureSlotDiagnostics` and empty `shaderInactiveTextureSlotDiagnostics` for the current original Product GLBs, plus the metadata-backed material-control counts.
- [x] `productConfiguratorImportedMaterialControlPlan(...)` plans original Product GLB material controls through `GLTFRenderResources.materialVariants` metadata without mutating original imported materials or using route-local paint overrides.
- [x] `AuthoredMaterialDiagnostic` now has fields for Product material-control target count, unique material count, selected variant, control key, metadata source, target material keys, target source materials, and limitation text.
- [x] `tests/unit/apps/v9-product-configurator-policy.test.ts` proves metadata-backed Product material-control target planning and proves generated/support Product fixtures are not accepted as imported material-control evidence.
- [x] `tests/unit/workstream5-runtime.test.ts` now proves `createGLTFRenderResources(..., { materialVariant })` preserves per-binding `materialVariants` metadata and that `collectMaterialOverrideTargets({ variant })` resolves the selected variant binding/material from package code.
- [x] `tools/v9-advanced-gallery-report-audit/index.ts` now requires Product's real car/watch/shoe material-variant evidence to include positive `materialControlTargetCount`, `materialControlUniqueMaterialCount`, selected variant, and `GLTFRenderResources.materialVariants` source diagnostics; selected variant names alone are no longer enough.
- [x] `tests/unit/tools/v9-advanced-gallery-report-audit.test.ts` proves Product audit blocks selected-variant-only evidence and clears that specific blocker only when metadata-backed material-control binding counts are present.
- [x] `pnpm exec vitest run tests/unit/apps/v9-product-configurator-policy.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-advanced-gallery-route-policies.test.ts --reporter=dot` passed after the Product material-control diagnostics change.
- [x] `pnpm exec vitest run tests/unit/workstream5-runtime.test.ts -t "GLTFLoader preserves and validates KHR_materials_variants metadata" --reporter=dot` passed after adding package-level material-variant target coverage.
- [x] `pnpm exec vitest run tests/unit/tools/v9-advanced-gallery-report-audit.test.ts --reporter=dot` passed after tightening Product material-variant audit evidence.
- [x] `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the Product material-control diagnostics change.
- [x] `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "product-configurator renders as a complex animated G3D demo" --reporter=line --timeout=360000` passed once after the diagnostic change as focused-route evidence.
- [x] `tests/reports/v9/advanced-examples-gallery/product-configurator.json` now reports original Product asset IDs and imported material-control target counts: `chronograph-watch` `7`, `car-concept` `25`, `materials-variants-shoe` `1`, all sourced from `GLTFRenderResources.materialVariants`; `sunglasses-khronos` correctly reports no selected variant.
- [x] `tests/browser/product-configurator-reference.spec.ts`: passes and proves the original `car-concept`, watch, shoe, and sunglasses GLBs render outside the advanced gallery UI with material/texture diagnostics.
- [x] `tests/browser/data-galaxy-reference.spec.ts`: passes and proves Data Galaxy's route systems render outside the gallery shell through fixed camera/background/density with CPU/static and `0` GPU-compute disclosure.

## 9. Phase P3 - Environment, Lighting, Grounding, Reflection

Purpose: stop rebuilding visual environments inside each route. G3D needs reusable scene shells and lighting systems.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P3.1 | Required | Environment preset API | `packages/rendering/src/EnvironmentPlatform.ts`, future `EnvironmentPreset.ts`, `packages/environments/*`, gallery environment adapters | One-call presets for studio, outdoor, city, warehouse, deep-space, ocean, and clean-void with lighting/background/ground options. | Preset tests, minimal examples, screenshots, route reports. |
| P3.2 | Required | Cubemap background | `EnvironmentBackgroundPass.ts`, `EnvironmentBackgroundResources.ts`, `Renderer.ts`, `ForwardPass.ts`, `ShaderLibrary.ts` | Six-face cubemap background with camera-correct inverse-view-projection sampling. | Browser pixel proof and Data background-on/off evidence. |
| P3.3 | Required | Equirect background | Same renderer background files plus HDR/RGBE loader path | Panorama background rendering with rotation/intensity/output color controls. | Browser pixel proof and Product background-on/off evidence. |
| P3.4 | Required | Public RGBE/HDR loader | `packages/rendering/src/v6/environment/HDRLoader.ts`, `PBRHDRPipeline.ts`, `packages/rendering/src/index.ts` | Public `loadV6HdrEnvironment(...)` path with real Radiance/RGBE decode, resource creation, disposal, malformed scanline rejection. | HDR loader tests and focused gallery evidence. |
| P3.5 | Required | PMREM roughness proof | PMREM files, `TextureBinding.ts`, `MaterialBinding.ts`, `ForwardPass.ts`, `Material.ts` | Cube-only sampled environment binding exists, but Three.js-class PMREM parity needs roughness-specific visual pixel proof. | Unit tests plus WebGL2/browser material-response proof. |
| P3.6 | Required | Renderer fog | `EnvironmentPlatform.ts`, `Renderer.ts`, `ForwardPass.ts`, shader chunks | Linear, exponential, exponential-squared fog uniforms and fragment blending for PBR paths. | Fog on/off delta evidence for Fog Cathedral/Robotics; no volumetric overclaim. |
| P3.7 | Required | Product studio stage | `EnvironmentPlatform.ts`, `LightingRig.ts`, `LightingDefaults.ts`, shadow/contact helpers | Reusable premium product stage with cove/void option, controlled key/fill/rim/softbox lighting, contact grounding or explicit shadow limitation. No gray slab/crop artifact. | Unit tests and Product reference harness. |
| P3.8 | Required | Lighting/shadow platform | Lighting and shadow files, future `ShadowPass.ts`, `CascadedShadowMaps.ts`, contact helpers | Directional/sun, point, spot, hemisphere, ambient, rectangular area-light or softbox equivalent, contact shadows, shadow quality presets, CSM plan, IES status. | Product/interior/city/warehouse examples use shared presets. |
| P3.9 | Required | Reflection/refraction platform | `ReflectionProbe.ts`, future `ReflectionSurfaces.ts`, `Renderer.ts`, material integration | Planar reflector, reflective floor, refractor/glass helper, cube-camera probe scheduling, SSR unsupported status. | Product/water reports distinguish real/fallback reflection and refraction. |
| P3.10 | Required | Sky/atmosphere/weather boundary | `EnvironmentPlatform.ts`, future sky/atmosphere/weather files | Atmospheric scattering, sky dome, local fog, height fog, volumetric weather, god rays, light shafts are missing unless implemented. | Either real subsystem with tests/screenshots or explicit unsupported status. |

P3 acceptance checklist:

- [ ] Product does not rely on route-only slabs, dark floors, or gray panels.
- [ ] Data deep-space background is route-correct but not used to hide weak geometry.
- [ ] Cubemap/equirect/HDR claims are bounded to implemented renderer background paths.
- [ ] EXR, physical sky, cube camera, SSR, planar reflection/refraction, volumetrics, and full PMREM parity are not claimed until implemented.
- [x] Product stage now has reusable compact contact-grounding receiver geometry and softbox proxy diagnostics with explicit limitations; this is not yet accepted visual quality and is not a true renderer contact-shadow pass.

## 10. Phase P4 - Controls, Interaction, Scene Metadata, Animation, Physics

Purpose: make demos easy to replicate through shared runtime systems, not bespoke route code.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P4.1 | Required | Controls platform | `packages/input`, `packages/controls`, gallery adapters | Orbit, map, fly/first-person, pointer-lock, drag, transform gizmo, camera preset helper. | Unit tests and route adoption evidence. |
| P4.2 | Required | Picking/annotations | `packages/controls/src/Picking.ts`, `PickingAnnotations.ts`, `NativeControlTypes.ts`, overlays/labels helpers | Raycast or approximate picking, hover/select/highlight, hotspots, 3D labels, billboards, leader lines, measurement, bounding boxes, minimap/overview. | Product/city/digital-twin reports use shared helpers. |
| P4.3 | Required | Scene metadata and AI contract | future `packages/scene/src/SceneMetadata.ts`, route runtime JSON, report schemas | Scene graph metadata, asset provenance, material assignments, lighting plan, camera plan, animation/timeline plan, deterministic seed, revision notes, unsupported-feature disclosure. | Schema tests and route report evidence. |
| P4.4 | Required | Animation/timeline | `packages/animation`, `GLTFAnimationRuntime.ts`, `SkinnedLitMaterial.ts`, `SkinningBounds.ts`, future `Timeline.ts` | Clip playback, mixer diagnostics, skinned textured materials, clip blending, state, scrub, events, root motion/IK/retargeting unsupported status. | Robotics route proves skeletal motion and timeline diagnostics. |
| P4.5 | Required | Physics/simulation | `packages/physics/*`, physics route files, debug draw | Real rigid bodies, contacts, deterministic reset, constraints/joints/triggers/collision layers/debug where implemented, proxy limitation reporting. | Physics tests and route runtime contact/reset evidence. |
| P4.6 | Required | Capture/reset/stats shell | Gallery shell helpers | Every route gets camera controls, UI controls, performance stats, reset, capture support, loading/error/unsupported states. | Route runtime reports and UI smoke evidence. |

P4 acceptance checklist:

- [ ] Product, City, Digital Twin, and Robotics do not repeat pointer math where shared helpers exist.
- [ ] Route interactions visibly change scene state.
- [ ] Runtime JSON reports interaction state, animation state, reset state, and unsupported boundaries.
- [x] `packages/controls/src/InteractionControls.ts`: adds a reusable controls composition surface for orbit/fly routing, picking, hover/pick events, hotspot-click events, and route-provided root/ray providers.
- [x] `packages/controls/src/index.ts`: exports `InteractionControls` and its public event/options types.
- [x] `packages/controls/package.json`: declares the workspace dependency on `@galileo3d/input` needed by the reusable controls composition layer.
- [x] `tests/unit/controls/interaction-controls.test.ts`: covers orbit/fly input routing, composed picking, hover/pick/hotspot events, route-provided rays/roots, and disposal behavior.
- [x] `pnpm exec vitest run tests/unit/controls/interaction-controls.test.ts tests/unit/controls/picking-contract.test.ts --reporter=dot` passed after adding the controls composition surface.
- [x] `apps/v9-advanced-examples-gallery/src/galleryInteractionAdapter.ts` owns current gallery pointer normalization, product-hotspot pointer routing, and water/ocean ripple routing as an app-level adapter while the core controls platform remains open.
- [x] `apps/v9-advanced-examples-gallery/src/galleryInteractionAdapter.ts`: gallery orbit-drag now delegates through `packages/controls/src/InteractionControls.ts` while preserving the existing yaw/pitch behavior and route clamps.
- [x] `tests/unit/apps/v9-gallery-interaction-adapter.test.ts` covers pointer normalization, orbit drag bounds, product hotspot routing, and water/ocean ripple routing.
- [x] `pnpm exec vitest run tests/unit/apps/v9-gallery-interaction-adapter.test.ts tests/unit/controls/interaction-controls.test.ts tests/unit/controls/picking-contract.test.ts --reporter=dot` passed after wiring the gallery adapter to the core controls facade.

## 11. Existing Platform Work To Preserve

These items are existing platform progress and must not be broken while recovering Product/Data or reorganizing the gallery. They are not final parity claims, but they are reusable value that should be protected by tests and reports.

| Area | Files / Surfaces | Must Preserve | Still Not Claimed |
| --- | --- | --- | --- |
| Transmission/glass fallback diagnostics | `packages/rendering/src/ShaderChunks.ts`, `packages/rendering/src/shaders/pbr-direct.frag.glsl`, `packages/rendering/src/PbrReference.ts`, `packages/assets/src/AssetInspection.ts` | Transmission/refraction fallback diagnostics and CPU/PBR reference alignment. | Full physical glass/refraction parity. |
| GLTF extension truth reporting | `packages/assets/src/GLTFExtensionSupport.ts`, `packages/assets/src/GLTFLoader.ts`, `packages/assets/src/AssetInspection.ts`, `packages/assets/src/loaders/EXRLoader.ts` | Runtime-supported, decoder-required, parsed-with-limits, diagnostic-only, and unsupported buckets. | Real EXR decode unless implemented. |
| GLTF renderable/material metadata | `packages/assets/src/GLTFRenderResources.ts`, `packages/assets/src/index.ts`, `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` | Per-renderable node/material/source-material/primitive/variant metadata and material override target collection. | Full imported triangle picking or complete `KHR_materials_variants` UI parity. |
| Picking/annotation contract | `packages/controls/src/Picking.ts`, `packages/controls/src/PickingAnnotations.ts`, `packages/controls/src/NativeControlTypes.ts` | Approximate picking reports, imported hotspot annotations, district/building proxies, robot/entity proxies, screen-space markers. | Complete imported mesh triangle raycast selection. |
| Renderer visual pipeline reporting | `packages/rendering/src/RendererVisualPipelineReport.ts` | Color/tone/HDR/canvas backing/screenshot/DPR/frame-cadence reporting. | Visual acceptance by itself. |
| Cinematic clarity diagnostics | `packages/rendering/src/postprocess/CinematicDiagnostics.ts` | Washed-out tone, bloom/noise risk, soft detail, unsupported pass claim diagnostics. | Full compositor parity. |
| Renderer postprocess plan | `packages/rendering/src/RendererPostprocessPlan.ts`, `Renderer.ts`, `RenderDevice.ts`, gallery route reports | Active pass names, fused/native/readback mode, missing inputs, renderer-owned pass boundaries, clarity warnings. | EffectComposer parity, LUT/AOV layers, temporal accumulation, full DOF/motion blur. |
| Renderer fog platform | `packages/rendering/src/EnvironmentPlatform.ts`, `ForwardPass.ts`, `Renderer.ts`, shader files, gallery fog evidence | Linear/exponential fog profile math, uniforms, PBR fragment blending, fog on/off evidence. | Volumetric raymarching, shadowed light volumes, weather, god rays. |
| Cubemap/equirect background rendering | `EnvironmentBackgroundPass.ts`, `EnvironmentBackgroundResources.ts`, `ForwardPass.ts`, `Renderer.ts`, `ShaderLibrary.ts`, gallery background evidence | Renderer-owned cubemap/equirect background pass, inverse-view-projection sampling, background-on/off proof. | Dynamic cube cameras, reflection probes, physical sky, EXR. |
| Cube-only sampled environment binding | `TextureBinding.ts`, `Material.ts`, `MaterialBinding.ts`, `ForwardPass.ts` | `textureCube` schema, cube texture validation, PMREM/environment cube binding into PBR shaders. | Three.js PMREM visual parity, SSR, planar reflection/refraction. |
| Public RGBE/HDR loader | `packages/rendering/src/v6/environment/HDRLoader.ts`, `packages/rendering/src/v6/PBRHDRPipeline.ts`, `packages/rendering/src/index.ts` | `loadV6HdrEnvironment(...)`, Radiance/RGBE decode, malformed scanline rejection, renderer-ready resources. | EXR or broad HDR format support. |
| Evidence/report audit | `tools/v9-advanced-gallery-report-audit/index.ts` | Structural audit for reusable evidence, unsupported disclosures, performance, screenshot hashes, image stats. | Acceptance decision. |
| Environment registry/corpus readiness | `packages/environments/src/EnvironmentRegistry.ts`, `HDRIEnvironment.ts`, `EnvironmentPreview.ts`, `v6/V6EnvironmentCorpus.ts`, fixtures manifests | Reusable environment manifests, HDRI diagnostics, probe preview metadata. | Route visual acceptance or full environment parity. |

Preservation checklist:

- [ ] Any change to these files must run the focused tests that originally covered the subsystem.
- [ ] Product/Data recovery must not remove or bypass these systems to make a screenshot look better.
- [ ] If a current platform system causes visible defects, fix the platform system and keep its tests. Do not route-filter it silently.
- [ ] Route reports must keep naming the reusable subsystem consumed and the unsupported boundary.

## 12. File-Level Work Order

This section lists the concrete files that must be created, modified, or promoted. It exists so agents do not drift into route-only hacks.

### 12.1 Core Package Modules To Create Or Promote

| Module / File | Purpose | Required Tasks |
| --- | --- | --- |
| `packages/rendering/src/ColorManagement.ts` | Renderer-owned color workflow. | Add sRGB/linear conversion helpers, display transform policy, screenshot consistency tests. |
| `packages/rendering/src/ToneMapping.ts` | Tone/exposure presets. | Add filmic/ACES-style or documented equivalent presets, exposure controls, renderer report integration. |
| `packages/rendering/src/MaterialPresets.ts` | Shared material library. | Add car paint, glass, chrome, rubber, fabric, concrete, asphalt, water, hologram, debug modes with tests. |
| `packages/rendering/src/EnvironmentPreset.ts` | One-call environment API. | Add studio/outdoor/city/warehouse/deep-space/ocean/clean-void preset shape and route integration. |
| `packages/rendering/src/LightingRig.ts` | Reusable lighting rigs. | Add key/fill/rim, sun, studio, warehouse, neon, softbox equivalents, unsupported IES/GI notes. |
| `packages/rendering/src/ReflectionSurfaces.ts` | Reflection/refraction helpers. | Add planar reflector/floor/refractor helper or explicit unsupported API boundary. |
| `packages/rendering/src/effects/*` | Shared water/particle/weather effects. | Promote Data/Water/Fog helpers out of route code when reused. Track CPU/GPU mode. |
| `packages/scene/src/SceneMetadata.ts` | AI/directable scene contract. | Add asset provenance, material, lighting, camera, animation, timeline, seed, revision, unsupported metadata. |
| `packages/animation/src/Timeline.ts` | Reusable timeline and cinematic playback. | Add tracks, scrub, loop/segment playback, event markers, camera/animation integration. |
| `packages/controls/src/InteractionControls.ts` | Standard controls facade. | Compose orbit/fly/picking/hotspot/selection/camera presets for route authors. |

### 12.2 Gallery App Files To Modify By Ownership

| File | Owns | Allowed Fixes | Not Allowed |
| --- | --- | --- | --- |
| `apps/v9-advanced-examples-gallery/src/main.ts` | Gallery shell, route dispatch, renderer setup, shared capture/runtime reporting. | Wire reusable renderer/environment/control/report systems; keep loading/error/unsupported states. | Route-specific material or asset hacks. |
| `apps/v9-advanced-examples-gallery/src/metadata.ts` | Route status, known gaps, comparison basis, review notes. | Keep failed/candidate/accepted truthful; update known gaps and claims after evidence. | Mark accepted without human review and hash. |
| `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts` | Shared route scene construction until split. | Modularize repeated systems; move route-specific systems into route files. | Bury Product/Data/Reactor hacks in generic builder code. |
| `apps/v9-advanced-examples-gallery/src/sceneBuilderPrimitives.ts` | Generic scene-frame types and primitive helper functions shared by route modules and the dispatcher. | Keep `GalleryState`, `SceneFrame`, `Resources`, `item`, `frame`, `lights`, `env`, and line-batch helpers route-neutral. | Route-specific scene composition, route-specific acceptance shortcuts, or circular imports back into route modules. |
| `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` | Imported asset activation and diagnostics. | Report source/generated status, excluded nodes, material/texture counts, fallback/missing counts. | Hide nodes silently or replace original assets. |
| `apps/v9-advanced-examples-gallery/src/authoredAssets.ts` | Asset catalog truth. | Label source/generated/support assets, limitations, provenance. | Treat generated/no-texture assets as accepted hero proof without review. |
| `apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts` | Product composition and staging. | Named shots, hero/support hierarchy, deliberate detail assets, route interactions. | Renderer/material/importer fixes. |
| `apps/v9-advanced-examples-gallery/src/productConfiguratorPolicy.ts` | Product controls and interaction policy. | Focus/explode/hotspots/variant policy, documented fallbacks. | False imported raycast/variant parity claims. |
| `apps/v9-advanced-examples-gallery/src/productConfiguratorVisualCleanup.ts` | Temporary cleanup policy, if kept. | Only scoped, reported, expiring cleanup. | Permanent hidden-node workaround without platform owner. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyScene.ts` | Data composition. | Focal hierarchy, clusters, background request, camera/framing. | Unrelated prop insertion. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets.ts` | Data density/performance modes. | Curated default and explicit stress modes. | Metric-gaming counts. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyEvidence.ts` | Data runtime evidence. | CPU/static disclosure, particle/line counts, attractors, `0` GPU dispatches. | GPU compute claims. |
| `apps/v9-advanced-examples-gallery/src/reactorPostScene.ts` | Reactor Post route composition. | Keep base reactor/command-center scene, postprocess-visible systems, labels, and bounded bloom route claims route-owned. | Postprocess implementation hacks, bloom/noise masking, or shared-builder route clutter. |
| `apps/v9-advanced-examples-gallery/src/rendererEnvironmentBackgroundEvidence.ts` | Background proof. | Renderer-owned cubemap/equirect/HDR evidence and screenshot deltas. | Physical sky/reflection/volumetric overclaim. |
| `apps/v9-advanced-examples-gallery/src/rendererEnvironmentFogEvidence.ts` | Fog proof. | Renderer fog evidence and proxy exclusion notes. | Volumetric/god-ray/weather overclaim. |
| `apps/v9-advanced-examples-gallery/src/styles.css` | Gallery shell presentation. | Clean panels, overlays, responsive layout, readable controls. | CSS darkness/blur/noise used to hide render defects. |

### 12.3 Renderer And Visual Platform Files

| File / Surface | Owns | Required Fixes |
| --- | --- | --- |
| `packages/rendering/src/Renderer.ts` | Renderer API and pipeline orchestration. | Visual pipeline controls, environment background/fog/lighting binding, postprocess plan, reporting hooks. |
| `packages/rendering/src/ForwardPass.ts` | Main scene pass. | PBR uniforms, fog, environment lighting, state isolation, draw diagnostics. |
| `packages/rendering/src/RenderDevice.ts` and WebGL2 device files | Device/canvas state. | DPR/backing, render target formats, presentation state, readback/capture consistency. |
| `packages/rendering/src/ShaderChunks.ts` | Shared shader logic. | PBR lobes, material extension fallback, fog, environment sampling. |
| `packages/rendering/src/ShaderLibrary.ts` | Shader compilation/contracts. | Uniform/schema coverage for PBR, backgrounds, fog, postprocess. |
| `packages/rendering/src/shaders/pbr-direct.frag.glsl` | PBR fragment behavior. | Correct material response, no white fallback artifacts, bounded extension support. |
| `packages/rendering/src/PbrReference.ts` | CPU/reference material behavior. | Match shader fallback behavior in tests. |
| `packages/rendering/src/EnvironmentPlatform.ts` | Reusable environment logic. | Presets, fog math, studio stage, clean void, deep space, ground options. |
| `packages/rendering/src/EnvironmentBackgroundPass.ts` | Background rendering. | Cubemap/equirect camera-correct sampling and color controls. |
| `packages/rendering/src/EnvironmentBackgroundResources.ts` | Background resources. | Resource creation, validation, disposal. |
| `packages/rendering/src/v6/environment/HDRLoader.ts` | Radiance/RGBE decode. | Public loader path, malformed data rejection, diagnostics. |
| `packages/rendering/src/v6/PBRHDRPipeline.ts` | HDR environment resources. | Renderer-ready resources and PMREM/cube outputs. |
| `packages/rendering/src/RendererPostprocessPlan.ts` | Postprocess diagnostics. | Pass list, execution mode, missing inputs, costs, warnings. |
| `packages/rendering/src/postprocess/*` | Postprocess implementations. | Composer path, bloom/AO/DOF/outline/LUT/grain status, before/after evidence. |

### 12.4 Asset, Loader, And Material Activation Files

| File / Surface | Owns | Required Fixes |
| --- | --- | --- |
| `packages/assets/src/GLTFLoader.ts` | GLTF parse/load path. | Extension support, decoder boundaries, animation/material/camera/light metadata where supported. |
| `packages/assets/src/GLTFRenderResources.ts` | Renderer resource activation. | Bindings, texture-backed slots, material override targets, fallback/missing diagnostics. |
| `packages/assets/src/GLTFExtensionSupport.ts` | Extension matrix. | Supported/limited/unsupported/diagnostic buckets with tests. |
| `packages/assets/src/AssetInspection.ts` | Inspection reports. | Node/material/texture/animation counts, source/provenance, unsupported disclosure. |
| `packages/assets/src/GLTFCompressionDecoders.ts` | Compression decoder boundary. | Draco/Meshopt status and error reporting. |
| `packages/assets/src/KTX2BasisTextureTranscoder.ts` | Compressed texture boundary. | KTX2/BasisU/WebP/AVIF status and failure diagnostics. |
| `packages/assets/src/loaders/EXRLoader.ts` | EXR boundary. | Real decode or diagnostic-only status. |

### 12.5 Controls, Scene, Animation, Physics Files

| File / Surface | Owns | Required Fixes |
| --- | --- | --- |
| `packages/input/*` | Low-level input. | Pointer, keyboard, gesture state for standard controls. |
| `packages/controls/src/InteractionControls.ts` | Shared interaction composition. | Orbit/fly mode routing, composed picking, hover/pick/hotspot events, route-provided root/ray providers, and conservative disposal behavior. |
| `packages/controls/src/Picking.ts` | Picking contract. | Approximate and future precise picking reports. |
| `packages/controls/src/PickingAnnotations.ts` | Hotspots/annotations. | Shared labels, marker picking, imported asset annotations. |
| `packages/controls/src/NativeControlTypes.ts` | Control typing. | Stable API for route controls. |
| `packages/scene/*` | Scene metadata. | AI/directable scene graph and revision metadata. |
| `packages/animation/*` | Animation runtime. | Clip playback, blending, timeline, events, diagnostics. |
| `packages/physics/*` | Physics runtime. | Rigid bodies, contacts, reset, debug, constraints/limits. |

### 12.6 Test And Tool Files

| File / Surface | Owns | Required Fixes |
| --- | --- | --- |
| `tests/browser/v9-advanced-examples-gallery.spec.ts` | Browser route capture. | Route smoke, focused capture labeling, screenshot/runtime JSON generation, no false full-gallery report. |
| `tests/browser/product-configurator-reference-harness.ts` | Product diagnostic harness. | Fixed-camera original-asset render outside gallery UI. |
| `tests/browser/data-galaxy-reference-harness.ts` | Data diagnostic harness. | Fixed-camera particle/data render outside gallery UI. |
| `tools/v9-advanced-gallery-visual-review/index.ts` | Visual release gate. | Human review metadata, hash checks, blockers, partial-report detection. |
| `tools/v9-advanced-gallery-report-audit/index.ts` | Structural audit. | Reusable evidence, unsupported disclosure, performance, material/texture/generated-asset warnings. |
| `tools/v9-advanced-gallery-assets/generate-product-configurator-studio-blender.py` | Generated Product support/studio GLB. | Manifest provenance, exported GLB counts, zero-texture support-only status, and no original-asset replacement claim. |
| `tools/v9-advanced-gallery-assets/optimize-product-car-blender.py` | Product car derivative optimization. | Manifest provenance, source-car hash/counts, derivative exported counts, and original-hero replacement boundary. |
| `tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py` | Generated Data GLB. | Better source geometry/material/provenance or explicit support-only status. |
| `tools/v9-advanced-gallery-assets/generate-data-galaxy-deep-space-hdr.mjs` | Generated Data HDR. | Deep-space background provenance and non-overclaiming. |
| `package.json` scripts | Public commands. | Rename-aware scripts, gallery/review/audit commands, compatibility during taxonomy migration. |

Package script checklist carried forward:

- [x] `v9:advanced-gallery:audit` runs the structural audit and remains non-promotional.
- [x] `v9:advanced-gallery:pipeline` runs full capture, review, and audit in order.
- [ ] Decide whether the heavy advanced-gallery pipeline belongs in aggregate `pnpm v9`.
- [ ] Keep `test:visual` documented as generic visual baseline, not advanced gallery acceptance.

Generated asset tool checklist carried forward:

- [x] Data Galaxy generated asset manifests include source script, output path, hash/size where available, route linkage, material count, texture count, mesh/draw count, generated/stub/derivative/support status, intended role, limitations, and whether the asset is acceptable as focal hero or support scenery only.
- [x] Product generated/support asset manifests include source script, output path, hash/size, route linkage, exported material/texture/image/mesh/node counts, generated/derivative/support status, intended role, limitations, and whether the asset is acceptable as focal hero or support scenery only.
  - [x] `fixtures/v9/assets/product-configurator-studio-blender/manifest.json` marks the generated studio fixture support-only, generated/no-texture, `acceptableAsFocalHero: false`, and records `25` exported materials, `0` textures, `0` images, `651` meshes, `655` nodes, and `0` texture-backed materials.
  - [x] `fixtures/v9/assets/product-configurator-car-batched/manifest.json` marks the batched car as a support-only derivative of `fixtures/v8/assets/vehicles/car-concept.glb`, records source and exported GLB hashes/counts, and states it cannot replace the original Product hero without equivalence diagnostics plus current human visual review.
  - [x] `tools/v9-advanced-gallery-assets/generate-product-configurator-studio-blender.py` and `tools/v9-advanced-gallery-assets/optimize-product-car-blender.py` now write those manifests when regenerated.
  - [x] `tests/unit/tools/v9-product-configurator-generated-assets.test.ts` parses the current Product GLB binaries and verifies manifest hashes, sizes, exported counts, support-only status, derivative boundary, and no original-hero replacement claim.
  - [x] `tools/v9-advanced-gallery-report-audit/index.ts` now audits Product/Data generated asset manifests for route linkage, source script, support-only/focal-hero boundary, current output hash/size, exported GLB counts, derivative status, and original source-car hash where relevant.
  - [x] `tests/unit/tools/v9-advanced-gallery-report-audit.test.ts` proves missing generated/support manifests and stale output hash/size evidence become audit blockers.
  - [x] `apps/v9-advanced-examples-gallery/src/authoredAssets.ts` now exposes structured provenance for Product/Data generated/support assets and original Product hero assets: generated status, derivative status, support-only role, focal-hero boundary, texture-backed/no-texture status, manifest path, source script, and source asset path where relevant.
  - [x] `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` now includes `assetProvenance` in authored runtime evidence so the next route capture can report generated/support/derivative truth without relying on prose or material-count inference alone.
  - [x] `tools/v9-advanced-gallery-report-audit/index.ts` now blocks active generated/support Product/Data assets when route JSON lacks structured runtime provenance or when the provenance omits generated/support-only/focal-hero/source-script/manifest/source-asset disclosure.
  - [x] `tests/unit/apps/v9-product-configurator-policy.test.ts` proves Product catalog provenance keeps active Product route assets pinned to original texture-backed GLBs and keeps Product generated/support assets classified as support-only or derivative-only.
  - [x] `tests/unit/apps/v9-data-galaxy-budgets.test.ts` proves the active Data Galaxy generated authored GLB remains catalogued as generated/support-only provenance and cannot become focal hero evidence without review.
  - [x] `tests/browser/v9-advanced-examples-gallery.spec.ts` now asserts full runtime provenance for active Product/Data authored assets: Product must report the original `car-concept` as external, texture-backed, non-generated, non-derivative hero evidence with generated Product fixtures inactive; Data must report `data-galaxy-core-blender` as generated/support-only with manifest and source-script disclosure.
  - [x] `pnpm exec vitest run tests/unit/tools/v9-product-configurator-generated-assets.test.ts tests/unit/tools/v9-data-galaxy-generated-assets.test.ts --reporter=dot` passed after adding Product generated/support manifests.
  - [x] `pnpm exec vitest run tests/unit/tools/v9-advanced-gallery-report-audit.test.ts tests/unit/tools/v9-product-configurator-generated-assets.test.ts tests/unit/tools/v9-data-galaxy-generated-assets.test.ts --reporter=dot` passed after adding generated-asset manifest audit blockers.
  - [x] `pnpm exec vitest run tests/unit/apps/v9-product-configurator-policy.test.ts tests/unit/apps/v9-data-galaxy-budgets.test.ts tests/unit/tools/v9-advanced-gallery-report-audit.test.ts --reporter=dot` passed after adding structured catalog/runtime provenance and audit blockers.
  - [x] `python3 -m py_compile tools/v9-advanced-gallery-assets/generate-product-configurator-studio-blender.py tools/v9-advanced-gallery-assets/optimize-product-car-blender.py` passed after adding manifest writers.
  - [x] `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after adding Product manifest tests.
  - [x] `pnpm v9:advanced-gallery:audit` was rerun after the audit change; it remains correctly blocked/non-promotional with `10/10` current screenshot artifacts, `0/10` accepted visual review, `11` blockers, and no generated-asset manifest freshness blockers in the current manifest set.
  - [x] `pnpm v9:advanced-gallery:audit` was rerun after adding runtime provenance blockers; it remains correctly blocked/non-promotional with `12` blockers, including the expected stale-report blocker that the current Data Galaxy route JSON must be regenerated before it contains `assetProvenance`.
  - [x] `pnpm v9:advanced-gallery` was run once after the runtime-report provenance change. The intentional visual-acceptance guard failed, and all `10` route runtime/screenshot tests passed, refreshing full-gallery report JSON with `evidenceMode: "full-gallery"`.
  - [x] `pnpm v9:advanced-gallery:review` was rerun after the full capture and remains correctly blocked: `Release gate: blocked (0/10 accepted)`.
  - [x] `pnpm v9:advanced-gallery:audit` was rerun after the generated texture-backed Data source update and full gallery refresh; it has `10/10` expected route reports, `10/10` current screenshot artifacts, `10/10` reusable systems/unsupported disclosures/measured performance/screenshot hashes/image stats, `0` audit blockers, and `0` warnings. Visual review still blocks release at `0/10` accepted.
- [ ] Generated GLBs used by Product/Data must not be accepted as replacements for real assets until screenshot review and runtime material diagnostics agree.
- [ ] Generated HDR/backdrop assets remain route-correct background evidence only; they do not prove physical sky, EXR, dynamic cube camera, or volumetric environment support.
- [ ] Remove generated cache artifacts such as `__pycache__` from source cleanliness if they appear.

## 13. Phase P5 - Active Visual Regression Recovery

This phase fixes the current broken routes without hiding the underlying problem.

### P5A. Product Configurator Recovery

Reference category: Three.js PBR glTF product viewers, configurators, material-variant demos, and environment-lighting demos.

Required route identity:

- Hero product with named imported parts.
- Support/context assets: watch, shoe, sunglasses.
- Studio lighting and product stage.
- Material variants for at least three products/parts.
- Transparent/glass material demonstration.
- Hotspots, turntable, exploded view, detail shots, status panel.
- Multiple lights, animation, controls, stats, reset, screenshot/capture.

Source-of-truth assets that must remain:

- `fixtures/v8/assets/vehicles/car-concept.glb`
- `fixtures/v8/assets/product/chronograph-watch.glb`
- `fixtures/v8/assets/product/materials-variants-shoe.glb`
- `fixtures/v8/assets/product/sunglasses-khronos.glb`

Support/generated assets that cannot replace the hero without proof:

- `fixtures/v9/assets/product-configurator-studio-blender/product-configurator-studio-blender.glb`
- `fixtures/v9/assets/product-configurator-car-batched/car-concept-batched.glb`

Product file-owned checklist:

| File | Fix Required | Done When |
| --- | --- | --- |
| `fixtures/v8/assets/vehicles/car-concept.glb` | Source hero remains visible and texture-backed. | Report verifies GLB header, material/texture counts, variant state, and no unreported hidden car nodes. |
| `fixtures/v8/assets/product/chronograph-watch.glb` | Watch remains real support/detail asset. | No white strap/glass strip artifact; imported variant/material diagnostics are visible. |
| `fixtures/v8/assets/product/materials-variants-shoe.glb` | Shoe remains material-variant support asset. | Variant control visibly changes imported material; shoe does not dominate hero. |
| `fixtures/v8/assets/product/sunglasses-khronos.glb` | Sunglasses remain transparent/glass support asset. | Glass/transmission fallback is package-owned or explicitly bounded; placement does not read as broken geometry. |
| `packages/assets/src/GLTFRenderResources.ts` | Owns imported material/resource truth. | Normal sampler fallback, extension downgrades, fallback-white counts, missing geometry/material counts, material override targets. |
| `packages/assets/src/GLTFExtensionSupport.ts` | Owns extension truth. | KHR variants/transmission/clearcoat/volume/IOR/specular/iridescence states are accurate. |
| `packages/assets/src/AssetInspection.ts` | Owns inspection/reporting. | Product runtime JSON proves texture/material counts and missing/fallback counts. |
| `packages/rendering/src/TexturedPBRMaterial.ts` and PBR shaders | Own material response. | Car paint/glass/clearcoat/specular/normal/transmission defects fixed in package code or explicitly blocked. |
| `packages/rendering/src/EnvironmentLighting.ts` | Owns composition of route/stage lighting with sampled HDR environment resources. | Stage ambient/procedural lighting is preserved while HDR cube/equirect/BRDF bindings and calibrated sampled intensities are added; Product does not rely on route-local material hacks. |
| `packages/rendering/src/EnvironmentPlatform.ts` | Owns product stage. | No gray slab/crop/cylinder workaround in accepted shots; reusable product studio preset exists. |
| `packages/rendering/src/LightingRig.ts` | Owns product lighting. | Reusable key/fill/rim/softbox rig; unsupported area/IES/GI limits documented. |
| `apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts` | Owns composition only. | Hero/support hierarchy, named camera shots, turntable detail, no renderer/material fixes here. |
| `apps/v9-advanced-examples-gallery/src/productConfiguratorPolicy.ts` | Owns interaction policy. | Focus/explode/hotspots declared; regex fallbacks documented; no false imported triangle-picking claim. |
| `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` | Owns activation diagnostics. | Excluded nodes are sampled/reported by name/reason; no silent hiding. |
| `apps/v9-advanced-examples-gallery/src/authoredAssets.ts` | Owns catalog truth. | Source/generated/support status is explicit. |
| `apps/v9-advanced-examples-gallery/src/metadata.ts` | Owns truth label. | Product stays `failed` until human review passes exact hash. |
| `tools/v9-advanced-gallery-report-audit/index.ts` | Owns structural warnings. | Warn/block no-texture support dominance, missing original hero, missing unsupported disclosures. |
| `tools/v9-advanced-gallery-visual-review/index.ts` | Owns visual gate. | Block slab/crop artifact, white/gray washout, broken watch/sunglasses, no grounding, bad cadence, scaffold dominance. |

Product required fixes:

- [x] Move `buildProduct()` out of `sceneBuilders.ts` into `productConfiguratorScene.ts` if that prior modularization remains present.
- [x] Move product material/focus/explode regex logic out of `authoredLayer.ts` into `productConfiguratorPolicy.ts` if that prior modularization remains present.
- [x] Restore direction toward the original texture-backed Product hero rather than a no-texture scaffold or generated derivative.
- [x] Add Product same-asset reference harness rendering original car/watch/shoe/sunglasses outside gallery UI.
- [x] `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/product-configurator-reference.spec.ts --reporter=line --timeout=360000` passes as same-asset harness evidence.
- [x] Add reusable compact `product-premium` studio tone in `EnvironmentPlatform.ts` and consume it from the Product route instead of widening the route-local slab/stage workaround.
- [x] Consume reusable `LightingRig` `product-shot` lighting from the Product route and keep area-light/IES/GI/contact-shadow limits in runtime approximations.
- [x] Compose Product's reusable stage lighting with HDR environment resources through `packages/rendering/src/EnvironmentLighting.ts` instead of letting the loaded HDR bundle replace the stage environment.
- [ ] Fix PBR/material defects in package renderer and asset code first.
- [x] Remove route-local Product original-asset material appearance overrides from `authoredLayer.ts`; original car/watch GLB materials are no longer darkened or recolored there, and a unit guard prevents reintroducing that workaround.
- [x] Replace the old weak stage/slab workaround with reusable `product-premium` product studio platform behavior; visual acceptance remains blocked by material clarity, detail/contrast, and cadence.
- [x] Keep original Product assets. Do not replace with random/generated props.
- [x] Subordinate visible softbox panels and oversized floor slab dominance through reusable `product-premium` stage behavior; the route still needs direct visual review before acceptance.
- [ ] Add real visual grounding through shadow/contact/reflection support or a documented approximation that passes review.
- [ ] Remove visible broken import artifacts only by fixing importer/materials or reporting exact node exclusions.
- [ ] Make default/explode state look intentional and not like broken geometry.
- [ ] Do not replace the original texture-backed hero with a generated derivative unless the derivative report proves material/texture/extension equivalence and visual review accepts it.
- [ ] Treat generated/no-texture studio fixtures as support content only unless texture-backed material evidence and human visual review promote them.
- [ ] Keep unsupported limits explicit: imported `KHR_materials_variants` are used only where the source GLBs expose variant metadata; no complete product-aware variant graph, no imported triangle/bounds GLB raycast picking, and no scene-space refraction claims until implemented.
- [x] Runtime JSON must prove original asset IDs, material/texture counts, extension support, fallback/missing counts, excluded nodes, performance, and current screenshot hashes.
- [ ] Route remains failed until direct visual review accepts current full, hero, viewport, and background delta screenshots.

Product acceptance blockers:

- Random imported blocks.
- White watch straps or glass strips.
- Harsh fuzzy car-paint halos.
- Jagged or unsmooth PBR edge response.
- Hidden broken nodes without reporting.
- Gray slab/studio-board dominance.
- Support/no-texture fixture dominance.
- Exploded behavior that looks like a broken model.
- Bad RAF cadence or render budget failure.
- Route-level paint/color overrides counted as renderer fixes.

### P5B. Data Galaxy Recovery

Reference category: Three.js particles, GPGPU particles, galaxy generators, large-scale data visualization, and compute-style simulation demos.

Required route identity:

- Dense particle/data field.
- Strong central data core.
- Formations, clusters, attractors, trails/glow approximation, connection hints.
- Background grid/labels and deep-space staging.
- Camera movement through volume.
- Formation selector, count selector, speed/turbulence controls, attractor movement, trails/connections toggle, camera presets.
- CPU/GPU boundary disclosed honestly.

Data file-owned checklist:

| File | Fix Required | Done When |
| --- | --- | --- |
| `fixtures/v9/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb` | Generated Data core cannot be accepted as premium hero unless rebuilt/reviewed. | Generated/support-only disclosure visible; embedded generated texture-backed material evidence is reported; it remains support-only until current visual review accepts it. |
| `tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py` | Owns generated data-core content quality. | Reduces scaffold-looking geometry at source, writes manifest/provenance, reports material/texture counts. |
| `tools/v9-advanced-gallery-assets/generate-data-galaxy-deep-space-hdr.mjs` | Owns generated deep-space HDR provenance. | Route-correct background only; no physical sky/volumetric/PMREM parity claim. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyScene.ts` | Owns route composition. | Strong focal data subject, readable depth, named camera/framing, background supports subject. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets.ts` | Owns density modes. | Curated default mode, selectable stress modes, no count tuning to trick metrics. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyEvidence.ts` | Owns CPU/static particle evidence. | Labels/report state CPU/static, `0` GPU dispatches, counts, timings, trails/connections readability. |
| `packages/rendering/src/effects/*` | Owns reusable particle diagnostics and future reusable particle path. | Layered particle budget/diagnostics are package-owned; no GPU parity claim until real GPU/compute implementation exists. |
| `apps/v9-advanced-examples-gallery/src/authoredAssets.ts` | Owns asset catalog truth. | Generated/support status, texture-backed generated-material boundaries, and focal-hero limitations are explicit. |
| `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` | Owns activation diagnostics. | Excluded nodes/material counts are reported; no hidden cleanup counted as source fix. |
| `apps/v9-advanced-examples-gallery/src/metadata.ts` | Owns truth label. | Data remains `failed` until human review passes exact hash. |
| `tools/v9-advanced-gallery-report-audit/index.ts` | Owns structural warnings. | Warn/block active Data authored GLBs with zero texture-backed material evidence if used as focal proof. |
| `tools/v9-advanced-gallery-visual-review/index.ts` | Owns visual gate. | Block weak focal subject, scaffold dominance, full-frame noise, low contrast, stale hashes, bad cadence, GPU overclaim. |

Data required fixes:

- [x] Move route composition out of `sceneBuilders.ts` into `dataGalaxyScene.ts` if that prior modularization remains present.
- [x] Keep particle/evidence generation in `dataGalaxyEvidence.ts`, with `dataGalaxyBudgets.ts` owning default showcase density, stress density, line counts, overlay counts, and report thresholds where present.
- [x] Separate default hero density from stress/evidence density.
- [x] Remove the shared reusable environment-stage gray floor/catch plane from the Data Galaxy route when using infinite/deep-space staging.
- [x] Remove or demote the authored scaffold platform from the default hero through explicit imported-node exclusion reported in authored diagnostics where that workaround remains active.
- [x] Add Data same-system reference harness rendering particle/line/core systems outside gallery UI.
- [x] `packages/rendering/src/effects/ParticleDiagnostics.ts`: adds reusable `createLayeredParticleBudgetPlan(...)` so route layer counts are generated by package-level particle diagnostics instead of only app-local math.
- [x] `apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets.ts`: consumes `createLayeredParticleBudgetPlan(...)` for primary/vortex/network/wave counts while keeping Data-specific tiers and visual policy route-owned.
- [x] `tests/unit/rendering/particle-diagnostics.test.ts`: covers layered particle budget allocation, invalid-request defaults, clamping, non-compute warnings, and invalid budget definitions.
- [x] `tests/unit/apps/v9-data-galaxy-budgets.test.ts`: passes with the package-owned layered budget helper preserving the `12k showcase` route contract.
- [x] `tests/browser/data-galaxy-reference.spec.ts`: asserts current Data layer counts from the package-backed budget contract so harness evidence does not drift back to stale threshold checks.
- [x] `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/data-galaxy-reference.spec.ts --reporter=line --timeout=360000` passes as same-system harness evidence.
- [x] `tests/unit/tools/v9-data-galaxy-generated-assets.test.ts` now verifies the generated texture-backed Data source update; the current GLB reports `11` exported materials, `149` meshes, `154` nodes, `3` images, `3` textures, and `3` texture-backed materials.
- [x] `tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py` parses the exported GLB JSON chunk when writing metadata and records exported material, texture, image, mesh, node, and texture-backed material counts separately from Blender-scene counts.
- [x] `fixtures/v9/assets/data-galaxy-core-blender/manifest.json` now contains an `exportedGlb` block and `counts.exported*` fields proving the current shipped GLB has generated texture-backed support evidence.
- [x] `pnpm exec vitest run tests/unit/tools/v9-data-galaxy-generated-assets.test.ts tests/unit/apps/v9-data-galaxy-budgets.test.ts tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/tools/v9-advanced-gallery-report-audit.test.ts tests/unit/tools/v9-advanced-gallery-visual-review-gate-rules.test.ts --reporter=dot` passed after updating the tests to the current texture-backed generated support GLB.
- [x] Improve Data route-owned point/line readability without asset replacement: the 12k showcase overlay budget now emits `204` overlay spark points and `176` line-segment budget, Data-specific particle materials avoid changing Smart City particles, and focused screenshot metrics now pass the detail/contrast floors.
- [x] Update stale Data metadata/catalog wording so the generated data-core is texture-backed support-only evidence, not no-texture focal-hero proof.
- [ ] Establish curated default mode with strong central subject and readable clusters.
- [x] Establish route-owned `12k showcase` default mode with stronger central particle allocation, structured focal-hierarchy evidence, and `4k` kept as selectable interactive mode.
- [x] Separate showcase density from stress density.
- [x] Replace the old generated/no-texture Data core source classification with embedded generated texture-backed material evidence, while keeping it support-only and non-accepted.
- [ ] Rebuild or art-direct the generated Data core so the default focal subject reads as premium content, or keep it support-only with explicit generated/scaffold disclosure.
- [ ] Add accepted texture-backed or materially richer focal content before using the authored GLB as acceptance support.
- [x] Do not insert unrelated product, character, helmet, vehicle, or decorative prop to fake quality.
- [x] Do not claim GPU compute unless real GPU path exists.
- [x] Preserve CPU/GPU honesty: labels and runtime reports must continue to state CPU/static particles and `0` native GPU compute dispatches until a real compute path exists.
- [x] Use an art-directed deep-space/data backdrop; terrestrial HDRIs remain diagnostic proof only.
- [x] Add performance budgets for default hero mode and separate stress mode.
- [x] Runtime JSON discloses generated authored content, texture-backed/support-only status, CPU/static mode, `0` GPU dispatches, counts, timings, unsupported boundaries, and screenshot hashes in current full-gallery evidence.
- [ ] Route remains failed until direct visual review accepts current full, hero, viewport, and background delta screenshots.

Data acceptance blockers:

- Static starfield look.
- Thin density or unreadable clutter.
- Weak central focal subject.
- Generated support scaffold as premium focal proof.
- GPU-compute overclaim.
- Count switches that break cadence.
- Background used to hide weak content.
- Unrelated prop insertion.

### P5C. Reactor Post Recovery

Reference category: Three.js EffectComposer, bloom, UnrealBloomPass, color grading, command-center/effects demos.

Required route identity:

- Animated reactor or command-center focal subject.
- Metallic structures, glass panels, emissive strips, holographic panels, particles/dust, scan lines or energy rings, layered architecture.
- Bloom toggle, color-grade toggle, exposure/vignette controls where supported, camera presets, pause/resume, debug mode, before/after comparison where feasible.

Reactor file-owned checklist:

| File | Fix Required | Done When |
| --- | --- | --- |
| `apps/v9-advanced-examples-gallery/src/reactorPostScene.ts` | Owns Reactor route base scene composition. | Base scene reads clearly before postprocess; route module exposes bounded postprocess labels and claims. |
| `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts` | Owns dispatch plus shared legacy route helpers until remaining route splits finish. | Does not contain the Reactor route body. |
| `apps/v9-advanced-examples-gallery/src/sceneBuilderPrimitives.ts` | Owns generic scene-frame helper/types shared by route modules. | Route modules do not import runtime helper functions back from `sceneBuilders.ts`. |
| `packages/rendering/src/postprocess/*` | Owns postprocess implementation. | Effects are independent where claimed, non-noisy by default, and report pass cost. |
| `packages/rendering/src/RendererPostprocessPlan.ts` | Owns pass diagnostics. | Reports active passes, missing depth/velocity inputs, native/readback mode, clarity warnings. |
| `apps/v9-advanced-examples-gallery/src/metadata.ts` | Owns truth label. | Reactor remains candidate until visual review accepts current hash. |
| `tools/v9-advanced-gallery-visual-review/index.ts` | Owns visual gate. | Blocks bloom/noise hiding weak base geometry. |

Completed Reactor modularization subtasks:

- [x] `apps/v9-advanced-examples-gallery/src/reactorPostScene.ts`: owns the Reactor route scene body instead of `sceneBuilders.ts`.
- [x] `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts`: dispatches `reactor-post` to `buildReactorPostScene(...)` and no longer contains `buildReactor` or `addReactorPurposefulDetailLines`.
- [x] `apps/v9-advanced-examples-gallery/src/sceneBuilderPrimitives.ts`: owns route-neutral `GalleryState`, `SceneFrame`, `Resources`, `item`, `frame`, `lights`, `env`, `num`, `bool`, `pushSegment`, and `pushLineGroup`.
- [x] Product/Data/Reactor route modules now import generic scene-frame helpers from `sceneBuilderPrimitives.ts` instead of importing runtime helpers back from `sceneBuilders.ts`.
- [x] `tests/unit/apps/v9-route-scene-modules.test.ts`: covers Reactor route-owned composition, bounded bloom default, route labels, and absence of debug-only command wall strips in default mode.
- [x] `pnpm exec vitest run tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-advanced-gallery-route-policies.test.ts tests/unit/apps/v9-gallery-interaction-adapter.test.ts --reporter=dot` passed with `12` tests.
- [x] `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the primitive-helper extraction.

Reactor acceptance blockers:

- Bloom hiding weak geometry.
- Noisy postprocess or excessive grain.
- Unrelated postprocess disabled when bloom toggles.
- Render-work budget failure.
- No before/after evidence.
- Weak base scene before effects.

### P5D. Partial Report And Route-Hack Recovery

This carries forward the old F-004 and F-005 instructions.

Partial report folder problem:

- A focused Playwright run can leave `tests/reports/v9/advanced-examples-gallery/` containing only a subset of route artifacts.
- Review/audit tooling must not treat that partial folder as full-gallery evidence.
- The audit must require exactly the ten expected route JSON reports before release-state claims.
- Review must clearly report missing route artifacts.
- Audit remains non-promotional; it never marks a route accepted.

Required package/report tasks:

- [x] `package.json`: keep or add `v9:advanced-gallery:audit`.
- [x] `package.json`: keep or add `v9:advanced-gallery:pipeline` that runs capture, review, and audit in order.
- [x] `tools/v9-advanced-gallery-report-audit/index.ts`: fail partial report folders.
- [x] `tools/v9-advanced-gallery-report-audit/index.ts`: require exactly the ten expected route JSON reports.
- [x] `tools/v9-advanced-gallery-report-audit/index.ts`: require current full, viewport, and hero PNG artifacts to exist on disk and match the route JSON hashes before audit evidence counts as current.
- [x] `tools/v9-advanced-gallery-visual-review/index.ts`: report missing/stale route artifacts clearly.
- [x] `tests/browser/v9-advanced-examples-gallery.spec.ts`: label focused route outputs as focused evidence, not full-gallery evidence.

Route-local hack containment problem:

- `main.ts`, `sceneBuilders.ts`, and `authoredLayer.ts` must not become route-specific workaround files.
- Product route logic belongs in Product route modules.
- Data route logic belongs in Data route modules.
- Shared scene-builder code must stay generic.
- `main.ts` must remain orchestration: boot renderer, bind shell events, dispatch route policies, publish runtime evidence.

Required containment tasks:

- [x] `apps/v9-advanced-examples-gallery/src/main.ts`: move per-route camera, postprocess, and visibility decisions into `galleryRoutePolicies.ts` or route-owned policy modules.
- [ ] `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts`: keep only shared helpers and route dispatch.
- [ ] `apps/v9-advanced-examples-gallery/src/authoredLayer.ts`: keep imported asset activation generic.
- [x] `apps/v9-advanced-examples-gallery/src/galleryRoutePolicies.ts`: own extracted per-route camera, postprocess, and visibility policies.
- [x] `apps/v9-advanced-examples-gallery/src/sceneBuilderPrimitives.ts`: own generic route-neutral scene-frame primitives so route modules do not import runtime helpers from the dispatcher.
- [x] Do not add new `if (selectedDemo.id === "...")` branches in `main.ts` unless this PRD is updated with an explicit reason and owner.

Completed containment subtasks:

- [x] `apps/v9-advanced-examples-gallery/src/dataGalaxyScene.ts`: removed runtime imports back from `sceneBuilders.ts` so Data Galaxy route composition no longer creates a scene-builder/data-route circular dependency.
- [x] `apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts`: consumes generic scene-frame primitives from `sceneBuilderPrimitives.ts` rather than runtime helpers from `sceneBuilders.ts`.
- [x] `apps/v9-advanced-examples-gallery/src/reactorPostScene.ts`: consumes generic scene-frame primitives from `sceneBuilderPrimitives.ts` rather than runtime helpers from `sceneBuilders.ts`.
- [x] `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts`: keeps Product, Data Galaxy, and Reactor route bodies out of the shared dispatcher; remaining legacy route bodies still need follow-up extraction before the broad containment task can be checked.
- [x] `tests/unit/apps/v9-advanced-gallery-route-policies.test.ts`: covers extracted camera, postprocess, and procedural visibility policy behavior.
- [x] `apps/v9-advanced-examples-gallery/src/galleryRoutePolicies.ts`: now also owns render-item ordering, Product hotspot-picking routing, water/ocean ripple routing, and route-specific canvas backing-edge policy.
- [x] `apps/v9-advanced-examples-gallery/src/main.ts`: consumes the route-policy helpers for those orchestration decisions instead of embedding new route-specific branches.
- [x] `apps/v9-advanced-examples-gallery/src/galleryInteractionAdapter.ts`: owns current pointer normalization, orbit drag math, Product hotspot action routing, and water/ocean ripple routing outside `main.ts`.
- [x] `pnpm exec vitest run tests/unit/apps/v9-advanced-gallery-route-policies.test.ts --reporter=dot` passed with `7` route-policy tests after the extraction.
- [x] `pnpm exec vitest run tests/unit/apps/v9-gallery-interaction-adapter.test.ts --reporter=dot` passed with `2` interaction-adapter tests.
- [x] `tests/unit/tools/v9-advanced-gallery-report-audit.test.ts`: covers JSON-only screenshot hashes being blocked when current full/viewport/hero artifacts are absent, and passing when temp artifacts exist with matching hashes.
- [x] `pnpm exec vitest run tests/unit/tools/v9-advanced-gallery-report-audit.test.ts tests/unit/tools/v9-advanced-gallery-visual-review-gate-rules.test.ts --reporter=dot` passed with `20` reporting/review tests after the current-artifact audit gate.
- [x] `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the extraction.
- [x] `rg -n "selectedDemo\\.id ===|selectedDemo\\.id !==|selectedDemo\\.id ==|selectedDemo\\.id !=" apps/v9-advanced-examples-gallery/src/main.ts` returns no exact route-specific equality branches.

## 14. Phase P6 - Remaining Route PRDs

Each route below must remain modular, interactive, animated, instrumented, resettable, capturable, and honest about unsupported features.

### 14.1 Digital Twin

Reference category: Three.js CAD viewers, robotics dashboards, industrial digital twins, simulation environments.

Required systems:

- Factory zones, robot arms, mobile robots, conveyors, work cells, crates/packages, safety zones, sensor fields, operator stations, floating labels, status panels, heatmap/quality overlay, timeline playback.

Required animated systems:

- Conveyor motion, robot arm movement, mobile robot pathing, package flow, sensor sweep/status pulses.

Required interactions:

- Inspect robot, toggle sensors, toggle safety zones, toggle heatmap, start/pause, simulation speed, camera presets, select zone, reset.

Owner files:

- `apps/v9-advanced-examples-gallery/src/digital*`
- controls and picking helpers
- scene metadata/report schemas
- physics/simulation helpers
- `metadata.ts`

Acceptance blockers:

- Random shape collection.
- Unreadable enterprise overlays.
- No credible industrial scale.
- Interactions that do not affect scene state.
- Live telemetry/CAD ingestion claims without implementation.

### 14.2 Robotics Lab

Reference category: Three.js animation keyframes, skeletal animation, skinning, and IK demos.

Required systems:

- Animated GLB or documented multi-part robot fallback, at least three animated entities, lab environment, timeline/state machine, labels, lights, skeleton/debug overlay where supported, camera follow/choreography.

Required interactions:

- Play/pause, animation state, timeline scrub where possible, select entity, skeleton/debug toggle, camera follow, reset.

Owner files:

- robotics route files
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/rendering/src/SkinnedLitMaterial.ts`
- `packages/rendering/src/SkinningBounds.ts`
- animation/timeline helpers
- `metadata.ts`

Acceptance blockers:

- Camera/root/target motion counted as character animation.
- White/default skinned materials.
- Ungrounded assets.
- IK parity claims without reliable implementation.
- Retargeting/constraints/root-motion claims without evidence.

### 14.3 Smart City

Reference category: Three.js instancing, performance, city-scale and large-scene examples.

Required systems:

- Hundreds/thousands of styled objects, buildings/districts/roads/bridges, traffic/data pulses, color-coded zones, hover/select overlays, haze, dashboard/minimap where feasible, orbit/flythrough modes.

Required interactions:

- Object-count levels, select/hover district, traffic/data toggle, bounds/wireframe toggle, flythrough, reset.

Owner files:

- smart-city route files
- instancing/batching helpers
- controls/picking helpers
- environment/haze helpers
- `metadata.ts`

Acceptance blockers:

- Benchmark-grid look.
- Authored city claiming instancing proof without scale evidence.
- Poor aerial composition.
- Slideshow cadence.
- No district/entity interaction.

### 14.4 Fog Cathedral

Reference category: Three.js fog, light shafts, atmospheric scenes, cinematic shader scenes.

Required systems:

- Large environment, foreground/midground/background, renderer fog/haze, god-ray approximation, moving beams, dust particles, tall structures, emissive details, animated environment motion, cinematic camera path.

Required interactions:

- Fog density, beam toggle, sun/spotlight angle, camera shots, pause cinematic camera, debug lighting.

Owner files:

- fog route files
- `packages/rendering/src/EnvironmentPlatform.ts`
- renderer fog/shader files
- dust/beam helpers
- camera path helper
- `metadata.ts`

Acceptance blockers:

- Visible crop edges.
- Gray fog box.
- No depth layers.
- False volumetric raymarch claims.
- Weak subject readability.

### 14.5 Physics Playground

Reference category: Three.js Ammo/Rapier/Jolt physics playgrounds and collision demos.

Required systems:

- Many moving objects where stable, stacked boxes, spheres/cylinders/capsules, ramps, conveyor, robotic pusher/gripper, target bins, collision/debug overlay, metrics panel.

Required interactions:

- Spawn objects, drop piles, gravity control, conveyor speed, activate pusher/gripper, debug view, reset, slow motion.

Owner files:

- physics route files
- `packages/physics/*`
- debug draw helpers
- reset/determinism helpers
- `metadata.ts`

Acceptance blockers:

- Pseudo-physics labeled as real physics.
- Primitive/proxy collider limits hidden from review.
- Kinematic-only robot described as articulated dynamics.
- Non-deterministic reset.

### 14.6 Water Lab

Reference category: Three.js GPGPU water, WebGL water, WebGPU water.

Required systems:

- Animated water surface, ripple interaction, floating props, shoreline/dock environment, sky/lighting preset, emissive dock lights, background architecture/terrain, debug wave overlay.

Required interactions:

- Click/touch ripple, drag disturbance, wave intensity, ripple radius, wire/debug wave view, lighting preset, reset.

Owner files:

- water route helpers
- water systems helper
- future `packages/rendering/src/effects/*`
- `EnvironmentPlatform.ts`
- `metadata.ts`

Acceptance blockers:

- Blue-plane look.
- Invisible interaction.
- Native GPGPU/FFT/reflection/refraction claims without implementation.
- Environment that reads only as a water test.

### 14.7 Ocean Observatory

Reference category: Three.js WebGPU water, WebGL ocean, advanced shader scene.

Required systems:

- Large tiled ocean, layered wave motion, reflection highlight, deck/rail/glass props, horizon atmosphere, drones/buoys/vessels, lighting/weather modes, optional bloom/glow.

Required interactions:

- Orbit camera, calm/storm/cinematic modes, wind direction/speed, wave scale, object paths toggle, debug normals/reflections where supported.

Owner files:

- ocean route helpers
- water/ocean helper files
- horizon/atmosphere helpers
- moving path helpers
- `metadata.ts`

Acceptance blockers:

- Visually indistinct from Water Lab.
- Fake SSR/refraction claims.
- Weak horizon/scale.
- No moving systems beyond waves.

### 14.8 Legacy Route Health Blockers

This carries forward the old F-006 instruction. Earlier example routes cannot be used as evidence while blank, low-resolution, slow, static, or materially broken.

Files/directories to inspect and fix:

- `apps/v8-shadowmap-viewer/`
- `apps/v8-geometry-drawrange/`
- `apps/v8-materials-transmission/`
- `apps/v8-webgpu-rtt/`
- `apps/v8-webgpu-materials/`
- `apps/v8-webgpu-instance-uniform/`
- `apps/v8-webgpu-compute/`
- `apps/v8-webxr-interactions/`
- `apps/v8-postprocessing-bloom/`
- `apps/v8-postprocessing-depth-outline/`
- `apps/v8-loader-obj/`
- `apps/v8-loader-gltf-variants/`
- `apps/v8-loader-material-extensions/`
- `apps/wow-kira-ik-room/`
- `apps/wow-common/`

Required checklist:

- [ ] Do not present these routes as fixed until screenshots prove they are fixed.
- [ ] Add route health smoke/screenshots for blank route detection.
- [ ] Enforce DPR/backing-size checks.
- [ ] Enforce animation/motion checks where the route implies animation.
- [ ] Fix Kira white/default material issues through GLTF/material/skinned path if still present.
- [ ] Fix Kira static/slow load issues before it is shown as a WOW route.
- [ ] If a route relies on unsupported WebGPU/WebXR capability, disclose the fallback or keep it non-claiming.

Exit gates:

- [ ] Focused browser screenshot for each affected route.
- [ ] Console/page errors clear or explicitly documented.
- [ ] Motion and DPR evidence present where applicable.

## 15. Phase P7 - Core Platform Capability Backlog

These are required for G3D to scale beyond ten examples.

| ID | Platform Lane | Required Capability | Files / Surfaces | Acceptance Evidence |
| --- | --- | --- | --- | --- |
| C1 | Renderer visual pipeline | Output color space, sRGB, linear workflow, tone mapping, exposure, HDR targets, DPR/backing, screenshot consistency. | `packages/rendering/src/Renderer.ts`, `ForwardPass.ts`, `RenderDevice.ts`, `RendererVisualPipelineReport.ts`, tone/color files. | Renderer tests, browser proof, route reports. |
| C2 | Lighting/shadow system | Sun, point, spot, hemisphere, ambient, softbox/area equivalent, contact shadows, shadow presets, CSM, light probes/SH, IES status. | Lighting and shadow files, environment presets. | Product/interior/city/warehouse evidence. |
| C3 | Reflection/refraction surfaces | Planar mirror, refractor/glass helper, water reflection/refraction helper, cube-camera probes, reflective floor, SSR status. | `ReflectionProbe.ts`, future `ReflectionSurfaces.ts`, renderer/material integration. | Product/water reports distinguish real/fallback modes. |
| C4 | Asset and texture parity | GLTF extension audit, KHR variants, clearcoat, transmission, volume, IOR, specular, iridescence, emissive strength, texture transform, quantization, Draco, Meshopt, KTX2/BasisU, WebP/AVIF, HDR/EXR/RGBE. | `packages/assets/*`, texture/decoder/transcoder files. | Loader diagnostics and material screenshots. |
| C5 | Controls and interaction | Orbit, map, fly, pointer-lock, drag, transform gizmo, raycast picking, hover/select/highlight, camera presets, object inspection. | `packages/input`, `packages/controls`. | Product/city/digital-twin adoption. |
| C5a | Interaction composition | Reusable route-facing controls facade over existing input, orbit/fly controls, picking, hover, pick, and hotspot events. | `packages/controls/src/InteractionControls.ts`, `packages/controls/src/index.ts`, `tests/unit/controls/interaction-controls.test.ts`. | Core API and tests exist; gallery routes still need adoption before C5 is complete. |
| C6 | Postprocess composer | Render pass, output pass, bloom, FXAA/SMAA/TAA status, SSAO/SAO/GTAO status, DOF, outline, vignette, LUT, grain, god rays, before/after, per-pass timing. | `packages/rendering/src/postprocess/*`, `PostProcessPass.ts`, `RendererPostprocessPlan.ts`. | Reactor route and focused pass tests. |
| C7 | Environment preset API | Studio, outdoor, city, warehouse, deep-space, ocean, clean-void presets with lighting/background/ground options. | `EnvironmentPlatform.ts`, future `EnvironmentPreset.ts`, docs/examples. | Preset screenshot gallery and route use. |
| C8 | Camera/cinematic system | Orbit, flythrough, path camera, spline/path authoring, shake, focus target, dolly/zoom, screenshot shot registry, named shots. | controls/camera helpers, scene metadata. | Accepted screenshots generated from named shots. |
| C9 | Scene annotations/UI overlays | 3D labels, billboards, sprites, hotspots, leader lines, rulers, bounding boxes, outlines, minimap, telemetry panels, HTML/CSS overlay bridge. | controls/overlay helpers, gallery shell. | Product/CAD/robotics/smart-city/digital-twin use shared overlays. |
| C10 | Geometry/procedural helpers | Terrain, roads, buildings, pipes/rails/cables, scatter/vegetation, instanced prop scatter, curve/tube/path, LOD, impostors, batching/instancing authoring. | future geometry/procedural packages, route helpers. | Large scenes generated through helpers, not hand-placed noise. |
| C11 | Advanced material library | Plastic, brushed metal, car paint, glass, frosted glass, water, emissive neon, hologram, rubber, fabric, concrete, asphalt, chrome, ceramic, translucent volume, debug modes. | material preset files, shader/PBR tests. | Material ball/gallery under studio/outdoor/night lighting. |
| C12 | WebGPU/compute boundary | WebGPU renderer path, compute particles, GPU water/FFT or unsupported, GPU instancing stress, storage/compute buffers, WebGL fallback, CPU-vs-GPU telemetry. | `packages/rendering/src/webgpu/*`, effects/water files. | Runtime telemetry proves GPU mode before parity claims. |
| C12a | Particle diagnostics and CPU/GPU boundary | Layered particle budgets, batch diagnostics, static/dynamic byte estimates, GPU backend support state, and non-compute warnings. | `packages/rendering/src/effects/ParticleDiagnostics.ts`, `tests/unit/rendering/particle-diagnostics.test.ts`, Data Galaxy budget consumption. | Package tests pass and Data reports CPU/static/`0` GPU dispatches from package-backed diagnostics; native GPU particle parity remains unclaimed. |
| C13 | Volumetric/atmosphere stack | Linear fog, exponential fog, height fog, local fog volume, dust, light shafts, god rays, clouds, sky/atmosphere, weather presets. | environment/fog/atmosphere/effects files. | Fog/weather screenshots show depth without card/crop artifacts. |
| C14 | Physics beyond rigid bodies | Constraints, joints, hinge/slider, ragdoll/articulated demo, vehicle/controller, character controller, raycast vehicle/wheel approximation, triggers, physics picking/dragging, collision layers, debug draw. | `packages/physics/*`, route bridges. | Physics playground proves real interaction and disclosed limits. |
| C15 | Documentation/examples surface | Minimal example per environment preset, starter per advanced demo, copy-paste helper snippets, asset requirements, unsupported notes, searchable gallery, screenshot gallery, stable API names. | `README.md`, docs, examples, gallery docs. | Developer can reproduce systems without reading advanced internals. |

Top implementation priority:

1. Renderer visual pipeline.
2. Lighting/shadow system.
3. Asset/texture loader parity.
4. Controls/picking layer.
5. Postprocessing composer.
6. Environment preset API.
7. Reflection/refraction helpers.
8. Material preset library.
9. Procedural scene helpers.
10. Docs/examples layer.

## 16. Environment Capability Matrix

Do not imply Three.js-class environment parity unless a reusable renderer/runtime subsystem exists and is covered by tests/screenshots.

| Capability | Current / Required Status | Required Before Accepted Claim |
| --- | --- | --- |
| Cubemap renderer | Renderer path and focused proof exist. | Keep bounded to static cubemap background until dynamic cube camera/probes exist. |
| Equirectangular projection | Renderer path and focused proof exist. | Keep bounded to panorama background until physical sky/reflection probes exist. |
| PMREM roughness IBL | Binding exists; visual parity still bounded. | Add roughness-specific material-response pixel proof before Three.js PMREM parity claim. |
| RGBE `.hdr` parser | Public V6 Radiance/RGBE path exists. | Keep EXR/broad HDR claims out unless implemented. |
| EXR parser | Missing/diagnostic-only. | Implement real EXR decode or document unsupported. |
| Atmospheric scattering shader | Missing. | Implement Rayleigh/Mie-style sky shader or keep unsupported. |
| Analytical studio box | Not production-grade. | Promote product studio to reusable cove/softbox helper with tests. |
| Linear/exponential fog | Renderer path exists. | Keep volumetric/god-ray/weather claims out until implemented. |
| Cube camera/live reflections | Missing. | Implement six-direction scene capture and reflective material binding. |
| Dynamic ocean plane | Helper approximation. | Promote water/ocean subsystem and add reflection/refraction/normal/foam or keep CPU/Gerstner scope. |
| Procedural sky dome | Missing. | Add reusable infinite sky dome with sun/moon/horizon controls. |
| Volumetric weather enclosure | Missing/diagnostic only. | Implement real weather/volumetric system or keep proxy limits explicit. |
| Infinite ground grid | Not production-grade. | Add reusable grid/catch-plane helper with scale/fade/shadow controls. |
| Indoor studio stage | Not production-grade. | Create reusable indoor studio preset with softboxes/cove/floor/shadow/reflection behavior. |
| Outdoor nature backdrop | Missing as preset. | Add outdoor preset with sky, terrain/backdrop palette, natural lighting. |
| Urban city shell | Missing as preset. | Add urban/neon shell separate from Smart City content. |
| Industrial warehouse void | Missing as preset. | Add warehouse lighting/backdrop shell with windows, concrete/floor response, overhead bulbs. |
| Deep space box | Background proof only. | Add cube/sphere deep-space environment or keep non-claiming. |
| Clean void backdrop | Not production-grade. | Add clean void/infinity wall preset with floor/cove/lighting options. |

## 17. Phase P8 - Repository Naming And Product Taxonomy Migration

The codebase contains many version-turn names such as `v1`, `v2`, `v3`, `v4`, `v5`, `v6`, `v7`, `v8`, `v9`, and `v10`. Those names are historical breadcrumbs, not product taxonomy.

This migration is required, but it must not be a blind rename. Many versioned paths are load-bearing: package export maps, TypeScript imports, app route URLs, fixture fetch URLs, Playwright report paths, screenshot hashes, generated JSON reports, docs links, and historical report readers.

Required phases:

1. Inventory all version-style names in:
   - `apps/**`
   - `packages/**`
   - `tests/**`
   - `fixtures/**`
   - `docs/**`
   - `tools/**`
   - `tests/reports/**`
   - root/package export maps
   - route registries
   - README and docs links
2. Classify every hit:
   - public API or package export
   - browser route or example URL
   - fixture/data path
   - generated report/screenshot artifact
   - internal source module
   - test-only harness
   - historical archive that should remain versioned but be marked archival
3. Define contextual target names before renaming:
   - `v9-advanced-examples-gallery` -> `advanced-examples-gallery` or `cinematic-examples-gallery`
   - `v6/environment` -> `hdr-environment` or `environment-lighting`
   - `v8-animation-*` -> capability-based animation names
   - `v10/superiority-audit` -> `claim-defense-audit` or `release-claim-audit`
4. Add compatibility shims where old paths may still be referenced:
   - route redirects or index aliases
   - package export aliases with deprecation comments
   - fixture path aliases or manifest redirects
   - report-reader compatibility for historical artifacts
5. Rename in small batches with focused verification.
6. Update docs, README, route registry, package scripts, tests, report tools, screenshots, and generated JSON references in the same batch.
7. Run after each batch:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
```

plus affected unit tests, affected browser route tests, and the renamed successor to the advanced gallery review/audit commands.

Naming acceptance checklist:

- [ ] A checked-in migration report lists every old version-style path and target contextual name or archival reason.
- [ ] All active imports, route links, package exports, scripts, fixture URLs, and report readers use contextual names.
- [ ] Old public URLs or package exports still work through aliases/redirects or are intentionally documented as removed.
- [ ] Generated evidence paths do not break visual-review/report-audit tooling.
- [ ] Alias tests cover browser routes, package exports, fixture URLs, and historical report readers before old names are removed.
- [ ] `rg "v[0-9]"` only finds classified active aliases or archival records.

Completed naming/taxonomy subtasks:

- [x] `docs/project/naming-taxonomy-migration-inventory.md`: created the checked-in migration inventory starter with scan commands, first-pass counts by root, classification rules, proposed target taxonomy, compatibility requirements, and a no-rename decision while Product/Data remain failed.
- [x] Initial inventory command found `1978` version-style file paths under scoped roots on 2026-05-20; broad renaming remains blocked until every touched path is classified and aliases/tests exist.

## 18. Phase P9 - Cinematic / Animation-Studio Tier

The current advanced gallery target is Three.js-class web 3D parity. A higher tier is required before G3D can credibly claim movie-like, animation-studio-grade, AI-directed graphics.

Do not claim Pixar, feature-film, RenderMan, or offline-renderer parity unless the engine has explicit evidence for the relevant capability. The near-term acceptable claim is cinematic real-time/previsualization quality: AI-directed scenes with premium lighting, materials, camera language, animation, layout, and compositing that can be generated, inspected, revised, and rendered interactively in G3D.

Required cinematic platform lanes:

| Lane | Owns | Required Evidence |
| --- | --- | --- |
| Color pipeline and tone mapping | Linear workflow, sRGB correctness, HDR render targets, exposure, filmic tone mapping, display transforms, screenshot consistency. | Same scene produces stable, non-washed-out screenshots across browser capture, gallery capture, and runtime viewer. |
| Cinematic lighting toolkit | Key/fill/rim lights, area lights, softboxes, gobos/cookies, IES profiles, practical lights, contact shadows, cascaded shadows, light-linking or documented limit. | Portrait/product/interior shots show controlled cinematic lighting. |
| Look-development material system | Skin, cloth, hair/fur, eyes, glass, metal, plastic, ceramic, concrete, asphalt, water, smoke, hologram, emissive neon, car paint. | Material ball and production-shot galleries prove each material under studio, outdoor, and night lighting. |
| Material graph and interchange | Node material authoring, reusable material graphs, MaterialX/USDShade import or unsupported status, texture transform, layered materials. | Material graphs survive round-trip into G3D without becoming flat/default materials. |
| Character system | Rig import, skeletal animation, blend shapes, facial controls, state machines, retargeting, root motion, events, clip blending. | Character route proves facial expression, body motion, clip blending, and timeline scrubbing. |
| Hair/fur/cloth/soft-body | Groom cards/strands, fur fallback, cloth constraints, fabric/wind, collision awareness, simulation cache or unsupported status. | Character/creature shot shows secondary motion with limits labeled. |
| Particle and effects | Sparks, embers, dust, smoke, rain, snow, magic trails, energy arcs, debris, volumetric-looking particles, collisions, GPU/CPU telemetry. | FX route shows layered effects that interact with lighting/camera. |
| Volumetric atmosphere | Height fog, local fog volumes, god rays, shafts, mist, smoke, clouds, weather presets, density controls. | Fog/weather shots show depth and lighting hierarchy without card/crop artifacts. |
| Cinematic camera system | Shot registry, lenses, focal length/FOV presets, DOF, focus pulls, dolly/track/orbit/crane, handheld, motion blur status. | Every cinematic route has named shots and replayable camera moves. |
| Layout and set dressing | Blocking, scatter, terrain/stage shells, foreground/midground/background, scale references, focal helpers, safe-frame overlays. | Routes read as staged compositions, not object dumps. |
| Timeline and sequencing | Keyframe timeline, shot tracks, camera tracks, animation tracks, event tracks, audio markers, loop/segment playback, metadata export. | Multi-shot sequence can play, pause, scrub, and regenerate from metadata. |
| Postproduction stack | Bloom, AO, DOF, motion blur, LUTs, vignette, film grain, chromatic aberration controls, outline/selective masks, pass telemetry. | Postprocess improves strong base scenes and does not hide missing work. |
| Render layers/AOV-like passes | Beauty/depth/normal/ID/emissive/mask passes, object/material IDs, alpha, multilayer capture. | Review report stores pass captures and proves object/material inspection. |
| Shadows/GI approximation | Contact shadows, soft shadows, screen-space/baked GI approximation, AO, reflection probes, irradiance probes, lightmap status. | Interior/character shots show grounding and bounce-light approximation. |
| Production asset pipeline | OpenUSD/USDZ strategy, glTF extension coverage, texture compression, HDR/EXR, Alembic/cache status. | Production-style scene imports hierarchy, materials, animation, cameras, lights, and metadata. |
| AI prompt-to-scene compiler | Prompt planning, shot breakdown, asset search/generation hooks, scene graph construction, material assignment, camera/lighting choice, revision loop, deterministic seed. | Same prompt regenerates same scene and revisions target specific nodes. |
| AI art-direction controls | Style bible, palette, lighting references, lens language, composition constraints, character/action constraints, negative constraints, quality gates. | Generated routes explain art-direction metadata and revisions. |
| Asset library/tagging | Props, environments, characters, materials, rigs, FX, HDRIs, cameras, lighting rigs, metadata tags, licensing/provenance. | Prompted scenes reuse approved assets instead of unsupported invented assets. |
| Collaboration model | Non-destructive layers, overrides, variants, shot versions, review notes, approvals, locked assets, diffable scenes. | Reviewers compare versions and promote shots without rewriting the base scene. |
| Video/sequence export | Frame stepping, deterministic capture, alpha/depth/mask export, MP4/WebM, image sequence, contact sheet. | Gallery exports accepted multi-shot sequence, not only stills. |
| Performance/LOD | LODs, impostors, texture streaming, budgets, frame telemetry, progressive loading, memory reporting. | Cinematic routes remain interactive with honest tradeoff reporting. |

Cinematic acceptance rule:

- A route may be called cinematic only when it proves art direction, lighting, material response, animation, camera language, effects, and postproduction together.
- Complex geometry with flat lighting is not cinematic.
- Bloom over weak materials is not cinematic.
- A good still frame without timeline, animation, or camera language is not animation-studio-grade.

AI-directed cinematic acceptance rule:

- Prompt output includes scene graph metadata.
- Prompt output includes asset provenance or generated-asset status.
- Prompt output includes material assignments.
- Prompt output includes lighting plan.
- Prompt output includes camera/shot plan.
- Prompt output includes animation/timeline plan.
- Prompt output includes unsupported-feature disclosure.
- Prompt output includes deterministic seed or reproducible generation metadata.
- Prompt output includes screenshots or video evidence.
- Prompt output includes review notes and acceptance state.

## 19. Parallel Execution Lanes

Parallel work is allowed only with disjoint write sets. Workers must not edit outside their lane. If a fix crosses lanes, stop and document the dependency.

### Lane 1: Renderer Visual Foundation

Owns:

- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/RendererVisualPipelineReport.ts`
- tone/color/HDR files
- presentation-state tests

Must deliver:

- Color/HDR/tone/DPR/capture consistency.
- Visual clarity diagnostics.
- Focused renderer tests.

### Lane 2: Asset And Material Activation

Owns:

- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/GLTFExtensionSupport.ts`
- `packages/assets/src/AssetInspection.ts`
- decoder/transcoder files
- PBR material/shader files where coordinated with Lane 1

Must deliver:

- GLTF extension truth.
- Material/texture diagnostics.
- Product same-asset reference harness.
- PBR fallback corrections with tests.

### Lane 3: Environment, Lighting, Reflection

Owns:

- `packages/rendering/src/EnvironmentPlatform.ts`
- `EnvironmentBackgroundPass.ts`
- `EnvironmentBackgroundResources.ts`
- HDR/RGBE/PMREM files
- lighting rig/default/shadow/contact files
- reflection/refraction helper files

Must deliver:

- Reusable product studio preset.
- Environment preset API foundation.
- Bounded cubemap/equirect/HDR/PMREM/fog evidence.
- Explicit reflection/refraction unsupported boundaries.

### Lane 4: Controls, Scene Metadata, Animation, Physics

Owns:

- `packages/input`
- `packages/controls`
- future `packages/scene`
- `packages/animation`
- `packages/physics`
- route adapters for picking/labels/metadata/timeline/simulation

Must deliver:

- Shared controls/picking/annotations.
- Scene metadata contract.
- Animation/timeline diagnostics.
- Physics/debug/reset evidence.

### Lane 5: Gallery Route Recovery

Owns:

- Product route files listed in P5A.
- Data route files listed in P5B.
- Reactor route files listed in P5C.
- Remaining route files listed in Phase P6.

Must deliver:

- Route composition after platform blockers are fixed or explicitly unsupported.
- No random replacements.
- No hidden exclusions without reports.
- Current screenshots only after source-owned fixes and focused tests.

### Lane 6: Reporting, Naming, Docs, Evidence

Owns:

- `tools/v9-advanced-gallery-visual-review/index.ts`
- `tools/v9-advanced-gallery-report-audit/index.ts`
- browser capture specs
- report schemas
- naming migration scripts/reports
- README/docs/examples

Must deliver:

- False-acceptance blockers.
- Partial-report detection.
- Naming migration inventory and aliases.
- Minimal reproducible examples and docs.

## 20. Verification Commands

Use the smallest command that proves the changed source owner. Do not jump to full screenshots first.

Baseline typecheck:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
```

Renderer/material focused tests:

```bash
pnpm exec vitest run tests/unit/rendering/shader-library.test.ts tests/unit/rendering/pbr-reference.test.ts --reporter=dot
```

Asset/GLTF focused tests:

```bash
pnpm exec vitest run --config tests/assets/vitest.config.ts tests/assets/gltf-inspection.test.ts --reporter=dot
pnpm exec vitest run tests/assets/gltf-extension-support.test.ts --reporter=dot
```

Environment focused tests:

```bash
pnpm exec vitest run tests/unit/rendering/environment-platform.test.ts --reporter=dot
```

Product/Data focused route capture, only after source-owner tests pass:

```bash
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "(product-configurator|data-galaxy) renders as a complex animated G3D demo" --reporter=line --timeout=360000
```

Full gallery sweep, only after focused gates pass:

```bash
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm v9:advanced-gallery
pnpm v9:advanced-gallery:review
```

Report audit:

```bash
pnpm v9:advanced-gallery:review
node tools/v9-advanced-gallery-report-audit/index.ts
```

Preferred report audit and pipeline commands when scripts exist:

```bash
pnpm v9:advanced-gallery:audit
pnpm v9:advanced-gallery:pipeline
```

Renderer-focused gates after renderer edits:

```bash
pnpm exec vitest run tests/unit/rendering/renderer.test.ts tests/unit/rendering/render-state-leaks.test.ts tests/unit/rendering/renderer-postprocess-plan.test.ts
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/rendering-root-quality-gate.spec.ts --reporter=line
```

Asset-focused gates after loader/material edits:

```bash
pnpm exec vitest run --config tests/assets/vitest.config.ts tests/assets/gltf-extension-support.test.ts tests/assets/gltf-compression-decoders.test.ts tests/assets/gltf-inspection.test.ts
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/asset-texture-browser.spec.ts tests/browser/asset-material-fidelity.spec.ts --reporter=line
```

Final release-candidate gates, only when every route has accepted evidence:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm v9:advanced-gallery
pnpm v9:advanced-gallery:review
pnpm v9:advanced-gallery:audit
pnpm v10
```

Current state inspection:

```bash
node -e 'const r=require("./tests/reports/v9/advanced-examples-gallery/visual-review-report.json"); const s=r.summary; console.log(JSON.stringify({pass:r.pass,releaseGate:r.releaseGate,summary:{demoCount:s.demoCount,acceptedCount:s.acceptedCount,candidateCount:s.candidateCount,failedCount:s.failedCount,blockedCount:s.blockedCount,contactSheetExists:s.contactSheetExists,imageQualityPassingCount:s.imageQualityPassingCount,knownVisualArtifactRiskCount:s.knownVisualArtifactRiskCount}},null,2))'
```

Expected until final acceptance:

```json
{
  "pass": false,
  "releaseGate": "blocked",
  "summary": {
    "demoCount": 10,
    "acceptedCount": 0,
    "blockedCount": 10
  }
}
```

Final success requires:

```text
Release gate: accepted (10/10 accepted)
```

## 21. Screenshot Policy

Screenshots may be generated only after the task has a named source owner and focused tests have passed.

Before capture, write down:

- the source owner file
- the expected visual delta
- the focused tests that passed
- the exact screenshot question being answered
- the previous defect mapped to source owner

After capture, open and inspect:

- full-page PNG
- hero PNG
- viewport PNG
- background-on/off PNG if environment changed
- runtime JSON
- contact sheet only after full sweep

Do not run another screenshot if the result is still bad. Return to source inspection.

## 22. Acceptance Definition

A route is accepted only when all gates pass:

- It loads without page errors or unhandled console errors.
- It uses real G3D APIs, reusable helper layers, or explicitly documented approximations.
- It has current full-page, hero, viewport-only, and contact-sheet screenshot evidence.
- It has current runtime JSON with load timing, render size, draw/object counts, motion samples, and post-load performance stats.
- It animates visibly after assets load.
- It has at least three meaningful interactions that visibly change the scene.
- It has at least five meaningful visible systems in the accepted screenshot.
- It has foreground, midground, background, focal point, lighting hierarchy, material contrast, readable silhouettes, and visible depth/scale.
- It avoids debug-only composition, placeholder geometry, noisy output, stretched canvas, low backing resolution, crop artifacts, and obvious material failures.
- It has accepted metadata with screenshot path, lowercase SHA-256, reviewer, ISO timestamp, detailed notes, and named Three.js-style comparison basis.
- `pnpm v9:advanced-gallery:review` accepts the route.

Acceptance states:

- `failed`: technical or visual blockers remain.
- `candidate`: route works and has useful evidence, but is not Three.js-quality.
- `accepted`: route passes automated gates, screenshot hash verification, and human visual review.
- `hero`: accepted and strong enough to lead the gallery.

Do not skip from failed to accepted. A failed route must first become a candidate with clear evidence, then accepted after visual review.

## 23. Final Completion Output Requirements

Do not provide a completion answer until the objective is actually complete. Final output must include:

1. Files created or modified.
2. How to run the gallery.
3. How to run each demo.
4. What works.
5. What is approximated.
6. What G3D currently cannot support.
7. Comparison table against Three.js-style references.
8. Performance observations.
9. Screenshot/report paths.
10. Final gate output.

The final gallery succeeds only when current code, current screenshots, current runtime reports, current documentation, and current visual review all prove the accepted claim.
