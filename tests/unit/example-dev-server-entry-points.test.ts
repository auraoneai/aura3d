import { describe, expect, it } from "vitest";
import { missingPackageEntryPoints } from "../browser/example-dev-server";

// GU47 phase 2: the 4.1.2 release bump rewrote the @probe.gl entry points to `@probe.gl+*@4.1.2` while the lockfile
// installs 4.1.1. Every capture page whose module graph reached @loaders.gl then failed to load and timed out
// waiting for readiness (pips-big-leap, ninja-runner-port). The server only logs missing mappings at startup.
describe("example dev server package entry points", () => {
  it("every mapped package entry point exists in the installed node_modules", () => {
    expect(missingPackageEntryPoints()).toEqual([]);
  });
});
