import { describe, expect, it } from "vitest";
import { mergeLookColorGrade } from "../../../packages/engine/src/agent-api/looks/lookGrade";
import { angleDeg, CUMULUS_LOOK, sunDirection, type Vec3 } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { ACTIVE, scenerySpec, skySpec } from "../../../examples/kid-goku-beyond-the-clouds-port/materials";
import { SCENERY_SHADOWED_FRAGMENT, STORM_SKY_FRAGMENT, SKY_FRAGMENT } from "../../../examples/kid-goku-beyond-the-clouds-port/shaders";
import { lookNodes, SUN_POS } from "../../../examples/kid-goku-beyond-the-clouds-port/world";

type Node = { kind: string; name?: string; effect?: string; light?: string; position?: Vec3; color?: string; intensity?: number; shadow?: unknown; children?: Node[]; [k: string]: unknown };
const json = (n: unknown): Node => (typeof (n as { toJSON?: () => unknown }).toJSON === "function" ? (n as { toJSON: () => Node }).toJSON() : (n as Node));
function flat(row = CUMULUS_LOOK[0]): Node[] {
  const out: Node[] = [];
  const visit = (n: Node): void => { out.push(n); for (const c of n.children ?? []) visit(c); };
  for (const n of lookNodes(row)) visit(json(n));
  return out;
}
const lightsOf = (nodes: Node[]) => nodes.filter((n) => n.kind === "light");
const elevationOf = (d: Vec3): number => (Math.asin(d[1] / Math.hypot(d[0], d[1], d[2])) * 180) / Math.PI;

describe("CD-01 one sun drives the sky disc, the scenery light, the look key and its shadow", () => {
  const storm = CUMULUS_LOOK[0];
  const nodes = flat();
  const key = nodes.find((n) => n.name === "look key light")!;

  it("every sun vector is within 3 deg of the others and 28 +/- 2 deg up, colour #ffe2b8", () => {
    const vectors: Vec3[] = [key.position!, storm.scenery.sunDir, storm.sky.sunDir, SUN_POS, ACTIVE.sunDir, ACTIVE.sunLight, sunDirection(storm.sun.elevationDeg, storm.sun.azimuthDeg)];
    for (const a of vectors) for (const b of vectors) expect(angleDeg(a, b)).toBeLessThan(3);
    for (const v of vectors) expect(Math.abs(elevationOf(v) - 28)).toBeLessThanOrEqual(2);
    expect(key.color).toBe("#ffe2b8");
  });

  it("the sky dome and the scenery shader read the same direction", () => {
    const sky = skySpec(storm), scenery = scenerySpec({}, storm);
    const u = (spec: typeof sky, name: string) => (spec.uniforms as Record<string, { value: number[] }>)[name]!.value as unknown as Vec3;
    expect(angleDeg(u(sky, "sunDir"), u(scenery, "sunDirW"))).toBeLessThan(0.01);
    expect(angleDeg(u(scenery, "sunDirW"), key.position!)).toBeLessThan(0.5);
  });
});

describe("CD-02 the scenery receives the one cascaded sun shadow", () => {
  const nodes = flat();
  it("one shadowed light: the look key, 4 PCSS cascades to 160 m; no authored second sun", () => {
    const shadowed = lightsOf(nodes).filter((n) => n.shadow);
    expect(shadowed.map((n) => n.name)).toEqual(["look key light"]);
    expect(shadowed[0]!.shadow).toMatchObject({ cascades: 4, maxDistance: 160, filter: "pcss" });
    expect(nodes.some((n) => n.name === "sun")).toBe(false);
  });
  it("custom scenery declares receiveShadow and samples a3dSunShadow; the original row keeps its unshadowed program", () => {
    const spec = scenerySpec({}, CUMULUS_LOOK[0]) as { receiveShadow?: boolean; glsl: { fragment: string } };
    expect(spec.receiveShadow).toBe(true);
    expect(spec.glsl.fragment).toBe(SCENERY_SHADOWED_FRAGMENT);
    expect(spec.glsl.fragment).toMatch(/a3dSunShadow\(vW, n, sunDirW\)/);
    expect((scenerySpec({}, CUMULUS_LOOK[1]) as { receiveShadow?: boolean }).receiveShadow).toBeUndefined();
  });
});

