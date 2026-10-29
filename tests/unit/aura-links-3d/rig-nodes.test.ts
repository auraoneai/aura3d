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
    expect(golfer?.animation).toMatchObject({ clip: "Ready", loop: true, speed: 1 });
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
});
