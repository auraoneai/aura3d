# Q-02-3: HdrEquirect.ts relied on Node `Buffer` (packed consumers break)

**To:** lane 02 (`packages/rendering/src/environment/HdrEquirect.ts` owner)
**From:** lane 15 (Phase 8 packed-consumer gate)
**Status:** FIXED ON qr/prd15-40-removal (courtesy notice; revert-free)

## What
`HdrEquirect.ts` used Node-only `Buffer` throughout:
`HDR_MAGIC = Buffer.from("#?")` at module top level (a hard crash on import in
any real browser consumer), `buf: Uint8Array | Buffer` in the exported
`decodeHdrEquirect` signature (leaks `Buffer` into the shipped `.d.ts` — every
packed template without `@types/node` fails `tsc --noEmit`), and Buffer-only
methods (`.equals`, `.toString("latin1")`, `.alloc`) inside the decoder.

## Why lane 15 touched a lane-02 file
`pnpm pack:check` (T8.2 gate) fails every template that transitively reaches
`rendering/environment` — the packed `.d.ts` referenced `Buffer`, which does
not exist in browser tsconfigs. The same code would crash at runtime in a
bundled browser consumer on first import.

## What changed (behavior-identical)
- `decodeHdrEquirect(buf: Uint8Array)` — `Buffer` still satisfies calls (it is
  a `Uint8Array` subclass), so Node callers (`aura3d-cli environments bake`,
  `EnvironmentCache`, `lanes/prd02`) compile unchanged.
- `Buffer.from(...)` / `Buffer.alloc(...)` → `new Uint8Array(...)`,
  `.subarray(0,2).equals(HDR_MAGIC)` → byte compare, `.toString("latin1")` →
  per-byte `String.fromCharCode` (header lines are short), `.indexOf` unchanged
  (`Uint8Array.prototype.indexOf` has the same signature).
- `writeRgbe`'s `src: Buffer` → `src: Uint8Array`.

No logic, rounding, or error strings changed.
