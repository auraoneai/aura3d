import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
const rows = [];
rmSync("out", { recursive: true, force: true }); mkdirSync("out");
for (const entry of ["entry-root", "entry-physics", "entry-game"]) for (const format of ["esm", "iife"]) for (const target of ["es2020", "es2022", "esnext"]) for (const splitting of format === "esm" ? [false, true] : [false]) {
  const name = `${entry}.${format}.${target}.${splitting ? "split" : "single"}`;
  const outdir = `out/${name}`;
  let status = "ok", detail = "";
  try {
    await build({ entryPoints: [`src/${entry}.mjs`], bundle: true, format, target, splitting, outdir, outExtension: { ".js": format === "esm" ? ".mjs" : ".js" }, logLevel: "silent", external: ["node:fs", "node:path", "node:fs/promises", "node:url", "node:module", "@dimforge/rapier3d-compat", "recast-navigation"] });
    if (format === "esm") {
      try { execFileSync("node", ["--check", `${outdir}/${entry}.mjs`], { stdio: "pipe" }); } catch (e) { status = "SYNTAX"; detail = String(e.stderr).split("\n").find((l) => /Error/.test(l)) ?? ""; }
    }
  } catch (e) { status = "BUILD-ERROR"; detail = (e.errors?.[0]?.text ?? String(e)).slice(0, 140); }
  rows.push(`${status.padEnd(12)} ${name}  ${detail}`);
}
console.log(rows.join("\n"));
