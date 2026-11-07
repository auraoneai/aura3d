/**
 * R-02 (React embedding): compiler audit evidence is per app. An embedded app (`routeState: false`) never
 * writes `__A3D_SHADOW_TAP_TIER__` / `__A3D_DENSE_SHADOW_CAP__` / `__A3D_SHADOW_PROXIES__` to the page,
 * two apps with different settings keep separate values, a publishing app mirrors the historical globals
 * only while it is alive, and nothing `__A3D*` / `__AURA*` is left once every app is disposed.
 */
import { afterEach, describe, expect, it } from "vitest";
import { appendCompileEvidence, COMPILE_EVIDENCE_GLOBALS, registerCompileEvidence, setCompileEvidence, withCompileEvidence } from "../../../packages/engine/src/agent-api/compiler/compileEvidence";
import { resolveShadowSystemConfig } from "../../../packages/engine/src/agent-api/compiler/shadows";
import { createProductionPrimitiveResources } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { qrPrimitiveGeometryOptions, QrPrimitiveGeometryPool } from "../../../packages/engine/src/agent-api/compiler/geometry";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { clearPageEvidenceWithoutPublishers, registerAuraApp, unregisterAuraApp } from "../../../packages/engine/src/agent-api/app/liveApps";
import { createAuraApp } from "../../../packages/engine/src/agent-api/app/createAuraApp";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraPrimitiveNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const page = globalThis as unknown as Record<string, unknown>;
const engineGlobals = (): string[] => Object.keys(page).filter((key) => /^__(A3D|AURA)/.test(key));
const descriptors = [{ shadowRequested: true }];
const snapshot = { nodes: [] } as unknown as AuraSceneSnapshot;
const denseSpheres = (count: number): AuraPrimitiveNode => ({
  kind: "primitive", primitive: "sphere", castShadow: true,
  instances: Array.from({ length: count }, (_, i) => ({ position: [i, 0, 0] as [number, number, number] }))
}) as unknown as AuraPrimitiveNode;
const core = () => ({ ...qrPrimitiveGeometryOptions(resolveQrFlags({ options: ["core"] }), undefined, {})!, pool: new QrPrimitiveGeometryPool() });

afterEach(() => {
  for (const key of COMPILE_EVIDENCE_GLOBALS) delete page[key];
  delete page.__AURA3D_LIVE_APPS__;
});

describe("compile evidence is per app (R-02)", () => {
  it("standalone compiler calls keep the historical page-global write", () => {
    resolveShadowSystemConfig(snapshot, descriptors, "low");
    expect(page.__A3D_SHADOW_TAP_TIER__).toMatchObject({ quality: "low" });
  });

  it("two embedded apps with different settings record separately and never touch the page", () => {
    const ownerA = {};
    const ownerB = {};
    const a = registerCompileEvidence(ownerA, { publish: false });
    const b = registerCompileEvidence(ownerB, { publish: false });
    withCompileEvidence(ownerA, () => resolveShadowSystemConfig(snapshot, descriptors, "low"));
    withCompileEvidence(ownerB, () => resolveShadowSystemConfig(snapshot, descriptors, "ultra"));
    withCompileEvidence(ownerB, () => createProductionPrimitiveResources(denseSpheres(2000), core()));
    expect(a.read().__A3D_SHADOW_TAP_TIER__).toMatchObject({ quality: "low" });
    expect(b.read().__A3D_SHADOW_TAP_TIER__).toMatchObject({ quality: "ultra" });
    expect(a.read().__A3D_SHADOW_PROXIES__).toBeUndefined();
    expect(b.read().__A3D_SHADOW_PROXIES__).toHaveLength(1);
    expect(engineGlobals()).toEqual([]);
    a.release();
    b.release();
    expect(a.read()).toEqual({});
  });

  it("a nested standalone-keyed call inside an app compile still records to that app", () => {
    const owner = {};
    const evidence = registerCompileEvidence(owner, { publish: false });
    withCompileEvidence(owner, () => withCompileEvidence({ unregisteredCanvas: true }, () => setCompileEvidence("__A3D_DENSE_SHADOW_CAP__", { cascades: 2 })));
    expect(evidence.read().__A3D_DENSE_SHADOW_CAP__).toEqual({ cascades: 2 });
    expect(engineGlobals()).toEqual([]);
    evidence.release();
  });

  it("a released app drops late async compiles instead of falling back to the page", () => {
    const owner = {};
    const evidence = registerCompileEvidence(owner, { publish: false });
    evidence.release();
    withCompileEvidence(owner, () => {
      setCompileEvidence("__A3D_SHADOW_TAP_TIER__", { tier: 8 });
      appendCompileEvidence("__A3D_SHADOW_PROXIES__", { node: "late" });
    });
    expect(evidence.read()).toEqual({});
    expect(engineGlobals()).toEqual([]);
  });

  it("a publishing app mirrors the globals while alive; they leave with the last publishing app", () => {
    const owner = {};
    const evidence = registerCompileEvidence(owner, { publish: true });
    const app = { name: "route" } as never;
    withCompileEvidence(owner, () => resolveShadowSystemConfig(snapshot, descriptors, "medium"));
    registerAuraApp(app);
    expect(page.__A3D_SHADOW_TAP_TIER__).toMatchObject({ quality: "medium" });
    expect(evidence.read().__A3D_SHADOW_TAP_TIER__).toEqual(page.__A3D_SHADOW_TAP_TIER__);
    evidence.release();
    unregisterAuraApp(app);
    expect(engineGlobals()).toEqual([]);
  });

  it("a publishing app that fails startup before registering removes what it mirrored", () => {
    const owner = {};
    const evidence = registerCompileEvidence(owner, { publish: true });
    withCompileEvidence(owner, () => resolveShadowSystemConfig(snapshot, descriptors, "high"));
    expect(page.__A3D_SHADOW_TAP_TIER__).toBeDefined();
    evidence.release();
    clearPageEvidenceWithoutPublishers();
    expect(engineGlobals()).toEqual([]);
  });

  it("real apps: two embedded and one publishing app expose compileEvidence and leave no __A3D*/__AURA* globals after dispose", () => {
    const before = engineGlobals();
    expect(before).toEqual([]);
    const embeddedA = createAuraApp(null, { scene: scene(), autoStart: false, routeState: false });
    const embeddedB = createAuraApp(null, { scene: scene(), autoStart: false, routeState: false, renderer: { quality: "low" } });
    expect(engineGlobals()).toEqual([]);
    expect(typeof embeddedA.compileEvidence).toBe("function");
    expect(embeddedA.compileEvidence!()).toEqual({});
    const route = createAuraApp(null, { scene: scene(), autoStart: false });
    expect(page.__AURA3D_LIVE_APPS__).toBeDefined();
    embeddedA.dispose();
    embeddedB.dispose();
    route.dispose();
    expect(engineGlobals()).toEqual([]);
  });
});
