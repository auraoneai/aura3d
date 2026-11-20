# createFlipbookAtlas and createGradingLut: procedural VFX sheets and grading LUTs

`import { createFlipbookAtlas, createGradingLut } from "@aura3d/engine/game"`

Flipbook VFX and a colour grade with no image assets (5.7.0, extracted from the 30 live games' shared VFX pack). Both build RGBA8 `texture.data` arrays in plain TypeScript, so they behave the same headless, in a worker, on WebGPU and on WebGL2, and the same arguments always give the same bytes.

```ts
import { effects } from "@aura3d/engine";
import { createFlipbookAtlas, createGradingLut } from "@aura3d/engine/game";

const sparks = createFlipbookAtlas("sparks", [255, 206, 112]);
builder.add(effects.flipbook({
  name: "scrape-sparks",
  texture: sparks.texture, // a live texture handle; effects.flipbook accepts it as-is since 5.7.0
  spriteColumns: sparks.columns,
  spriteRows: sparks.rows,
  frameRate: 30, size: 1.2, blend: "additive", loop: true
}).runtime({ id: "scrape-sparks" }));

const lut = createGradingLut("cinema-warm"); // 256 x 16 strip, size 16
const output = { toneMapping: "agx", ...({ lut: { ...lut, intensity: 0.28 } } as Record<string, unknown>) };
```

- **Flipbook kinds.** `sparks` (radial rays), `muzzle` (6 rays), `dust` (soft puff), `ink` (lobed splat), `plasma` (swirl) and `ripple` (expanding ring). Each sheet is 8 x 4 cells of 48 px (384 x 192, `frameCount` 32), sRGB, played left to right then top to bottom; alpha fades over the sequence.
- **Tint.** `tint` is sRGB 0..255 (default `[255, 210, 120]`); the core of each frame blends toward white.
- **Grading LUTs.** `cinema-warm`, `broadcast-crisp` and `cyber-neon` are S-curves with a warm, saturated or neon cast. The strip is `size * size` x `size` (default 16, so 256 x 16), linear, ready for `output.lut`.
- **Live handle, no load.** `texture` is a `texture.data` handle: the particle pass samples it directly (straight alpha, no fetch) and batches by handle, so build each sheet once and reuse it. Before 5.7.0 the `texture` type rejected the handle (TS2322) and the `as never` workaround drew the built-in fireball sheet instead; drop the cast.
- **Prove it.** Hash the sheet bytes in a unit test (they are deterministic) and judge the look on a real GPU capture, not the counters.
