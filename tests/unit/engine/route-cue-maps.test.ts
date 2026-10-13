/**
 * PRD-09 1734 pre-flight: every route and template cue map must already satisfy
 * the C-25 rule — each cue carries `asset` (typed, with a `url`) or a `play`
 * callback — BEFORE `GameAudio`'s adapter throws on the default-synth path.
 *
 * The manifests are the committed cue → asset/type maps each route converts
 * into `createGameAudio` `cues`; importing them read-only is the check the PRD
 * asks for. Routes without a manifest module (Deep Recovery, Rooftop Buckets)
 * never reach `createGameAudio` — they own private url maps — and templates
 * ship no audio cues at all; both facts are asserted so the coverage list
 * cannot silently rot.
 *
 * `assetKey` counts as `asset`: those manifests resolve the key into a typed
 * `{url, hash}` at play time (post-audio pattern).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

interface CueLike {
  readonly cue?: string;
  readonly asset?: { readonly url?: string };
  readonly assetKey?: string;
  readonly play?: unknown;
}

const LEGACY_MANIFEST_SOURCES: ReadonlyArray<{
  readonly route: string;
  readonly relPath: string;
  readonly exportName: string;
}> = [
  { route: "showcase-aurora-lander", relPath: "apps/showcase-aurora-lander/src/lander-audio.ts", exportName: "landerAudioManifest" },
  { route: "showcase-bank-shot", relPath: "apps/showcase-bank-shot/src/legacy/billiards-audio.ts", exportName: "billiardsAudioManifest" },
  { route: "showcase-courier-rush", relPath: "apps/showcase-courier-rush/src/legacy/courier-audio.ts", exportName: "courierAudioManifest" },
  { route: "showcase-gallery-shift", relPath: "apps/showcase-gallery-shift/src/heist-audio.ts", exportName: "heistAudioManifest" },
  { route: "showcase-gravity-post", relPath: "apps/showcase-gravity-post/src/post-audio.ts", exportName: "GRAVITY_POST_AUDIO_MANIFEST" },
  { route: "showcase-mech-hangar", relPath: "apps/showcase-mech-hangar/src/hangar-audio.ts", exportName: "hangarAudioManifest" },
  { route: "showcase-patrol-wing", relPath: "apps/showcase-patrol-wing/src/wing-audio.ts", exportName: "wingAudioManifest" },
  { route: "showcase-siege-golf", relPath: "apps/showcase-siege-golf/src/legacy/golf-audio.ts", exportName: "golfAudioManifest" },
  { route: "showcase-skyline-runner", relPath: "apps/showcase-skyline-runner/src/skyline-audio-manifest.ts", exportName: "skylineAudioManifest" },
  { route: "showcase-turbo-drift-circuit", relPath: "apps/showcase-turbo-drift-circuit/src/legacy/turbo-audio.ts", exportName: "turboAudioManifest" },
  { route: "showcase-vault-breakers", relPath: "apps/showcase-vault-breakers/src/legacy/pinball-audio.ts", exportName: "vaultAudioManifest" },
  { route: "aura-clash-showcase", relPath: "apps/aura-clash-showcase/src/playable/audio/auraClashAudioManifest.ts", exportName: "auraClashAudioManifest" }
];

const cueSatisfied = (def: CueLike): boolean =>
  Boolean(def.asset?.url) || Boolean(def.assetKey) || typeof def.play === "function";

describe("route/template cue maps satisfy C-25 (PRD-09 1734)", () => {
  for (const entry of LEGACY_MANIFEST_SOURCES.filter((candidate) => existsSync(join(ROOT, candidate.relPath)))) {
    it(`${entry.route}: every cue has asset or play`, async () => {
      const mod = (await import(pathToFileURL(join(ROOT, entry.relPath)).href)) as Record<string, Readonly<Record<string, CueLike>>>;
      const manifest = mod[entry.exportName] ?? {};
      const offenders = Object.entries(manifest)
        .filter(([, def]) => !cueSatisfied(def))
        .map(([id]) => id);
      expect(offenders, `${entry.route} cues without asset/play — patch into its Q-14-1 set`).toEqual([]);
      expect(Object.keys(manifest).length).toBeGreaterThan(0);
    });
  }

  const pulseTunnelAudioPath = existsSync(join(ROOT, "apps/showcase-pulse-tunnel/src/legacy/tunnel-audio.ts"))
    ? join(ROOT, "apps/showcase-pulse-tunnel/src/legacy/tunnel-audio.ts")
    : join(ROOT, "apps/showcase-pulse-tunnel/src/tunnel-audio.ts");
  if (existsSync(pulseTunnelAudioPath)) {
    it("pulse-tunnel stem+sfx entries each carry play or asset (inline cue map)", () => {
      // The tunnel builds its `cues` record inside createTunnelAudio — scan the
      // `id:` entries textually since there is no exported map.
      const src = readFileSync(pulseTunnelAudioPath, "utf8");
      const block = src.match(/const cueEntries[^=]*=\s*{([\s\S]*?)\n  };/);
      expect(block, "tunnel cueEntries literal not found").not.toBeNull();
      const entries = block![1].match(/\w+:\s*{\s*id:[^}]*}/g) ?? [];
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry, `tunnel cue entry lacks asset/play: ${entry}`).toMatch(/play:|asset:/);
      }
    });
  }

  it("route audio modules without a createGameAudio cue map are non-adapters", () => {
    // These routes own private `cueMap`s of typed asset URLs and never call
    // createGameAudio, so the C-25 throw cannot reach them.
    for (const rel of [
      "apps/showcase-deep-recovery/src/deep-audio.ts",
      "apps/showcase-rooftop-buckets/src/buckets-audio.ts"
    ].filter((candidate) => existsSync(join(ROOT, candidate)))) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src, `${rel} started calling createGameAudio — audit its cue map`).not.toMatch(/createGameAudio/);
    }
  });

  it("no create-aura3d template ships an audio cue map", () => {
    const templatesDir = join(ROOT, "packages/create-aura3d/templates");
    const cueMapFiles = readdirSync(templatesDir, { recursive: true })
      .map(String)
      .filter((p) => !p.includes("node_modules") && /audio|cue.?map/i.test(p));
    expect(cueMapFiles).toEqual([]);
  });
});
