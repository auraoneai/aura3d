import { afterEach, beforeEach, expect, it, vi } from "vitest";
const st = vi.hoisted(() => ({ compiled: [] as unknown[] }));
vi.mock("../../../packages/engine/src/agent-api/app/frameLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/engine/src/agent-api/app/frameLoop")>();
  const { compileScene } = await import("../../../packages/engine/src/contracts/compiler");
  const { resolveQrFlags } = await import("../../../packages/engine/src/contracts/flags");
  return {
    ...actual,
    startProductionRender: async (_c: unknown, snapshot: never, _d: unknown, _o: unknown, _ov: unknown, _br: unknown, _p: unknown, runtimeNodes: any) => {
      const flags = resolveQrFlags({});
      const ctx = { renderer: undefined, assets: undefined, quality: { tier: "high" }, strict: false, flags, degrade: () => undefined, canvas: { width: 64, height: 64 }, environmentLighting: () => ({}), collectedLights: [], runtimeWarnings: new Set(), runtimeNodes } as never;
      const c = await compileScene(snapshot, ctx);
      runtimeNodes.attachCompiled(c);
      st.compiled.push(c);
      return { update() {}, render() {}, setPerformanceQuality() {}, diagnostics: () => undefined, renderAsync: () => Promise.resolve(), busy: () => false, whenIdle: () => Promise.resolve(), resetTemporalHistory() {}, pause() {}, resume() {}, dispose() {} };
    }
  };
});
import { createAuraApp, primitives, scene, looks, lights } from "../../../packages/engine/src";
import { asRuntimeImpl } from "../../../packages/engine/src/agent-api/compiler/compileScene";
class FakeCanvas { width = 300; height = 150; style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null; clientWidth = 64; clientHeight = 64; getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; } hasAttribute() { return false; } getContext() { return null; } addEventListener() {} removeEventListener() {} }
const g = globalThis as unknown as Record<string, unknown>;
beforeEach(() => { g.HTMLCanvasElement = FakeCanvas; g.window = { innerWidth: 64, innerHeight: 64, location: { search: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} }; });
afterEach(() => { delete g.HTMLCanvasElement; delete g.window; });
// Lane E1 wave 2 (handoff from E2): app.nodes.remove(id) on a group or look the app mounted (Cross Hop swapLook).
it("app.nodes.remove on a mounted look removes its lights, environment and effects from the compiled scene", async () => {
  const s = scene().add(primitives.box({ name: "b" })).add(lights.ambient({ intensity: 0.42 }) as never).add(looks.preset("outdoor-day" as never, {}).runtime({ id: "look", mutable: true } as never));
  const app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, { scene: s, autoStart: false, diagnostics: false });
  await app.ready();
  const impl = asRuntimeImpl(st.compiled[0] as never)!;
  const kinds = () => impl.liveNodes.map((n: any) => n.kind + (n.light ? ":" + n.light : ""));
  expect(kinds()).toEqual(expect.arrayContaining(["environment", "light:directional", "effect"]));
  expect(app.nodes.remove!("look")).toBe(true);
  expect(kinds()).toEqual(["primitive", "light:ambient"]);
  expect(app.nodes.remove!("look")).toBe(false);
  // A new look under the same id goes in, and a remount (it would be built from the app scene) leaves out the removed one.
  app.nodes.add!(looks.preset("night-city" as never, {}).runtime({ id: "look", mutable: true } as never) as never);
  const next = (app.nodes as any).sceneWithRuntimeAdditions();
  expect(next.nodes.filter((n: any) => n.runtime?.id === "look")).toHaveLength(1);
  app.dispose();
});
