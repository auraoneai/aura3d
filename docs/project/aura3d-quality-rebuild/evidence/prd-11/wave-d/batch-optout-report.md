## prd11-batch-optout report (PRD-11 §12.3, report mode)

Scanned 1069 files under `apps/`: 30 mutation sites in 11 files.
Each row is a node that mutates its material at runtime; review and add `batch: false` where the mutation is not colour-only.

| App | Sites |
|---|---|
| showcase-bank-shot | 1 |
| showcase-blockfall-reactor | 4 |
| showcase-courier-rush | 1 |
| showcase-patrol-wing | 1 |
| showcase-pulse-tunnel | 5 |
| showcase-rooftop-buckets | 10 |
| showcase-vault-breakers | 8 |

| File:line | Kind | Node | Construct |
|---|---|---|---|
| `apps/showcase-bank-shot/src/legacy/main.ts:430` | setMaterial | `cueGhostHandle` | `cueGhostHandle?.setMaterial(GHOST_MATERIAL);` |
| `apps/showcase-blockfall-reactor/src/legacy/main.ts:1494` | setMaterial | `activePoolHandle` | `activePoolHandle.setMaterial(pieceMaterials[activeKind]);` |
| `apps/showcase-blockfall-reactor/src/legacy/main.ts:1684` | setMaterial | — | `.setMaterial(lastClearSize >= 4 ? quadDischargeMaterial : clearChargeMaterial)` |
| `apps/showcase-blockfall-reactor/src/legacy/main.ts:1695` | setMaterial | — | `.setMaterial(quadDischargeMaterial)` |
| `apps/showcase-blockfall-reactor/src/legacy/main.ts:1742` | setMaterial | — | `.setMaterial(clearChargeMaterial)` |
| `apps/showcase-courier-rush/src/v2/scene/fx.ts:31` | setMaterial | `h` | `h.setMaterial(mat).setPosition(x, y, z).setScale([radius, radius, radius]).setVisible(true);` |
| `apps/showcase-patrol-wing/src/legacy/main.ts:711` | setMaterial | `handle` | `handle.setMaterial(` |
| `apps/showcase-pulse-tunnel/src/legacy/main.ts:1682` | setMaterial | — | `if (visualReviewCapture) (shipGlow as PulseNodeHandle).setMaterial(reviewRunnerGlowMaterial);` |
| `apps/showcase-pulse-tunnel/src/legacy/main.ts:2453` | setMaterial | `parts.top` | `parts.top.setMaterial(spec);` |
| `apps/showcase-pulse-tunnel/src/legacy/main.ts:2454` | setMaterial | `parts.bottom` | `parts.bottom.setMaterial(spec);` |
| `apps/showcase-pulse-tunnel/src/legacy/main.ts:2455` | setMaterial | `parts.core` | `parts.core.setMaterial(spec);` |
| `apps/showcase-pulse-tunnel/src/v2/gate-visuals.ts:40` | setMaterial | `handle(world.gateNodeNames[slot]!)` | `handle(world.gateNodeNames[slot]!)?.setMaterial(mat).setVisible(true);` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1177` | setMaterial | `ballNode` | `ballNode?.setMaterial(ballState.isGold ? goldMaterial : orangeMaterial);` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1216` | setMaterial | `rimNode` | `rimNode?.setMaterial(rimMaterial);` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1227` | setMaterial | — | `.setMaterial(rimGlowMaterial)` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1232` | setMaterial | `backboardNode` | `backboardNode?.setMaterial(backboardMaterial);` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1367` | setMaterial | `outcomeHalo` | `outcomeHalo?.setMaterial(scoreState.state === "victory" ? victoryHaloMaterial : failureHaloMaterial);` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1382` | setMaterial | — | `.setMaterial(contactMaterial)` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1399` | setMaterial | — | `.setMaterial(contactFxKind === "swish" ? contactMakeMaterial : netMaterial);` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1416` | setMaterial | — | `.setMaterial(contactMaterial);` |
| `apps/showcase-rooftop-buckets/src/legacy/main.ts:1508` | setMaterial | `point` | `point?.setMaterial(ballState.inFlight ? flightMaterial : aimMaterial);` |
| `apps/showcase-rooftop-buckets/src/v2/scene/fx.ts:32` | setMaterial | `burstNode()` | `burstNode()?.setMaterial(mat)` |
| `apps/showcase-vault-breakers/src/legacy/main.ts:192` | setMaterial | `impactHandle` | `impactHandle?.setMaterial(materialForImpact)` |
| `apps/showcase-vault-breakers/src/legacy/main.ts:435` | setMaterial | `runtimeHandle` | `if (name.startsWith("ball-")) runtimeHandle.setMaterial(liveBallMaterial);` |
| `apps/showcase-vault-breakers/src/legacy/main.ts:444` | setMaterial | `runtimeHandle` | `runtimeHandle.setMaterial(liveTargetArmedMaterial);` |
| `apps/showcase-vault-breakers/src/legacy/main.ts:571` | setMaterial | `handle` | `handle.setMaterial(liveTargetArmedMaterial);` |
| `apps/showcase-vault-breakers/src/legacy/main.ts:607` | setMaterial | `handle` | `handle.setMaterial(liveTargetHitMaterial);` |
| `apps/showcase-vault-breakers/src/legacy/main.ts:681` | setMaterial | `handle` | `handle.setMaterial(index < banksDown ? bankLampOnMaterial : bankLampOffMaterial);` |
| `apps/showcase-vault-breakers/src/v2/boot.ts:253` | setMaterial | `h` | `h.setMaterial(on` |
| `apps/showcase-vault-breakers/src/v2/scene/fx.ts:46` | setMaterial | `ring()` | `ring()?.setMaterial(IMPACT_MATERIAL[kind])` |
