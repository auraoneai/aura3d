/**
 * LOOK_HDRI_MISSING fallback: when an HDRI a look (or `environments.hdri`) asked for cannot be loaded (404, an SPA
 * index.html served in its place, an unsmudged git-LFS pointer, an empty or undecodable file), the engine bakes a small
 * procedural equirect so the scene keeps usable image-based lighting instead of the flat neutral floor.
 *
 * The three band tables below are cosine-latitude-weighted band means measured from the shipped 1k probes
 * (`autumn_field_puresky_1k`, `kloppenheim_06_puresky_1k`, `studio_small_08_1k`) with the sun/softbox peaks averaged in,
 * so the fallback carries a matched overall exposure (mean linear radiance about 0.6 to 0.9) rather than a guess. It is
 * an approximation of lighting level and colour cast only: no sun disc, no softbox shapes, no reflections detail.
 * Pure functions, no DOM.
 */

export type ProceduralEnvironmentKind = "sky" | "warm-sky" | "studio" | "night";

type Rgb = readonly [number, number, number];

/** [latitude fraction from the zenith (0) to the nadir (1), linear RGB radiance]. */
const BANDS: Readonly<Record<ProceduralEnvironmentKind, readonly (readonly [number, Rgb])[]>> = {
  // autumn_field_puresky_1k (outdoor-day, outdoor-overcast, ...): zenith blue, bright horizon haze, dim ground.
  sky: [
    [0.06, [0.063, 0.134, 0.272]],
    [0.21, [0.105, 0.204, 0.388]],
    [0.375, [1.0, 1.1, 1.2]],
    [0.475, [0.611, 0.863, 1.1]],
    [0.6, [0.259, 0.389, 0.553]],
    [0.85, [0.046, 0.082, 0.147]]
  ],
  // kloppenheim_06_puresky_1k (golden-hour) and the sunset/sunrise catalogue entries: warm horizon.
  "warm-sky": [
    [0.06, [0.241, 0.373, 0.625]],
    [0.21, [0.588, 0.744, 1.025]],
    [0.375, [0.995, 1.214, 1.504]],
    [0.475, [1.068, 0.952, 0.878]],
    [0.6, [0.621, 0.67, 0.755]],
    [0.85, [0.203, 0.259, 0.355]]
  ],
  // studio_small_08_1k: dark ceiling, bright softbox band just above the horizon.
  studio: [
    [0.06, [0.15, 0.15, 0.165]],
    [0.21, [0.5, 0.51, 0.56]],
    [0.375, [1.6, 1.65, 1.8]],
    [0.475, [0.983, 1.027, 1.135]],
    [0.6, [0.402, 0.412, 0.446]],
    [0.85, [0.639, 0.649, 0.708]]
  ],
  // night / space / deep-dark HDRIs: a faint cool sky so dielectrics still show some specular.
  night: [
    [0.06, [0.004, 0.006, 0.016]],
    [0.21, [0.006, 0.009, 0.022]],
    [0.375, [0.012, 0.016, 0.034]],
    [0.475, [0.02, 0.024, 0.045]],
    [0.6, [0.01, 0.012, 0.02]],
    [0.85, [0.004, 0.005, 0.008]]
  ]
};

/** Pick the fallback family from the missing file's name (`/hdri/studio_small_08_1k.hdr` -> `studio`). */
export function proceduralEnvironmentKind(url: string): ProceduralEnvironmentKind {
  const name = (url.split(/[?#]/)[0] ?? "").split("/").pop()?.toLowerCase() ?? "";
  if (/night|space|starfield|dark|moon/.test(name)) return "night";
  if (/studio|hangar|museum|workshop|indoor|interior|warm_bar|\bbar\b|room|softbox/.test(name)) return "studio";
  if (/kloppenheim|sunset|sunrise|golden|dusk|belfast|venice|spruit/.test(name)) return "warm-sky";
  return "sky";
}

function sampleBands(table: readonly (readonly [number, Rgb])[], t: number): Rgb {
  const first = table[0]!;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < table.length; i += 1) {
    const [t1, c1] = table[i]!;
    const [t0, c0] = table[i - 1]!;
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return table[table.length - 1]![1];
}

/** A latitude-banded equirect (RGBA float32, linear radiance) for `kind`; rows run zenith to nadir. */
export function proceduralEnvironmentEquirect(kind: ProceduralEnvironmentKind, width = 64, height = 32): { readonly width: number; readonly height: number; readonly data: Float32Array } {
  const table = BANDS[kind];
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const [r, g, b] = sampleBands(table, (y + 0.5) / height);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 1;
    }
  }
  return { width, height, data };
}

/** The one actionable console.error line for a missing look HDRI. */
export function lookHdriMissingMessage(url: string, reason: string, kind: ProceduralEnvironmentKind): string {
  const bare = url.split(/[?#]/)[0]!;
  const file = bare.split("/").pop() ?? bare;
  return `LOOK_HDRI_MISSING: HDRI "${bare}" did not load (${reason}); rendering with a procedural ${kind} probe instead, so lighting will differ from the real HDRI. ` +
    `Fix: put ${file} under public/hdri/ (copy fixtures/environment-corpus/hdri/${file} or run the template's hdri sync) and make sure it is not a git-LFS pointer (run \`git lfs pull\`).`;
}

const reportedMissingHdris = new Set<string>();

/**
 * Log `LOOK_HDRI_MISSING` once per URL with `console.error` and return the message for `app.diagnostics().warnings`.
 * Both the compiled-probe path and the legacy HDR chain call this, so exactly one console line appears per file.
 */
export function reportLookHdriMissing(url: string, reason: string): { readonly message: string; readonly fallback: ProceduralEnvironmentKind } {
  const fallback = proceduralEnvironmentKind(url);
  const message = lookHdriMissingMessage(url, reason, fallback);
  if (!reportedMissingHdris.has(url) && reportedMissingHdris.size < 64) {
    reportedMissingHdris.add(url);
    if (typeof console !== "undefined") console.error(`[aura3d] ${message}`);
  }
  return { message, fallback };
}
