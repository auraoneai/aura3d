// GU47 E-A (WP-1): the NEW AuraLookOverrides keys (PRD §3.1 E-A) — every key and clamp, their v0 emission, the
// default white-balance / post-preset / colour-background changes, and the 17-id HDRI catalogue on disk.
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clampLookOverrides,
  expandLookChildren,
  lookHdriIds,
  lookHdriUrl,
  lookOutputPreset,
  looks
} from "../../../packages/engine/src/agent-api/looks/looks.js";
import { lookPresets, lookPresetIds } from "../../../packages/engine/src/agent-api/looks/lookPresets.js";
import type { AuraHdriId, AuraLookId, AuraLookOverrides } from "../../../packages/engine/src/contracts/looks.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { validatePostEffectNode } from "../../../packages/engine/src/agent-api/postBridge.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/index.js";
import type {
  AuraAssetRef,
  AuraEffectNode,
  AuraEnvironmentNode,
  AuraGroupNode,
  AuraLightNode,
  AuraSceneNode
} from "../../../packages/engine/src/agent-api/index.js";
import { decodeHdrEquirect } from "../../../packages/rendering/src/environment/HdrEquirect.js";

const FLAGS_OFF = resolveQrFlags({ env: {} });
const children = (id: AuraLookId, overrides?: AuraLookOverrides): readonly AuraSceneNode[] => expandLookChildren(id, overrides, FLAGS_OFF);

type Env = AuraEnvironmentNode & { readonly rotation?: number; readonly background?: unknown; readonly environment: string; readonly lookFill?: boolean };
type Fx = AuraEffectNode & Record<string, unknown>;
const env = (nodes: readonly AuraSceneNode[]): Env | undefined => nodes.find((n) => n.kind === "environment") as Env | undefined;
const light = (nodes: readonly AuraSceneNode[], name: string): AuraLightNode | undefined =>
  nodes.find((n) => n.kind === "light" && n.name === name) as AuraLightNode | undefined;
const effect = (nodes: readonly AuraSceneNode[], kind: string): Fx | undefined =>
  nodes.find((n) => n.kind === "effect" && n.effect === kind) as Fx | undefined;
const outputChild = (nodes: readonly AuraSceneNode[]): (AuraGroupNode & { output?: { preset?: string } }) | undefined =>
  nodes.find((n) => n.kind === "group" && (n as { lookOutput?: boolean }).lookOutput === true) as never;
/** Sun-style angles of a light position (azimuth clockwise from +Z, as lookPresets places them). */
const angles = (p: readonly number[]): { el: number; az: number } => {
  const d = Math.hypot(p[0]!, p[1]!, p[2]!);
  const az = (Math.atan2(p[0]!, p[2]!) * 180) / Math.PI;
  return { el: (Math.asin(p[1]! / d) * 180) / Math.PI, az: az < 0 ? az + 360 : az };
};

const customHdri = (): AuraAssetRef<"texture"> =>
  defineAuraAssets({ customSky: { type: "texture", format: "hdr", url: "/hdri/custom_sky_1k.hdr" } }).customSky;

