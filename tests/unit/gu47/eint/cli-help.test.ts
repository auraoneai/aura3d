import { describe, expect, it } from "vitest";
import { mainHelp } from "../../../../packages/aura3d-cli/src/cli-help";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands";
import "../../../../packages/aura3d-cli/src/commands/prd05/index";
import { CERTIFY_CATEGORIES } from "../../../../packages/aura3d-cli/src/commands/assets/certifyCategories";

/**
 * GU47 eint EA-1 + EI-1: the CLI help names E-A's HDRI optimize mode with its real flags (`--file` / `--out` are
 * required, `optimizeHdriUsage`) and every certify category E-I's `certify-game-geometry` accepts.
 */
describe("GU47 eint EA-1 / EI-1: CLI help", () => {
  const main = mainHelp("prop");

  it("lists the HDRI optimize mode with --file/--out (help and the prd05 verb usage)", () => {
    expect(main).toContain("aura3d assets optimize --hdri <1k|2k> [--rgb9e5-cube] --file in.hdr --out out_1k.hdr [--json]");
    expect(cliCommandFor("assets optimize")?.usage).toContain("aura3d assets optimize --file in.hdr --out out_1k.hdr --hdri 1k|2k [--rgb9e5-cube] [--json]");
  });

  it("lists every certify category the verb accepts", () => {
    const categories = CERTIFY_CATEGORIES.join("|");
    expect(categories).toBe("racing|platformer|sports|fighting|arena|puzzle");
    expect(main).toContain(`aura3d assets certify-game-geometry --asset <id> --category ${categories}`);
    expect(main).toContain(`aura3d assets certify-game-geometry --assets <id,id,...> --category ${categories}`);
  });
});
