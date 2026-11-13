import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGolferNodes } from "../../../apps/showcase-aura-links-3d/src/game/rig";

const appSrc = resolve(__dirname, "../../../apps/showcase-aura-links-3d/src");

describe("Links golfer and caddy models", () => {
  it("get their idle clips from .animate(), with no ignored `animation` option passed to model()", () => {
    const nodes = buildGolferNodes({} as any).map((n: any) => (typeof n?.toJSON === "function" ? n.toJSON() : n));
    const golfer = nodes.find((n: any) => n.name === "golfer-body");
    const caddy = nodes.find((n: any) => n.name === "caddy-body");
    // the default player is the Meshy golfer (clip "idle"); the original athlete ("Ready") stays behind ?golfer=old
    expect(golfer?.animation).toMatchObject({ clip: "idle", loop: true, speed: 1 });
    expect(caddy?.animation).toMatchObject({ clip: "Idle_Loop", loop: true, speed: 0.9 });
    const rig = readFileSync(resolve(appSrc, "game/rig.ts"), "utf8");
    expect(rig).not.toMatch(/model\([^)]*\{[^}]*animation:/s);
  });

  it("every app module reads the per-app asset subset, never the 2.6 MB root catalog (audit RH-06)", () => {
    for (const file of ["main.ts", "game/rig.ts"]) {
      const src = readFileSync(resolve(appSrc, file), "utf8");
      expect(src, file).not.toMatch(/from "(\.\.\/)+src\/aura-assets"/);
    }
  });

  it("builds a 14-joint sculpted pro golfer with matte pleated chinos (roughness 0.78), cabretta glove, tour sunglasses, curved-brim cap, and grounded saddle shoes", () => {
    const nodes = buildGolferNodes(
      { polo: "#1f5f46", cap: "#173c2e", skin: "#c88d62" } as any,
      true
    ).map((n: any) => (typeof n?.toJSON === "function" ? n.toJSON() : n));
    const golfer = nodes.find((n: any) => n.name === "golfer-body");
    expect(golfer).toBeTruthy();

    const names = new Set<string>();
    const mats: any[] = [];
    const meshes: any[] = [];
    const walk = (node: any): void => {
      if (!node || typeof node !== "object") return;
      if (typeof node.name === "string") names.add(node.name);
      if (node.material) mats.push(node.material);
      if (Array.isArray(node.materials)) mats.push(...node.materials);
      if (node.geometry?.positions) meshes.push(node);
      for (const child of node.children ?? []) walk(child);
    };
    walk(golfer);

    for (const joint of [
      "golfer-hips", "golfer-spine", "golfer-chest", "golfer-head",
      "golfer-arm-l", "golfer-forearm-l", "golfer-arm-r", "golfer-forearm-r",
      "golfer-thigh-l", "golfer-shin-l", "golfer-foot-l",
      "golfer-thigh-r", "golfer-shin-r", "golfer-foot-r"
    ]) {
      expect(names.has(joint), joint).toBe(true);
    }

    // Matte pleated chinos (`roughness: 0.78`) + multi-material cabretta lead-hand forearm (`golfer-forearm-mesh-l` > right forearm sub-draws), polarized sunglasses (`golfer-head-mesh`), and grounded saddle shoes (`golfer-foot-mesh-l`)
    expect(mats.some((m) => m?.roughness === 0.78)).toBe(true);
    expect(names.has("golfer-forearm-mesh-l")).toBe(true);
    expect(names.has("golfer-head-mesh")).toBe(true);
    expect(names.has("golfer-foot-mesh-l")).toBe(true);
    expect(meshes.length).toBeGreaterThanOrEqual(12);
    for (const m of meshes) {
      expect(m.geometry.colors?.length).toBeGreaterThan(0);
    }
  });
});
