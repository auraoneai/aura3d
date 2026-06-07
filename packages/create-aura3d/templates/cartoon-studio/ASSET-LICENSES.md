# Cartoon Studio — Asset Licenses & Provenance

> **Honesty note:** the bundled character/set/prop assets are **development placeholders**
> reused to prove the pipeline end-to-end. They are **not** bespoke, on-model "Miko"/"Luma"
> cartoon characters or an authored moon-garden set. Before any production or commercial
> release, replace them with licensed, art-directed assets and re-verify provenance.

## Bundled assets (`public/aura-assets/`)

| Asset | File | What it actually is | License / provenance | Status |
|---|---|---|---|---|
| `miko` | `miko.047f5e5f.glb` | three.js **RobotExpressive** model (14 clips; morphs `Angry/Surprised/Sad`, which are degenerate for lip-sync — the route uses a primitive mouth-card) | RobotExpressive by Tomás Laulhé, **CC0**, modified by Don McCurdy (three.js examples) | Placeholder — generic robot, not an authored "Miko" |
| `luma` | `luma.humanoid-fixture.glb` | three.js **Soldier** mesh = Adobe **Mixamo "Vanguard"** rig (clips `Idle/Run/TPose/Walk`; no blendshapes → route uses a primitive mouth-card fallback) | Mixamo/Adobe terms (account-bound) **— must be re-licensed/verified before production** | Placeholder — an armored soldier, NOT a garden robot |
| `moonGarden` | `moonGarden.gltf` | 3-quad anchor stub (floor / glow-stone / skyline markers) — not real garden geometry | Aura3D starter stub, **MIT** | Placeholder — the live-3D route builds a primitive garden instead |

## Catalog / starter pack
The `@aura3d/asset-index` cartoon starter pack maps to **Kenney CC0** game-kit GLBs
(`cdn.jsdelivr.net/gh/gchahal1982/aura3d-cc0-assets`). These are generic blocks (e.g.
"moon-garden" → a grass cube), suitable as license-clean filler, not art-directed cartoon assets.

## Live-3D render path (`episode:render-3d`)
The experimental real-3D path renders the two GLBs above with engine-built **primitive**
garden geometry (moon orb, glow stones, lilies, broom) — all procedural primitives/emissive
materials, no third-party art.

## What "production-licensed" requires
1. Author/commission rigged **Miko** + **Luma** (matched cartoon style, face blendshapes for real lip-sync) with a clear license (CC0/owned).
2. Author a real **moon-garden set** + props (broom, glow-stones, lilies) or source license-clean equivalents.
3. Record/synthesize **dialogue audio** (none ships; AuraVoice is timing metadata only).
4. Re-run `assets validate-cartoon --require-license --no-placeholders` against the new assets and update this file.
