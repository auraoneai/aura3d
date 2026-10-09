/**
 * assets-bc-selection.ts — KTX2 target-format selection under a mocked
 * capability set (05-BROWSERS: "format selection with BC formats via
 * capability mock"). No GL context required — `selectKTX2TargetFormat`
 * is a pure function, so this page runs on any runner (windows-latest
 * Chromium without a GPU included).
 *
 * `?caps=s3tc` (default), `?caps=astc`, `?caps=etc2`, `?caps=bptc`,
 * `?caps=none` selects the mocked capability set.
 */
import { selectKTX2TargetFormat } from "/packages/assets/src/KTX2TargetSelection.js";

const CAP_SETS: Record<string, { astc: boolean; bptc: boolean; etc2: boolean; s3tc: boolean; s3tcSrgb: boolean }> = {
  s3tc: { astc: false, bptc: false, etc2: false, s3tc: true, s3tcSrgb: true },
  s3tcNoSrgb: { astc: false, bptc: false, etc2: false, s3tc: true, s3tcSrgb: false },
  astc: { astc: true, bptc: false, etc2: true, s3tc: false, s3tcSrgb: false },
  etc2: { astc: false, bptc: false, etc2: true, s3tc: false, s3tcSrgb: false },
  bptc: { astc: false, bptc: true, etc2: true, s3tc: false, s3tcSrgb: false },
  none: { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false }
};

try {
  const params = new URLSearchParams(location.search);
  const capsName = params.get("caps") ?? "s3tc";
  const caps = CAP_SETS[capsName];
  if (!caps) throw new Error(`unknown caps mock ${capsName}`);
  const selections: { basis: string; srgb: boolean; alpha: boolean; target: string }[] = [];
  for (const basis of ["uastc", "etc1s"] as const) {
    for (const srgb of [true, false]) {
      for (const alpha of [true, false]) {
        selections.push({ basis, srgb, alpha, target: selectKTX2TargetFormat(caps, basis, alpha, srgb ? "srgb" : "linear") });
      }
    }
  }
  (window as any).__QR_READY__ = { capsName, caps, selections };
} catch (error) {
  (window as any).__QR_ERROR__ = error instanceof Error ? error.message : String(error);
}