describe("clampLookOverrides: every GU47 E-A key and clamp", () => {
  it("hdri: catalogue ids and texture refs pass; an unknown id throws LOOK_HDRI_UNKNOWN", () => {
    for (const id of lookHdriIds) expect(clampLookOverrides({ hdri: id })?.hdri).toBe(id);
    const ref = customHdri();
    expect(clampLookOverrides({ hdri: ref })?.hdri).toBe(ref);
    expect(() => clampLookOverrides({ hdri: "not_a_sky" as AuraHdriId })).toThrow(/LOOK_HDRI_UNKNOWN:not_a_sky/);
  });

  it("environmentIntensity clamps to [0, 4]; environmentRotationDeg wraps into [0, 360); non-finite values drop", () => {
    expect(clampLookOverrides({ environmentIntensity: 9 })?.environmentIntensity).toBe(4);
    expect(clampLookOverrides({ environmentIntensity: -1 })?.environmentIntensity).toBe(0);
    expect(clampLookOverrides({ environmentIntensity: 1.25 })?.environmentIntensity).toBe(1.25);
    expect(clampLookOverrides({ environmentIntensity: Number.NaN })).toEqual({});
    expect(clampLookOverrides({ environmentRotationDeg: 370 })?.environmentRotationDeg).toBe(10);
    expect(clampLookOverrides({ environmentRotationDeg: -30 })?.environmentRotationDeg).toBe(330);
    expect(clampLookOverrides({ environmentRotationDeg: Number.POSITIVE_INFINITY })).toEqual({});
  });

  it("key: intensity [0, 20]; colour and shadow options pass through", () => {
    const shadow = { cascades: 4, maxDistance: 80 } as const;
    expect(clampLookOverrides({ key: { color: "#ffd9a0", intensity: 25, shadow } })?.key).toEqual({ color: "#ffd9a0", intensity: 20, shadow });
    expect(clampLookOverrides({ key: { intensity: -3 } })?.key).toEqual({ intensity: 0 });
  });

  it("rim: false stays false; intensity [0, 20]; azimuthDeg wraps", () => {
    expect(clampLookOverrides({ rim: false })?.rim).toBe(false);
    expect(clampLookOverrides({ rim: { color: "#7fd4ff", intensity: 30, azimuthDeg: -90 } })?.rim).toEqual({ color: "#7fd4ff", intensity: 20, azimuthDeg: 270 });
  });

  it("fog: near/far [0, 100000]; colour and height pass through", () => {
    const height = { heightFalloff: 0.2, heightDensity: 0.05 };
    expect(clampLookOverrides({ fog: { color: "#223344", near: -5, far: 2e6, height } })?.fog).toEqual({ color: "#223344", near: 0, far: 100000, height });
  });

  it("grade: contrast/saturation [0, 3], temperature/tint [-1, 1], lut passes through", () => {
    const lut = defineAuraAssets({ warm: { type: "texture", url: "/luts/warm.cube" } }).warm;
    expect(clampLookOverrides({ grade: { contrast: 4, saturation: -1, temperature: 2, tint: -2, lut } })?.grade).toEqual({
      contrast: 3,
      saturation: 0,
      temperature: 1,
      tint: -1,
      lut
    });
  });

  it("post: a C-13 preset id passes, an unknown id throws LOOK_POST_UNKNOWN; bloom false or clamped options", () => {
    expect(clampLookOverrides({ post: "neon-night" })?.post).toBe("neon-night");
    expect(() => clampLookOverrides({ post: "vaporwave" as never })).toThrow(/LOOK_POST_UNKNOWN:vaporwave/);
    expect(clampLookOverrides({ post: { bloom: false } })?.post).toEqual({ bloom: false });
    expect(
      clampLookOverrides({ post: { bloom: { intensity: 9, threshold: 99, knee: 2, scatter: -1, color: "#ffeecc", clampLuminance: 100 } } })?.post
    ).toEqual({ bloom: { intensity: 4, threshold: 64, knee: 1, scatter: 0, color: "#ffeecc", clampLuminance: 64 } });
  });

  it("keeps the C-34 keys' clamps", () => {
    expect(clampLookOverrides({ sun: { azimuthDeg: -10, elevationDeg: 120 }, exposureEv: 5, fogDensityScale: 9, accent: "#ff0000", background: "look" })).toEqual({
      sun: { azimuthDeg: 350, elevationDeg: 90 },
      exposureEv: 2,
      fogDensityScale: 3,
      accent: "#ff0000",
      background: "look"
    });
  });
});

