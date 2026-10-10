import { expect, test, type Page } from "@playwright/test";
import { startPrd13DevServer, type ExampleDevServer } from "../dev-server";

// PRD-13 §17.2 — looks expansion, all 15 look presets (13-SPECS).
//
// Scene: `scene().add(looks.preset(id)).add(model(DamagedHelmet))` + ground +
// authored camera, mounted with `a3d-qr=looks` so the C-31 `look` section is
// populated. Every cell asserts; nothing is skipped or fixme'd.
//
// Per cell:
//  - v0: the `aura-look:<id>` group carries the documented §7.1.1 node set
//    (table below), the `look` section reports this id with the v0 expansion,
//    and lookLint on the mounted snapshot has zero findings.
//  - v1 (forced): the authored node is the AuraLookNode; the section reports
//    this id; while any v1 contract is missing the lint must carry
//    `look/expansion-mismatch` (never a silent clean), and once none is
//    missing it must be clean.
//  - pixels: non-void background (luma ≥ 0.06, the §7.1 preset floor, except
//    backgroundException looks), HDRI chain `ready` for HDRI looks, centre
//    luma variance above the broken IBL-off control, and the ground darker
//    than the shadow-off control. The controls are the calibration §17.2 asks
//    for: each threshold is "beats the broken control", not a tuned constant.

type HdriFile = "autumn_field_puresky_1k" | "kloppenheim_06_puresky_1k" | "studio_small_08_1k";

interface DocumentedLook {
  readonly hdri: HdriFile | null;
  readonly rim: boolean;
  readonly fog: boolean;
  readonly backgroundException: boolean;
}

// §7.1.1 documented v0 expansion (lookPresets.ts). Asserted in-page against
// looks.list() so a rename fails loudly instead of shrinking coverage.
const DOCUMENTED: Readonly<Record<string, DocumentedLook>> = {
  "outdoor-day": { hdri: "autumn_field_puresky_1k", rim: false, fog: true, backgroundException: false },
  "golden-hour": { hdri: "kloppenheim_06_puresky_1k", rim: false, fog: true, backgroundException: false },
  overcast: { hdri: "autumn_field_puresky_1k", rim: false, fog: true, backgroundException: false },
  "night-city": { hdri: null, rim: false, fog: true, backgroundException: true },
  "polar-night": { hdri: null, rim: false, fog: true, backgroundException: true },
  "alpine-snow": { hdri: "autumn_field_puresky_1k", rim: false, fog: true, backgroundException: false },
  "interior-warm": { hdri: "studio_small_08_1k", rim: false, fog: false, backgroundException: true },
  "interior-neutral": { hdri: "studio_small_08_1k", rim: false, fog: false, backgroundException: true },
  "interior-industrial": { hdri: "studio_small_08_1k", rim: false, fog: false, backgroundException: true },
  space: { hdri: null, rim: false, fog: false, backgroundException: true },
  underwater: { hdri: null, rim: false, fog: true, backgroundException: true },
  "product-studio": { hdri: "studio_small_08_1k", rim: false, fog: false, backgroundException: false },
  "character-showcase": { hdri: "studio_small_08_1k", rim: true, fog: false, backgroundException: false },
  "arena-fight": { hdri: "studio_small_08_1k", rim: true, fog: false, backgroundException: false },
  "neon-arcade": { hdri: null, rim: false, fog: true, backgroundException: false }
};
const LOOK_IDS = Object.keys(DOCUMENTED);

/** Ordered kind:detail signature of the documented v0 children. */
function documentedSignature(look: DocumentedLook): string[] {
  return [
    ...(look.hdri ? ["environment:hdri"] : []),
    "light:directional+shadow",
    ...(look.rim ? ["light:directional"] : []),
    ...(look.fog ? ["effect:fog"] : []),
    "effect:color-grade",
    "effect:ambient-occlusion",
    "effect:bloom"
  ];
}

interface NodeSummary { kind: string; name?: string; detail?: string; shadow?: boolean; textureUrl?: string }
interface LintFinding { code: string; severity: string; message: string }
interface LookSection { id: string | null; expansion: string; missingContracts: string[]; lint: LintFinding[] }
interface FrameMetrics { backgroundLuma: number; centreLumaStdDev: number; groundLuma: number; dataUrl: string }
interface HarnessPayload {
  look: string;
  listed: string[];
  authored: { kind: string; name: string | null; look: string | null } | null;
  children: NodeSummary[];
  hdriStatus: string;
  frame: FrameMetrics;
  diagnostics: { errors: string[]; drawCalls: number | null; look: LookSection | null };
}

