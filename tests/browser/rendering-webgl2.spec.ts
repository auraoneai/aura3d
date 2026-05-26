import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("rendering WebGL2 device", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a public Renderer triangle, line segments, points, unlit cube, PBR sphere, lit cube, textured cube, optional texture fallback, normal map, scene morph target, GPU morph target, instanced unlit and PBR triangles, emissive/environment materials, point/spot light attenuation, GPU buffer readback, and render target readback", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgl2-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_RENDERING_TEST__?.status === "ready" || window.__AURA3D_RENDERING_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_RENDERING_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.diagnostics?.drawCalls).toBe(1);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.lineDiagnostics?.drawCalls).toBe(1);
    expect(result?.lineDiagnostics?.lastError).toBeNull();
    expect(result?.pointDiagnostics?.drawCalls).toBe(1);
    expect(result?.pointDiagnostics?.lastError).toBeNull();
    expect(result?.cubeDiagnostics?.drawCalls).toBe(1);
    expect(result?.cubeDiagnostics?.lastError).toBeNull();
    expect(result?.pbrDiagnostics?.drawCalls).toBe(1);
    expect(result?.pbrDiagnostics?.lastError, JSON.stringify({
      pbrDiagnostics: result?.pbrDiagnostics,
      pbrCenterPixel: result?.pbrCenterPixel
    }, null, 2)).toBeNull();
    expect(result?.pbrSphereDiagnostics?.drawCalls).toBe(1);
    expect(result?.pbrSphereDiagnostics?.lastError).toBeNull();
    expect(result?.litCubeDiagnostics?.drawCalls).toBe(1);
    expect(result?.litCubeDiagnostics?.lastError).toBeNull();
    expect(result?.texturedCubeDiagnostics?.drawCalls).toBe(1);
    expect(result?.texturedCubeDiagnostics?.lastError).toBeNull();
    expect(result?.texturedPbrNoTangentDiagnostics?.drawCalls).toBe(1);
    expect(result?.texturedPbrNoTangentDiagnostics?.lastError).toBeNull();
    expect(result?.textureFallbackDiagnostics?.drawCalls).toBe(1);
    expect(result?.textureFallbackDiagnostics?.lastError).toBeNull();
    expect(result?.normalMapDiagnostics?.drawCalls).toBe(1);
    expect(result?.normalMapDiagnostics?.lastError).toBeNull();
    expect(result?.morphSceneDiagnostics?.drawCalls).toBe(1);
    expect(result?.morphSceneDiagnostics?.lastError).toBeNull();
    expect(result?.gpuMorphSceneDiagnostics?.drawCalls).toBe(1);
    expect(result?.gpuMorphSceneDiagnostics?.lastError).toBeNull();
    expect(result?.instancedDiagnostics?.drawCalls).toBe(1);
    expect(result?.instancedDiagnostics?.lastError).toBeNull();
    expect(result?.instancedPbrDiagnostics?.drawCalls).toBe(1);
    expect(result?.instancedPbrDiagnostics?.lastError).toBeNull();
    expect(result?.emissiveDiagnostics?.drawCalls).toBe(1);
    expect(result?.emissiveDiagnostics?.lastError).toBeNull();
    expect(result?.environmentDiagnostics?.drawCalls).toBe(1);
    expect(result?.environmentDiagnostics?.lastError).toBeNull();
    expect(result?.localLightDiagnostics?.drawCalls).toBe(1);
    expect(result?.localLightDiagnostics?.lastError).toBeNull();
    expect(result?.outOfRangeDiagnostics?.drawCalls).toBe(1);
    expect(result?.outOfRangeDiagnostics?.lastError).toBeNull();
    expect(result?.shadowMapDiagnostics?.drawCalls).toBe(2);
    expect(result?.shadowMapDiagnostics?.lastError).toBeNull();
    expect(result?.bufferReadback).toEqual([1, 2, 3, 4]);
    expect(result?.renderTargetReadback).toEqual([51, 153, 26, 255]);
    if (result?.hdrRenderTargetReadback) {
      expect(result.hdrRenderTargetFormat).toBe("rgba16f");
      expect(result.hdrRenderTargetReadback[0]).toBeGreaterThan(2);
      expect(result.hdrRenderTargetReadback[1]).toBeGreaterThan(0.45);
      expect(result.hdrRenderTargetReadback[2]).toBeGreaterThan(0.1);
      expect(result.hdrRenderTargetReadback[3]).toBe(1);
    }
    const [pdr = 0, pdg = 0, pdb = 0, pda = 0] = result?.postprocessDepthPixel ?? [];
    expect(pdg).toBeGreaterThan(pdr + 80);
    expect(pdg).toBeGreaterThan(pdb + 40);
    expect(pda).toBe(255);
    expect(result?.renderTargetViewport).toEqual({ width: 16, height: 16, target: "browser-offscreen-target" });
    expect(result?.backbufferViewportAfterTarget).toEqual({ width: 64, height: 64, target: null });
    expect(result?.renderTargetDiagnostics?.renderTargets).toBe(1);
    expect(result?.renderTargetDiagnostics?.lastError).toBeNull();
    expect(result?.renderTargetAfterDispose?.renderTargets).toBe(0);
    if (result?.contextLoss?.supported) {
      expect(result.contextLoss.contextLost).toBe(true);
      expect(result.contextLoss.lastError).toBe("CONTEXT_LOST");
      expect(result.contextLoss.thrownCode).toBe("CONTEXT_LOST");
    }

    const [r = 0, g = 0, b = 0, a = 0] = result?.centerPixel ?? [];
    expect(r).toBeGreaterThan(180);
    expect(g).toBeGreaterThan(10);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(50);
    expect(a).toBe(255);

    const [lr0 = 0, lg0 = 0, lb0 = 0, la0 = 0] = result?.linePixel ?? [];
    expect(lr0).toBeGreaterThan(180);
    expect(lg0).toBeGreaterThan(15);
    expect(lg0).toBeLessThan(90);
    expect(lb0).toBeLessThan(40);
    expect(la0).toBe(255);

    const [ptr = 255, ptg = 0, ptb = 0, pta = 0] = result?.pointPixel ?? [];
    expect(ptr).toBeLessThan(50);
    expect(ptg).toBeGreaterThan(150);
    expect(ptb).toBeGreaterThan(180);
    expect(pta).toBe(255);

    const [ur = 0, ug = 0, ub = 0, ua = 0] = result?.cubePixel ?? [];
    expect(ur).toBeLessThan(80);
    expect(ug).toBeGreaterThan(90);
    expect(ub).toBeGreaterThan(180);
    expect(ua).toBe(255);

    const [pr = 0, pg = 0, pb = 0, pa = 0] = result?.pbrCenterPixel ?? [];
    expect(pr).toBeGreaterThan(80);
    expect(pg).toBeGreaterThan(55);
    expect(pb).toBeGreaterThan(35);
    expect(pr).toBeGreaterThan(pg);
    expect(pg).toBeGreaterThan(pb);
    expect(pa).toBe(255);

    const [sr = 0, sg = 0, sb = 0, sa = 0] = result?.pbrSphereCenterPixel ?? [];
    const [rr = 0, rg = 0, rb = 0, ra = 0] = result?.pbrSphereRimPixel ?? [];
    expect(sr).toBeGreaterThan(50);
    expect(sg).toBeGreaterThan(45);
    expect(sb).toBeGreaterThan(30);
    expect(sa).toBe(255);
    expect(sr + sg + sb).toBeGreaterThan(rr + rg + rb + 80);
    expect(ra).toBe(255);

    const [cbr = 0, cbg = 0, cbb = 0, cba = 0] = result?.litCubePixel ?? [];
    expect(cbr).toBeGreaterThan(35);
    expect(cbg).toBeGreaterThan(45);
    expect(cbb).toBeGreaterThan(50);
    expect(cba).toBe(255);

    const [tr = 0, tg = 0, tb = 0, ta = 0] = result?.texturedCubePixel ?? [];
    expect(tr).toBeLessThan(80);
    expect(tg).toBeGreaterThan(160);
    expect(tb).toBeGreaterThan(25);
    expect(tb).toBeLessThan(90);
    expect(ta).toBe(255);

    const [ntr = 0, ntg = 0, ntb = 0, nta = 0] = result?.texturedPbrNoTangentPixel ?? [];
    expect(ntr).toBeGreaterThan(90);
    expect(ntg).toBeGreaterThan(35);
    expect(ntb).toBeLessThan(90);
    expect(nta).toBe(255);

    const [fr = 0, fg = 0, fb = 0, fa = 0] = result?.textureFallbackPixel ?? [];
    expect(fr).toBeGreaterThan(90);
    expect(fr).toBeLessThan(140);
    expect(fg).toBeGreaterThan(45);
    expect(fg).toBeLessThan(90);
    expect(fb).toBeGreaterThan(160);
    expect(fa).toBe(255);

    const [nr = 0, ng = 0, nb = 0, na = 0] = result?.normalMapPixel ?? [];
    expect(nr).toBeGreaterThan(25);
    expect(ng).toBeGreaterThan(30);
    expect(nb).toBeGreaterThan(45);
    expect(na).toBe(255);

    const [mr = 0, mg = 0, mb = 0, ma = 0] = result?.morphScenePixel ?? [];
    expect(mr).toBeGreaterThan(150);
    expect(mg).toBeLessThan(80);
    expect(mb).toBeGreaterThan(120);
    expect(ma).toBe(255);

    const [gmr = 0, gmg = 0, gmb = 0, gma = 0] = result?.gpuMorphScenePixel ?? [];
    expect(gmr).toBeLessThan(80);
    expect(gmg).toBeGreaterThan(150);
    expect(gmb).toBeGreaterThan(120);
    expect(gma).toBe(255);

    const [ilr = 0, ilg = 0, ilb = 0, ila = 0] = result?.instancedLeftPixel ?? [];
    const [irr = 0, irg = 0, irb = 0, ira = 0] = result?.instancedRightPixel ?? [];
    expect(ilr).toBeGreaterThan(160);
    expect(ilg).toBeGreaterThan(35);
    expect(ilg).toBeLessThan(100);
    expect(ilb).toBeLessThan(60);
    expect(ila).toBe(255);
    expect(irr).toBeGreaterThan(160);
    expect(irg).toBeGreaterThan(35);
    expect(irg).toBeLessThan(100);
    expect(irb).toBeLessThan(60);
    expect(ira).toBe(255);

    const [ipr = 0, ipg = 0, ipb = 0, ipa = 0] = result?.instancedPbrLeftPixel ?? [];
    const [jpr = 0, jpg = 0, jpb = 0, jpa = 0] = result?.instancedPbrRightPixel ?? [];
    expect(ipr).toBeGreaterThan(120);
    expect(ipg).toBeGreaterThan(ipr + 20);
    expect(ipb).toBeGreaterThan(ipr + 20);
    expect(ipa).toBe(255);
    expect(jpr).toBeGreaterThan(120);
    expect(jpg).toBeGreaterThan(jpr + 20);
    expect(jpb).toBeGreaterThan(jpr + 20);
    expect(jpa).toBe(255);

    const [er = 0, eg = 0, eb = 0, ea = 0] = result?.emissivePixel ?? [];
    expect(eg).toBeGreaterThan(er + 35);
    expect(eg).toBeGreaterThan(eb + 30);
    expect(ea).toBe(255);

    const [envR = 0, envG = 0, envB = 0, envA = 0] = result?.environmentPixel ?? [];
    expect(envB).toBeGreaterThan(envG);
    expect(envG).toBeGreaterThan(envR);
    expect(envB).toBeGreaterThan(90);
    expect(envA).toBe(255);

    const [lr = 0, lg = 0, lb = 0, la = 0] = result?.localLightPixel ?? [];
    const [or = 0, og = 0, ob = 0, oa = 0] = result?.outOfRangePixel ?? [];
    expect(lr + lg + lb).toBeGreaterThan(or + og + ob + 180);
    expect(lr).toBeGreaterThan(80);
    expect(lg).toBeGreaterThan(80);
    expect(lb).toBeGreaterThan(60);
    expect(la).toBe(255);
    expect(or).toBeLessThan(40);
    expect(og).toBeLessThan(40);
    expect(ob).toBeLessThan(40);
    expect(oa).toBe(255);

    const [shr = 0, shg = 0, shb = 0, sha = 0] = result?.shadowedReceiverPixel ?? [];
    const [lir = 0, lig = 0, lib = 0, lia = 0] = result?.litReceiverPixel ?? [];
    expect(lir + lig + lib).toBeGreaterThan(shr + shg + shb + 80);
    expect(lir).toBeGreaterThan(70);
    expect(lig).toBeGreaterThan(70);
    expect(lib).toBeGreaterThan(70);
    expect(sha).toBe(255);
    expect(lia).toBe(255);
  });
});

