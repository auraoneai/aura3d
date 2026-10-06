/**
 * game-sound/formatProbe.ts — §6.8/1735 format probe.
 *
 * Bundled 20 ms probe files (Opus in WebM and AAC in M4A) are decoded once
 * through `decodeAudioData`; the first encoding that decodes wins. The
 * result selects the URL variant for every packed asset
 * (`<name>.opus.webm` vs `<name>.m4a`).
 */

export type EncodedFormat = "opus-webm" | "aac-m4a";

export interface FormatProbeOptions {
  readonly decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>;
  readonly fetchProbe?: (url: string) => Promise<ArrayBuffer>;
  /** Base URL of the bundled probe files. */
  readonly probeBase?: string;
}

const PROBES: readonly { format: EncodedFormat; file: string }[] = [
  { format: "opus-webm", file: "probe-20ms.opus.webm" },
  { format: "aac-m4a", file: "probe-20ms.m4a" }
];

/** Extension appended to packed asset names for the winning format. */
export const formatExtension = (format: EncodedFormat): string =>
  format === "opus-webm" ? "opus.webm" : "m4a";

export async function probeFormat(options: FormatProbeOptions): Promise<EncodedFormat> {
  const base = options.probeBase ?? "assets/probes/";
  for (const probe of PROBES) {
    try {
      const data = options.fetchProbe
        ? await options.fetchProbe(base + probe.file)
        : await fetch(base + probe.file).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.arrayBuffer();
          });
      await options.decodeAudioData(data);
      return probe.format;
    } catch {
      // Decode or fetch failed — try the next encoding.
    }
  }
  // No decodeable format → AAC/M4A is the safer universal default (Safari).
  return "aac-m4a";
}
