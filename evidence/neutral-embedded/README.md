# Embedded neutral environment: size and frame tolerance

The `neutral` environment is embedded in `@aura3d/rendering` (no `/aura-environments` fetch). The first version embedded the baked cube losslessly (703 KB of source, 498 KB gzip). This version keeps 5 significant mantissa bits on mip 0 and 4 on the blurred mips (`tools/environments/embed-neutral.mjs`), which is about the level of the bake's own Monte-Carlo noise (1.7% mean relative difference between neighbouring texels in mip 0, measured on the baked file).

| | before | after |
|---|---|---|
| `neutralEmbedded.ts` source | 703,210 B | 141,663 B |
| gzip of the cube | 498 KB | 100 KB |
| stock cube app (hello-world), JS+CSS raw / gzip | 3,914 kB / n/a | 3,395 kB / 1,062 kB |
| 4.1.3 for reference | 3,258 kB / 963 kB | |

The chunk is lazy but not optional: every app that uses the default neutral environment fetches it once at start (about 100 KB over the wire with gzip), in parallel with the first frame. Apps that author an explicit environment (`studio`, an HDRI) do not load it.

## Tolerance

- Per texel (unit test `tests/unit/environment-embedded`): error in every channel at most half a quantization step against the smallest normalised max-channel mantissa: 3.5% of the texel's peak on mip 0, 6.6% on the other mips; mean error under 1.5%. Near-black texels keep the same number of significant bits.
- Frames (`frame-diff.json`, software GL, 480x270, same build otherwise): Silt & Signal rings differ by 0.074/255 mean absolute, 0.04% of pixels by more than 8 levels, max 50, mean luma 76.441 to 76.442. Two runs of the unchanged build are pixel-identical on that scene. Ninja Runner differs by 0.229/255 against the reference and by 0.226/255 between two runs of the unchanged build: the difference is animation timing of the small character, not the environment.
- Not measured: real-GPU frames, and glossy metals under the brightest light patch (mip 0 peak value 100) at close range; the largest per-texel error there is the 3.5% bound.

`frames/` holds the reference, new and 8x difference images.
