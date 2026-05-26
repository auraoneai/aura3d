import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-editor-prefab-workflow.json";

test.describe("editor prefab reusable object workflow", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("creates, persists, instantiates, and exports a reusable prefab", async ({ page }) => {
    await page.goto(`${server.origin}/apps/editor/index.html`, { waitUntil: "domcontentloaded" });
    await waitForEditor(page);

    await page.getByRole("button", { name: "Prefab from Selection" }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().prefabCount)).toBe(1);

    const prefab = await page.evaluate(() => window.__AURA3D_EDITOR_APP__!.shell.project.prefabs[0]);
    expect(prefab).toMatchObject({
      schemaVersion: "aura3d-prefab",
      name: "Hero Cube Prefab",
      rootNodeId: "node-hero",
      sourceNodeId: "node-hero"
    });
    expect(prefab?.nodes.map((node) => node.name)).toEqual(["Hero Cube", "Imported Placeholder"]);

    await page.getByRole("button", { name: "Instantiate Prefab" }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().nodeCount)).toBe(4);
    const instantiatedNodes = await page.evaluate(() => {
      return window.__AURA3D_EDITOR_APP__!.shell.project.scene.nodes
        .filter((node) => node.name.endsWith(" Instance"))
        .map((node) => ({ id: node.id, name: node.name, parentId: node.parentId, x: node.transform.position[0] }));
    });
    expect(instantiatedNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Hero Cube Instance", parentId: null, x: 0.75 }),
      expect.objectContaining({ name: "Imported Placeholder Instance" })
    ]));
    expect(instantiatedNodes.find((node) => node.name === "Imported Placeholder Instance")?.parentId).toBe(
      instantiatedNodes.find((node) => node.name === "Hero Cube Instance")?.id
    );

    await page.getByRole("button", { name: "Save", exact: true }).click();
    const savedProjectJson = await page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().savedProjectJson);
    expect(savedProjectJson).toContain('"prefabs"');
    expect(savedProjectJson).toContain('"aura3d-prefab"');

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    await page.locator('[data-role="project-buffer"]').evaluate((element: HTMLTextAreaElement, value) => {
      element.value = value;
    }, savedProjectJson);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().prefabCount)).toBe(1);
    await expect(page.getByRole("button", { name: "Hero Cube Instance" })).toBeVisible();

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_EDITOR_APP__!.getState().exportedFileCount)).toBe(3);
    const exportedProject = await page.evaluate(() => {
      const projectFile = window.__AURA3D_EDITOR_APP__!.shell.exportedFiles().find((file) => file.path === "project.json");
      return projectFile ? JSON.parse(projectFile.content) as { readonly prefabs: readonly unknown[]; readonly scene: { readonly nodes: readonly unknown[] } } : undefined;
    });
    expect(exportedProject?.prefabs).toHaveLength(1);
    expect(exportedProject?.scene.nodes).toHaveLength(4);

    writeEditorReport({
      prefabId: prefab!.id,
      prefabNodeCount: prefab!.nodes.length,
      exportedNodeCount: exportedProject!.scene.nodes.length
    });
  });
});

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__AURA3D_EDITOR_APP__?.getState().status === "ready", undefined, { timeout: 15_000 });
}

function writeEditorReport(evidence: { readonly prefabId: string; readonly prefabNodeCount: number; readonly exportedNodeCount: number }): void {
  const existing = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown> : {};
  const checks = Array.isArray(existing.checks) ? existing.checks.filter((check) => {
    return !(typeof check === "object" && check !== null && (check as { id?: unknown }).id === "editor-prefab-reusable-object-format");
  }) : [];
  const next = {
    ...existing,
    ok: true,
    generatedAt: new Date().toISOString(),
    schemaVersion: "a3d-external-parity-editor-prefab-workflow-report",
    subsystem: "browser-editor-authoring",
    command: "pnpm exec playwright test tests/browser/editor-prefab-workflow.spec.ts",
    checks: [
      ...checks,
      {
        id: "editor-prefab-reusable-object-format",
        description: "Editor can create a reusable prefab from a hierarchy subtree, persist it in project JSON, instantiate it, and include it in static export project data.",
        passed: true,
        evidencePaths: [
          "packages/editor-runtime/src/PrefabRegistry.ts",
          "apps/editor/src/EditorShell.ts",
          "tests/browser/editor-prefab-workflow.spec.ts"
        ],
        metrics: evidence
      }
    ]
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(next, null, 2)}\n`);
}

declare global {
  interface Window {
    __AURA3D_EDITOR_APP__?: {
      getState(): {
        readonly status: "booting" | "ready" | "error";
        readonly nodeCount: number;
        readonly prefabCount: number;
        readonly savedProjectJson: string;
        readonly exportedFileCount: number;
      };
      readonly shell: {
        readonly project: {
          readonly prefabs: readonly {
            readonly id: string;
            readonly schemaVersion: string;
            readonly name: string;
            readonly rootNodeId: string;
            readonly sourceNodeId?: string;
            readonly nodes: readonly {
              readonly id: string;
              readonly name: string;
            }[];
          }[];
          readonly scene: {
            readonly nodes: readonly {
              readonly id: string;
              readonly name: string;
              readonly parentId: string | null;
              readonly transform: {
                readonly position: readonly [number, number, number];
              };
            }[];
          };
        };
        exportedFiles(): readonly { readonly path: string; readonly content: string; readonly type: string }[];
      };
    };
  }
}
