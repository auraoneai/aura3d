// PRD-07 P1-T19 — lane CLI commands and codemods (C-39).

import { registerCliCommand, registerCodemod } from "../../contracts/commands";

export function registerPrd07Cli(): void {
  try {
    registerCliCommand({
      name: "vfx validate-atlas",
      owner: "prd07",
      summary: "Check a flipbook atlas JSON against the frame-grid contract",
      usage: "aura3d vfx validate-atlas <atlas.json>",
      async run(argv, io) {
        const file = argv[0];
        if (!file) {
          io.stderr("usage: aura3d vfx validate-atlas <atlas.json>");
          return 2;
        }
        try {
          const raw = await import("node:fs/promises").then((m) => m.readFile(`${io.cwd}/${file}`, "utf8"));
          const atlas = JSON.parse(raw) as { columns?: number; rows?: number; frames?: number };
          const errors: string[] = [];
          if (!Number.isInteger(atlas.columns) || (atlas.columns ?? 0) < 1) errors.push("columns must be an integer >= 1");
          if (!Number.isInteger(atlas.rows) || (atlas.rows ?? 0) < 1) errors.push("rows must be an integer >= 1");
          if (atlas.frames !== undefined && atlas.frames > (atlas.columns ?? 0) * (atlas.rows ?? 0)) errors.push("frames exceeds columns*rows");
          if (errors.length) {
            for (const e of errors) io.stderr(`invalid atlas: ${e}`);
            return 1;
          }
          io.stdout(`atlas ok: ${atlas.columns}x${atlas.rows} (${atlas.frames ?? atlas.columns! * atlas.rows!} frames)`);
          return 0;
        } catch (error) {
          io.stderr(`atlas read failed: ${(error as Error).message}`);
          return 1;
        }
      }
    });
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("CLI_COMMAND_DUPLICATE"))) throw error;
  }

  try {
    registerCodemod({
      name: "vfx-pools-to-effects",
      owner: "prd07",
      description: "Rewrite effects.spawnLoop(pool) calls to effects.spawn(preset) per the §6.7 table",
      transform(source) {
        const rows: { file: string; line: number; construct: string; mapping: "exact" | "approximate" | "none"; target?: string; note?: string }[] = [];
        let code = source;
        const re = /effects\.spawnLoop\s*\(\s*([^,)]+)/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(code))) {
          const line = code.slice(0, match.index).split("\n").length;
          rows.push({ file: "", line, construct: match[0], mapping: "approximate", target: `effects.spawn(${match[1].trim()}`, note: "loop lifetime: move to spawned-instance handle.stop()" });
        }
        code = code.replace(/effects\.spawnLoop\s*\(/g, "effects.spawn(");
        return { code, rows };
      }
    });
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("CODEMOD_DUPLICATE"))) throw error;
  }
}