async function loadCell(page: Page, origin: string, query: string): Promise<HarnessPayload> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/tests/qr/prd13/harness/looks-expansion.html?${query}&a3d-qr=looks`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const w = window as { __PRD13_READY__?: unknown; __PRD13_ERROR__?: unknown };
      return w.__PRD13_READY__ !== undefined || w.__PRD13_ERROR__ !== undefined;
    },
    undefined,
    { timeout: 150_000 }
  );
  const error = await page.evaluate(() => (window as { __PRD13_ERROR__?: string }).__PRD13_ERROR__ ?? null);
  expect(error, `harness error for ${query}`).toBeNull();
  expect(pageErrors, `page errors for ${query}`).toEqual([]);
  return (await page.evaluate(() => (window as { __PRD13_READY__?: unknown }).__PRD13_READY__)) as HarnessPayload;
}

const signatureOf = (nodes: readonly NodeSummary[]): string[] =>
  nodes.map((node) => `${node.kind}:${node.detail ?? ""}${node.shadow ? "+shadow" : ""}`);

test.describe("§17.2 looks expansion", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startPrd13DevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  for (const look of LOOK_IDS) {
    test(`${look} @ v0: documented node set, look section populated, lint clean`, async ({ page }) => {
      const cell = await loadCell(page, server.origin, `look=${look}&expansion=v0`);
      expect([...cell.listed].sort(), "looks.list() matches the documented 15").toEqual([...LOOK_IDS].sort());
      expect(cell.authored).toEqual({ kind: "group", name: `aura-look:${look}`, look: null });
      expect(signatureOf(cell.children)).toEqual(documentedSignature(DOCUMENTED[look]));
      const hdri = DOCUMENTED[look].hdri;
      if (hdri !== null) {
        const environment = cell.children.find((node) => node.kind === "environment");
        expect(environment?.textureUrl, "HDRI node points at the §7.1.1 corpus file").toBe(`/hdri/${hdri}.hdr`);
      }
      expect(cell.diagnostics.errors).toEqual([]);
      const section = cell.diagnostics.look;
      expect(section, "diagnostics().look populated under A3D_QR_LOOKS").not.toBeNull();
      expect(section!.id).toBe(look);
      expect(section!.expansion).toBe("v0-current-engine");
      expect(section!.lint, `look lint findings: ${JSON.stringify(section!.lint)}`).toEqual([]);
    });

    test(`${look} @ v1 (forced): AuraLookNode authored, degraded state reported honestly`, async ({ page }) => {
      const cell = await loadCell(page, server.origin, `look=${look}&expansion=v1`);
      expect(cell.authored).toEqual({ kind: "look", name: null, look });
      expect(cell.diagnostics.errors).toEqual([]);
      const section = cell.diagnostics.look;
      expect(section, "diagnostics().look populated under A3D_QR_LOOKS").not.toBeNull();
      expect(section!.id).toBe(look);
      const codes = section!.lint.map((finding) => finding.code);
      if (section!.missingContracts.length === 0) {
        expect(section!.lint, "all v1 contracts provided: lint must be clean").toEqual([]);
      } else {
        expect(codes, `v1 forced with stubs (${section!.missingContracts.join(", ")}) must report the mismatch`).toContain(
          "look/expansion-mismatch"
        );
      }
    });

    test(`${look} pixels: non-void background, IBL beats IBL-off control, shadow beats shadow-off control`, async ({ page }) => {
      const main = await loadCell(page, server.origin, `look=${look}&expansion=v0`);
      const noIbl = await loadCell(page, server.origin, `look=${look}&expansion=v0&control=no-ibl`);
      const noShadow = await loadCell(page, server.origin, `look=${look}&expansion=v0&control=no-shadow`);
      await test.info().attach(`${look}.png`, { body: Buffer.from(main.frame.dataUrl.split(",")[1] ?? "", "base64"), contentType: "image/png" });
      const documented = DOCUMENTED[look];
      expect(main.diagnostics.drawCalls ?? 0).toBeGreaterThan(0);
      expect(main.hdriStatus, "HDRI chain state").toBe(documented.hdri ? "ready" : "none");
      if (!documented.backgroundException) {
        expect(main.frame.backgroundLuma, "background luma ≥ 0.06 (§7.1 preset floor)").toBeGreaterThanOrEqual(0.06);
      }
      expect(main.frame.centreLumaStdDev, "specular: centre luma variance above the IBL-off control").toBeGreaterThan(
        noIbl.frame.centreLumaStdDev
      );
      expect(main.frame.groundLuma, "shadow: ground darker than the shadow-off control").toBeLessThan(noShadow.frame.groundLuma);
    });
  }
});