declare global {
  interface Window {
    __AURA3D_RENDERING_TEST__?: {
      readonly status: "ready" | "error";
      readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly lineDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly cubeDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly pbrDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly pbrSphereDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly litCubeDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly texturedCubeDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly texturedPbrNoTangentDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly textureFallbackDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly normalMapDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly morphSceneDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly instancedDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly instancedPbrDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly emissiveDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly environmentDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly localLightDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly outOfRangeDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly shadowMapDiagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
      readonly centerPixel?: readonly number[];
      readonly linePixel?: readonly number[];
      readonly cubePixel?: readonly number[];
      readonly pbrCenterPixel?: readonly number[];
      readonly pbrSphereCenterPixel?: readonly number[];
      readonly pbrSphereRimPixel?: readonly number[];
      readonly litCubePixel?: readonly number[];
      readonly texturedCubePixel?: readonly number[];
      readonly texturedPbrNoTangentPixel?: readonly number[];
      readonly textureFallbackPixel?: readonly number[];
      readonly normalMapPixel?: readonly number[];
      readonly morphScenePixel?: readonly number[];
      readonly gpuMorphScenePixel?: readonly number[];
      readonly instancedLeftPixel?: readonly number[];
      readonly instancedRightPixel?: readonly number[];
      readonly instancedPbrLeftPixel?: readonly number[];
      readonly instancedPbrRightPixel?: readonly number[];
      readonly emissivePixel?: readonly number[];
      readonly environmentPixel?: readonly number[];
      readonly localLightPixel?: readonly number[];
      readonly outOfRangePixel?: readonly number[];
      readonly shadowedReceiverPixel?: readonly number[];
      readonly litReceiverPixel?: readonly number[];
      readonly bufferReadback?: readonly number[];
      readonly renderTargetReadback?: readonly number[];
      readonly postprocessDepthPixel?: readonly number[];
      readonly renderTargetViewport?: { readonly width: number; readonly height: number; readonly target: string | null };
      readonly backbufferViewportAfterTarget?: { readonly width: number; readonly height: number; readonly target: string | null };
      readonly renderTargetDiagnostics?: { readonly renderTargets?: number; readonly lastError: string | null };
      readonly renderTargetAfterDispose?: { readonly renderTargets?: number };
      readonly contextLoss?: {
        readonly supported: boolean;
        readonly contextLost: boolean;
        readonly lastError: string | null;
        readonly thrownCode?: string;
      };
      readonly error?: string;
    };
  }
}