describe("v0 emission of the GU47 E-A keys", () => {
  it("hdri id: the look HDRI becomes the catalogue 1k file", () => {
    const hdri = env(children("outdoor-day", { hdri: "venice_sunset" }))!;
    expect(hdri.environment).toBe("hdri");
    expect(hdri.name).toBe("look hdri venice_sunset_1k");
    expect((hdri.texture as AuraAssetRef<"texture"> & { url?: string }).url).toBe("/hdri/venice_sunset_1k.hdr");
    expect(hdri.intensity).toBe(lookPresets["outdoor-day"].v0.environmentIntensity);
  });

  it("hdri on a no-HDRI look replaces its fill (intensity 1 unless set); a texture ref passes through", () => {
    const night = children("night-city", { hdri: "rooftop_night" });
    expect(night.some((n) => (n as { lookFill?: boolean }).lookFill === true)).toBe(false);
    expect(env(night)).toMatchObject({ environment: "hdri", intensity: 1, name: "look hdri rooftop_night_1k" });
    const ref = customHdri();
    const custom = env(children("space", { hdri: ref, environmentIntensity: 0.4 }))!;
    expect(custom.texture).toBe(ref);
    expect(custom.intensity).toBe(0.4);
    expect(custom.name).toBe(`look hdri ${ref.id}`);
  });

  it("environmentIntensity sets the HDRI intensity, or the fill's on a no-HDRI look; environmentRotationDeg rotates the HDRI", () => {
    expect(env(children("golden-hour", { environmentIntensity: 2.5 }))!.intensity).toBe(2.5);
    const fill = env(children("underwater", { environmentIntensity: 0.3 }))!;
    expect(fill.lookFill).toBe(true);
    expect(fill.intensity).toBe(0.3);
    expect(env(children("outdoor-day", { environmentRotationDeg: 90 }))!.rotation).toBeCloseTo(Math.PI / 2, 10);
    expect(env(children("outdoor-day"))!.rotation).toBeUndefined();
  });

  it("key: colour, intensity and directional shadow options reach the key light", () => {
    const shadow = { cascades: 3, maxDistance: 60 } as const;
    const key = light(children("overcast", { key: { color: "#ffe0b0", intensity: 4.5, shadow } }), "look key light")!;
    expect(key).toMatchObject({ color: "#ffe0b0", intensity: 4.5, shadow });
    expect(light(children("overcast"), "look key light")!.shadow).toBe(true);
  });

  it("rim: false drops the look rim; an object retunes it or adds one opposite the key in the accent colour", () => {
    expect(light(children("character-showcase", { rim: false }), "look rim light")).toBeUndefined();
    const retuned = light(children("character-showcase", { rim: { color: "#ffffff", intensity: 3, azimuthDeg: 90 } }), "look rim light")!;
    expect(retuned).toMatchObject({ color: "#ffffff", intensity: 3 });
    const base = angles(lookPresets["character-showcase"].v0.rim!.position);
    expect(angles(retuned.position!).az).toBeCloseTo(90, 1);
    expect(angles(retuned.position!).el).toBeCloseTo(base.el, 1);
    expect(light(children("outdoor-day"), "look rim light")).toBeUndefined();
    const added = light(children("outdoor-day", { rim: { intensity: 2 } }), "look rim light")!;
    expect(added).toMatchObject({ intensity: 2, color: lookPresets["outdoor-day"].palette.accent });
    const keyAz = angles(lookPresets["outdoor-day"].v0.key.position).az;
    expect(angles(added.position!).az).toBeCloseTo((keyAz + 180) % 360, 1);
  });

  it("fog: colour/near/far replace the look range (near/far ride on the node), height makes a C-21 height fog", () => {
    const fog = effect(children("outdoor-day", { fog: { color: "#a0b4c8", near: 10, far: 120 } }), "fog")!;
    expect(fog).toMatchObject({ color: "#a0b4c8", near: 10, far: 120 });
    expect(fog.density).toBeCloseTo(24 / 120, 10);
    const plain = effect(children("outdoor-day"), "fog")!;
    expect(plain.near).toBeUndefined();
    const height = effect(children("outdoor-day", { fog: { height: { heightFalloff: 0.3, heightDensity: 0.04, maxOpacity: 0.8 } } }), "fog")!;
    expect(height).toMatchObject({ mode: "height", heightFalloff: 0.3, heightDensity: 0.04, maxOpacity: 0.8, color: lookPresets["outdoor-day"].v0.fog!.color });
    // A fog override on a look without fog adds one (colour = the look background unless set).
    expect(effect(children("interior-industrial"), "fog")).toBeUndefined();
    expect(effect(children("interior-industrial", { fog: { far: 80 } }), "fog")).toMatchObject({ color: lookPresets["interior-industrial"].v0.background, far: 80 });
    // fogDensityScale still applies on top, and 0 still removes the fog.
    expect(effect(children("outdoor-day", { fog: { far: 120 }, fogDensityScale: 2 }), "fog")!.density).toBeCloseTo(24 / 60, 10);
    expect(effect(children("outdoor-day", { fog: { far: 120 }, fogDensityScale: 0 }), "fog")).toBeUndefined();
  });

  it("grade: contrast/saturation/temperature/tint/lut on the look grade node, all authored and v2-valid", () => {
    const lut = defineAuraAssets({ teal: { type: "texture", url: "/luts/teal.cube" } }).teal;
    const grade = effect(children("golden-hour", { grade: { contrast: 1.3, saturation: 0.8, temperature: -0.4, tint: 0.2, lut } }), "color-grade")!;
    expect(grade).toMatchObject({ contrast: 1.3, saturation: 0.8, temperature: -0.4, tint: 0.2, lut, lookGrade: true });
    expect(grade.postAuthored).toEqual(expect.arrayContaining(["contrast", "saturation", "temperature", "tint", "lut"]));
    expect(validatePostEffectNode(grade)?.filter((d) => d.code === "POST_FIELD_UNSUPPORTED")).toEqual([]);
  });

  it("post: a preset id replaces the output.preset child; bloom false drops the look bloom, options retune it", () => {
    const nodes = children("golden-hour", { post: "neon-night" });
    expect(outputChild(nodes)?.output).toEqual({ preset: "neon-night" });
    expect(outputChild(nodes)?.children).toEqual([]);
    expect(effect(children("golden-hour", { post: { bloom: false } }), "bloom")).toBeUndefined();
    const bloom = effect(children("golden-hour", { post: { bloom: { intensity: 0.6, threshold: 1.2, knee: 0.3, scatter: 0.5, clampLuminance: 20, color: "#ffcc88" } } }), "bloom")!;
    expect(bloom).toMatchObject({ intensity: 0.6, threshold: 1.2, knee: 0.3, scatter: 0.5, clampLuminance: 20, color: "#ffcc88" });
    expect(bloom.postAuthored).toEqual(expect.arrayContaining(["intensity", "threshold", "scatter", "color", "knee", "clampLuminance"]));
    expect(validatePostEffectNode(bloom)?.filter((d) => d.code === "POST_FIELD_UNSUPPORTED")).toEqual([]);
    // No override: the default bloom node is unchanged (accent still colours it).
    expect(effect(children("golden-hour", { accent: "#00ffaa" }), "bloom")!.color).toBe("#00ffaa");
  });

  it("lookOutputPreset reads the child from v0 groups (any depth) and v1 look nodes", () => {
    const group = looks.preset("golden-hour", { post: "space" }, { expansion: "v0" }) as unknown as { toJSON(): AuraSceneNode };
    expect(lookOutputPreset([{ kind: "group", name: "level", children: [group.toJSON()] } as AuraGroupNode])).toBe("space");
    expect(lookOutputPreset([{ kind: "look", look: "golden-hour" } as unknown as AuraSceneNode])).toBe("cinematic-film");
    expect(lookOutputPreset([])).toBeUndefined();
  });
});

