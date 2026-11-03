import { afterAll, describe, it, vi } from "vitest";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { glbBaseColorHistogram, projectToScreen, reconstructTemplateFrame, worldVertices } from "./native-examples-catalog-template-support.js";

const mounted = vi.hoisted(() => ({ snapshots: [] as AuraSceneSnapshot[] }));
vi.mock("@aura3d/engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aura3d/engine")>(),
  createAuraApp(_target: string, options: { scene: { toJSON(): AuraSceneSnapshot } }) {
    mounted.snapshots.push(options.scene.toJSON());
    return {};
  }
}));

const T = process.env.PROBE_TEMPLATES!.split(",");
afterAll(() => vi.unstubAllGlobals());
describe("probe", () => {
  for (const template of T) it(template, async () => {
    vi.stubGlobal("window", {});
    mounted.snapshots.length = 0;
    await import(`/Users/gurbakshchahal/platforms/aura3d/packages/create-aura3d/templates/${template}/src/main.ts`);
    const snapshot = mounted.snapshots[0]!;
    console.log(template, "camera", JSON.stringify(snapshot.camera));
    const frame = await reconstructTemplateFrame(template, snapshot, (h) => vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const bytes = h(url); if (!bytes) throw new Error("unexpected " + url);
      return new Response(new Uint8Array(bytes), { status: 200 });
    }));
    try {
      for (const item of frame.items) {
        const box = projectToScreen(worldVertices(item), frame.viewProjection);
        console.log(template, item.label, Math.round(box.minX), Math.round(box.maxX), Math.round(box.minY), Math.round(box.maxY), box.minDepth.toFixed(2), "n", box.samples.length, "inst", (item as any).instanceTransforms?.length);
      }
      for (const node of snapshot.nodes) if (node.kind === "model") {
        const path = `packages/create-aura3d/templates/${template}/public${node.asset.url}`;
        const bytes = (await import("node:fs")).readFileSync(path);
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
        for (const names of [undefined, ...json.meshes.map((m: any) => [m.name])]) {
          const h = await glbBaseColorHistogram(path, names);
          const top = [...h.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v.toFixed(3)}`);
          console.log(template, node.name, names?.[0] ?? "ALL", top.join(" "));
        }
      }
    } finally { frame.dispose(); }
  }, 120000);
});
