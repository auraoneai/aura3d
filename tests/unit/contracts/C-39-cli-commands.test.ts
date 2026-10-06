import { describe, expect, it } from "vitest";
import { registerCliCommand, cliCommandFor } from "@aura3d/cli/contracts";

describe("C-39 cli command registry", () => {
  it("register + lookup; duplicate name throws", () => {
    const cmd = { name: "test qr0", owner: "prd15", summary: "t", usage: "test", run: async () => 0 };
    registerCliCommand(cmd);
    expect(cliCommandFor("test qr0")).toBe(cmd);
    expect(() => registerCliCommand({ ...cmd })).toThrow(/CLI_COMMAND_DUPLICATE/);
  });
});