describe("default changes (WP-1 item 3)", () => {
  it("every look emits its declared grade temperature and its declared post preset as the output.preset child", () => {
    for (const id of lookPresetIds) {
      const nodes = children(id);
      expect(effect(nodes, "color-grade")?.temperature, id).toBe(lookPresets[id].v0.grade.temperature);
      expect(effect(nodes, "color-grade")?.postAuthored, id).toContain("temperature");
      expect(outputChild(nodes)?.output, id).toEqual({ preset: lookPresets[id].post });
    }
  });

  it("FC-style scene: interior-industrial with background #0d1a24 keeps the HDRI for light but not as the sky", () => {
    const group = (looks.preset("interior-industrial", { background: "#0d1a24" }, { expansion: "v0" }) as unknown as { toJSON(): AuraGroupNode }).toJSON();
    const hdri = env(group.children)!;
    expect(hdri.environment).toBe("hdri");
    expect(hdri.background).toBe(false);
    expect((group as { background?: string }).background).toBe("#0d1a24");
    // The look's own backdrop keeps the HDRI drawn (builder default).
    expect(env(children("interior-industrial"))!.background).toBe(true);
    expect(env(children("interior-industrial", { background: "look" }))!.background).toBe(true);
  });
});

describe("HDRI catalogue (WP-1 item 2)", () => {
  const PUBLIC_HDRI = new URL("../../../public/hdri/", import.meta.url);
  /** "1.5 MB" read as 1.5 MiB (what `ls -lh` prints as 1.5M). */
  const MAX_1K_BYTES = 1.5 * 1024 * 1024;
  /**
   * Lossless 1024x512 RGBE RLE of these noisy sources cannot reach 1.5 MiB: three incompressible mantissa bytes per
   * texel are 1.5 MiB alone. Poly Haven's own 1k files are the same size (lanes/ea.md); guarded at their size here.
   */
  const OVER_BUDGET: Partial<Record<AuraHdriId, number>> = {
    rooftop_night: 1_629_654,
    cobblestone_street_night: 1_766_411,
    hangar_interior: 1_761_250,
    kloppenheim_02: 1_744_238,
    deep_space_starfield: 1_831_733,
    "indoor-workshop": 1_638_244
  };
  const NEW_IDS = lookHdriIds.filter((id) => !["autumn_field_puresky", "kloppenheim_06_puresky", "studio_small_08"].includes(id));

  it("ships the 17 AuraHdriId ids (3 existing + 14 new) at /hdri/<id>_1k.hdr", () => {
    expect(lookHdriIds).toHaveLength(17);
    expect(NEW_IDS).toHaveLength(14);
    for (const id of lookHdriIds) {
      expect(lookHdriUrl(id)).toBe(`/hdri/${id}_1k.hdr`);
      const ref = env(children("outdoor-day", { hdri: id }))!.texture as AuraAssetRef<"texture"> & { url?: string };
      expect(ref.url, id).toBe(lookHdriUrl(id));
    }
  });

  it("each catalogue file exists, is a 1024x512 Radiance file and stays within its size budget", () => {
    for (const id of lookHdriIds) {
      const file = new URL(`${id}_1k.hdr`, PUBLIC_HDRI);
      expect(existsSync(file), `${id}_1k.hdr`).toBe(true);
      const bytes = statSync(file).size;
      expect(bytes, id).toBeLessThanOrEqual(OVER_BUDGET[id] ?? MAX_1K_BYTES);
      const data = readFileSync(file);
      if (data.subarray(0, 7).toString("latin1") === "version") continue; // an un-smudged LFS pointer checkout
      expect(data.subarray(0, 2).toString("latin1"), id).toBe("#?");
      if (NEW_IDS.includes(id)) {
        const image = decodeHdrEquirect(data);
        expect([image.width, image.height], id).toEqual([1024, 512]);
      }
    }
  });

  it("each new file has a licence row in ATTRIBUTION.md and hdri-environments.json", () => {
    const attribution = readFileSync(new URL("ATTRIBUTION.md", PUBLIC_HDRI), "utf8");
    const art = JSON.parse(readFileSync(new URL("../../../assets/art-direction/hdri-environments.json", import.meta.url), "utf8")) as {
      catalogue: readonly { id: string; file: string; license: string; bytes: number }[];
    };
    for (const id of NEW_IDS) {
      expect(attribution, id).toContain(`\`${id}_1k.hdr\``);
      const row = art.catalogue.find((r) => r.id === id);
      expect(row, id).toMatchObject({ file: `/hdri/${id}_1k.hdr`, license: "CC0-1.0", bytes: statSync(new URL(`${id}_1k.hdr`, PUBLIC_HDRI)).size });
    }
  });
});
