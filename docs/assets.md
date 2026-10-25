# Asset Workflow

Typed GLB/glTF asset workflow for Aura3D coding agents.

Read `llms.txt` and `docs/agents/claims-and-boundaries.md` before writing route code or asset claims. Asset safety is a release blocker, not a style preference.

## Resolve-first rule

If a prompt names a real object, do not invent a GLB URL. Let `assets resolve` decide: it uses an asset already in the project, then an open, licence-clear source, then Meshy (with `--allow meshy` and a budget), and otherwise prints a primitives recipe for simple props. There is no hosted catalog.

```bash
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet --dry-run
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

For game fighters or acted humanoid characters, use the `fighting-character` profile so admitted GLBs carry valid skeletal rigs (`skins > 0`) and usable animation clips:

```bash
npx @aura3d/cli@latest assets search "animated humanoid fighting character" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "animated humanoid fighting character" --name fighter --profile fighting-character
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset fighter --no-placeholders --require-license
```

## Local file path & provenance

If the user provides an approved GLB/glTF file, admit it directly through the CLI:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest assets validate
```

Every admitted asset in `aura.assets.json` and `src/aura-assets.ts` must carry a canonical 64-character `sha256-...` `hash` and `public/aura-assets/...` path so `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"` preserves PBR lighting, palette, contrast, and reflection in the production glTF bridge.

## Prop normalization, skeletal locomotion, and boot-gate rules

- **Prop normalization (`targetMaxDimension` vs `targetHeight`)**: Use `targetHeight` only for upright humanoids and vertical characters. Use `targetMaxDimension` for horizontal vehicles, rackets, paddles, weapons, barriers, and wide props so aspect ratios and silhouettes never stretch vertically.
- **Skeletal locomotion (`skins > 0`)**: Humanoid and creature characters must be rigged GLBs (`skins > 0`) driven via `handle.setAnimation({ clip, loop: true, speed })` (or `AnimationController`) synchronized to locomotion (`idle`, `walk`, `run`, `attack`, `swing`) so limbs articulate under the key light and shadow rather than sliding rigid statues across the floor.
- **Meshy GLB decimation & compression (`<= 20,000` vertices, `<= 2 MB`, 16-bit indices)**: Simplify every generated Meshy GLB (`MeshoptSimplifier` to `<= 20,000` vertices for props/vehicles, 16-bit `Uint16Array` indices, `byteStride === 0`) and compress textures to `<= 1024x1024` (`~0.5–2.0 MB` per GLB) before admission.
- **Boot sequence gate (`await app.ready()`) & default manual control (`autopilot = false`)**: Always `await app.ready()` before dismissing `#boot-gate` and starting the simulation loop so all GLB assets are decoded and mounted on Frame 1. Default `autopilot` to `false` (manual control on Frame 1) unless `?autoplay=1` or `?demo=1` is present in the URL or the user clicks the HUD `Auto` toggle button (`button.blur()`).
