import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import type { ContactMaskFrame, ContactMaskVariant } from "./receipts-harness";
import { emitFile, gitSha, logMetrics, openHarness, receiptRenderer, renderContactMask, rendererString, sha256 } from "./receipts-lib";

/**
 * "Effect absent" must not change a frame (PRD beat-three.js part 2, section 2.3: "When absent, behaviour is unchanged").
 *
 * Every shadow-receiving forward program gained the mask uniform and sampler in WP-4, and the contact-shadow contributor
 * moved phases, so the claim needs pixels, not GLSL string checks. The frames below have no contactShadows node at all
 * (production quality profile, the renderer's default output route). Their PNG hashes are compared with hashes recorded
 * from the build before WP-4 (git 3708b67ac, `docs: tidy part 2 PRD references`) by running THIS spec there:
 * when `tests/browser/contact-shadow-absent-baseline.json` does not exist the spec records it instead of
 * comparing, which is how the baseline was produced on the pre-WP-4 tree. The renderer must match too, because
 * SwiftShader and a real GPU do not produce the same bytes.
 */

const BASELINE_PATH = "tests/browser/contact-shadow-absent-baseline.json";
const IDS: readonly ContactMaskVariant[] = ["cm-absent-nocast", "cm-absent-shadowed", "cm-absent-spot"];

interface Baseline {
  readonly recordedAtGitSha: string;
  readonly note: string;
  readonly renderer: string;
  readonly frames: Readonly<Record<string, { readonly sha256: string; readonly meanLuma: number; readonly drawCalls: number; readonly actualPasses: readonly string[]; readonly contactPassExecuted: boolean }>>;
}

test.describe("contact shadows: effect absent leaves frames unchanged", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;
  let page: Page;
  let renderer = "";
  const frames = new Map<ContactMaskVariant, ContactMaskFrame>();

  test.beforeAll(async ({ browser }) => {
    server = await startExampleDevServer();
    page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    await openHarness(page, server.origin);
    renderer = receiptRenderer(await rendererString(page));
    for (const id of IDS) frames.set(id, await renderContactMask(page, id));
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  const hashOf = (id: ContactMaskVariant): string => sha256(Buffer.from(frames.get(id)!.pngBase64, "base64"));

  test("absent-effect frames render with no contact-shadow mask fed to shading", () => {
    for (const id of IDS) {
      const frame = frames.get(id)!;
      logMetrics(id, { sha256: hashOf(id), metrics: frame.metrics, diagnostics: frame.diagnostics, contactShadows: frame.contactShadows });
      expect(frame.diagnostics.errors, id).toEqual([]);
      expect(frame.metrics.nonBlackRatio, id).toBeGreaterThan(0.1);
      // Nothing feeds the mask to shading when the scene did not ask for it.
      expect(frame.contactShadows?.probe?.publishedToShading ?? false, id).toBe(false);
    }
  });

  test("hashes match the build before WP-4 (or record them when run on that build)", () => {
    const current: Baseline["frames"] = Object.fromEntries(IDS.map((id) => {
      const frame = frames.get(id)!;
      return [id, { sha256: hashOf(id), meanLuma: frame.metrics.meanLuma, drawCalls: frame.diagnostics.drawCalls, actualPasses: frame.diagnostics.actualPasses, contactPassExecuted: frame.contactShadows?.passExecuted ?? false }];
    }));
    if (!existsSync(BASELINE_PATH)) {
      const recorded: Baseline = {
        recordedAtGitSha: gitSha(),
        note: "Frames with no contactShadows node, recorded by tests/browser/contact-shadow-absent.spec.ts on the tree named in recordedAtGitSha. Later builds must reproduce these hashes.",
        renderer,
        frames: current
      };
      emitFile(BASELINE_PATH, Buffer.from(`${JSON.stringify(recorded, null, 2)}\n`, "utf8"));
      logMetrics("cm-absent-baseline-recorded", recorded);
      return;
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
    expect(renderer, "baseline and this run must use the same renderer").toBe(baseline.renderer);
    const differences: Record<string, { baseline: string; current: string }> = {};
    for (const id of IDS) {
      const expected = baseline.frames[id];
      expect(expected, `baseline has ${id}`).toBeDefined();
      if (expected!.sha256 !== current[id]!.sha256) differences[id] = { baseline: expected!.sha256, current: current[id]!.sha256 };
      // Draw count and pass list are part of "unchanged" too (the contributor moved phases).
      expect(current[id]!.drawCalls, `${id} draw calls`).toBe(expected!.drawCalls);
      expect(current[id]!.actualPasses, `${id} passes`).toEqual(expected!.actualPasses);
      // The contact pass must still run exactly when it ran before (it is tier-gated, and the tier is high unless A3D_QR_TIERS is on).
      expect(current[id]!.contactPassExecuted, `${id} contact pass executed`).toBe(expected!.contactPassExecuted);
    }
    expect(differences, "frames whose bytes differ from the pre-WP-4 build").toEqual({});
  });
});
