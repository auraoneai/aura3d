/** Idol wow pass (FIRST-SECONDS.md): boot settles programs, the HDRI and the Idol texture upgrades before the menu goes live. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Ion Circuit Idol start", () => {
  it("awaits warmPrograms after the mount and before `ready`, the loading screen and the start button", () => {
    const src = readFileSync("examples/heatsink-port/main.ts", "utf8");
    const boot = src.slice(src.indexOf("async function boot()"));
    const warm = boot.indexOf("await warmPrograms(app");
    expect(warm, "boot awaits warmPrograms").toBeGreaterThan(boot.indexOf("app.ready()"));
    expect(warm).toBeLessThan(boot.indexOf("ready = true"));
    expect(warm).toBeLessThan(boot.indexOf("el.loading.classList.add(\"hidden\")"));
    expect(warm).toBeLessThan(boot.indexOf("begin()"));
    expect(boot.slice(warm, boot.indexOf(";", warm))).not.toMatch(/waitFor(Environment|Textures): false/);
  });
});