describe("CD-03 / CD-04 / CD-07 / CD-08 / CD-10 look nodes", () => {
  const nodes = flat();
  it("no hemisphere or ambient fill; a cool unshadowed back rim", () => {
    expect(lightsOf(nodes).some((n) => n.light === "hemisphere" || n.light === "ambient")).toBe(false);
    const rim = nodes.find((n) => n.name === "look rim light")!;
    expect(rim.color).toBe("#9fc8ff");
    expect(rim.intensity).toBe(0.8);
    expect(rim.shadow ?? false).toBeFalsy();
  });
  it("spruit_sunrise IBL at 0.8, rotated, background off", () => {
    const hdri = nodes.find((n) => typeof n.name === "string" && n.name.startsWith("look hdri"))!;
    expect(hdri.name).toBe("look hdri spruit_sunrise_1k");
    expect(hdri.intensity).toBe(0.8);
    expect(hdri.background).toBe(false);
    expect(hdri.rotation).toBeCloseTo((140 * Math.PI) / 180, 6);
  });
  it("haze #9fb8cf at 0.0032 as height fog pooling in the gorges", () => {
    const fog = nodes.filter((n) => n.kind === "effect" && n.effect === "fog");
    expect(fog).toHaveLength(1);
    expect(fog[0]).toMatchObject({ name: "look fog", color: "#9fb8cf", density: 0.0032, mode: "height" });
    expect(fog[0]!.heightDensity).toBeGreaterThan(0);
  });
  it("one grade node after the look merge: temperature +0.08, warm gain, cool lift; one bloom; vignette 0.2", () => {
    const grades = mergeLookColorGrade(nodes as never[]).filter((n: Node) => n.kind === "effect" && n.effect === "color-grade") as Node[];
    expect(grades).toHaveLength(1);
    expect(grades[0]).toMatchObject({ temperature: 0.08 });
    const gain = grades[0]!.gain as number[], lift = grades[0]!.lift as number[];
    expect(gain[0]!).toBeGreaterThan(gain[2]!);
    expect(lift[2]!).toBeGreaterThan(lift[0]!);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "bloom")).toHaveLength(1);
    expect(nodes.find((n) => n.effect === "vignette")).toMatchObject({ intensity: 0.2 });
  });
  it("the look's single AO node plus contact shadows", () => {
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "ambient-occlusion")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "contact-shadows")).toHaveLength(1);
  });
});

describe("?look=original keeps today's nodes", () => {
  const nodes = flat(CUMULUS_LOOK[1]);
  it("authored shadow sun at [48, 78, 38], sky-fill hemisphere, look fog off, haze 0.0026, old sky fragment", () => {
    const sun = nodes.find((n) => n.name === "sun")!;
    expect(sun.position).toEqual([48, 78, 38]);
    expect(nodes.some((n) => n.name === "sky-fill")).toBe(true);
    expect(nodes.some((n) => n.name === "look fog")).toBe(false);
    expect(nodes.find((n) => n.name === "haze")).toMatchObject({ density: 0.0026, color: "#a8c9e8" });
    expect(nodes.find((n) => n.name === "grade")).toMatchObject({ exposure: 1.02, contrast: 1.07, saturation: 1.16 });
    expect(skySpec(CUMULUS_LOOK[1]).glsl).toMatchObject({ fragment: SKY_FRAGMENT });
    expect(skySpec(CUMULUS_LOOK[0]).glsl).toMatchObject({ fragment: STORM_SKY_FRAGMENT });
  });
});
