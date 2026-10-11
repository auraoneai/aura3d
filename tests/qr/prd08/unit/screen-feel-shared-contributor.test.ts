/**
 * Two live feel buses (two flag-on apps) share one `prd08.screenFeel` frame
 * contributor. The registry rejects duplicate ids, so registering one per bus
 * threw REGISTRY_DUPLICATE:prd08.screenFeel from the second createAuraApp.
 */
import { describe, expect, it } from "vitest";
import { createAuraFeelBus } from "../../../../packages/engine/src/agent-api/feel/extension.js";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index.js";
import { frameContributors } from "../../../../packages/rendering/src/contracts/frameGraph.js";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags.js";

const fakeApp = () => ({
  scene: { nodes: [] },
  nodes: { all: () => [], get: () => undefined },
  onFrame: () => () => {}
}) as unknown as AuraApp;

const flags = resolveQrFlags({ options: ["camera"], env: {} });
const screenFeel = () => frameContributors(flags).filter((c) => c.id === "prd08.screenFeel");

describe("prd08.screenFeel shared contributor", () => {
  it("registers once for two buses and unregisters after the last disposes", () => {
    const a = createAuraFeelBus(fakeApp()) as unknown as { dispose(): void };
    const b = createAuraFeelBus(fakeApp()) as unknown as { dispose(): void };
    expect(screenFeel()).toHaveLength(1);

    const blackboard = new Map<string, unknown>();
    screenFeel()[0]!.collect!([], { flags, blackboard } as never);
    expect(blackboard.has("prd08.screenFeel")).toBe(true);

    a.dispose();
    expect(screenFeel()).toHaveLength(1);
    b.dispose();
    expect(screenFeel()).toHaveLength(0);

    const c = createAuraFeelBus(fakeApp()) as unknown as { dispose(): void };
    expect(screenFeel()).toHaveLength(1);
    c.dispose();
  });
});
