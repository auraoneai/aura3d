// Copies the neutrality frames into evidence/physics-514/neutrality and writes frames.json (sha256 of every captured frame, the
// capture metadata, and the pixel diffs). Byte-identical frames are stored once; the manifest lists every frame's hash.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const W = "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_37e6949c-ca0-1";
const D = path.join(W, "evidence/physics-514/neutrality");
const F = "/tmp/fx517-phys2/frames";
const games = ["showcase-bank-shot", "showcase-slingshot-siege", "showcase-blockfall-reactor", "showcase-aurora-lander", "showcase-roadster-rush", "showcase-teleoperator"];
fs.mkdirSync(D, { recursive: true });
const diffs = JSON.parse(fs.readFileSync("/tmp/fx517-phys2/pixdiff-final.json", "utf8"));
const frames = {};
const stored = new Map();
for (const g of [...games, "recipe16"]) {
  frames[g] = {};
  for (const v of ["base", "branch"]) for (const s of ["a", "b"]) {
    const name = `${v}-${g}-${s}`;
    const png = fs.readFileSync(path.join(F, `${name}.png`));
    const hash = crypto.createHash("sha256").update(png).digest("hex");
    const meta = JSON.parse(fs.readFileSync(path.join(F, `${name}.json`), "utf8"));
    if (!stored.has(hash)) { stored.set(hash, `${name}.png`); fs.writeFileSync(path.join(D, `${name}.png`), png); }
    frames[g][`${v}-${s}`] = { sha256: hash, storedAs: stored.get(hash), info: meta.info ?? { recipe: meta.recipe }, errors: meta.errors ?? [...(meta.consoleErrors ?? []), ...(meta.exceptions ?? [])] };
  }
}
fs.writeFileSync(path.join(D, "frames.json"), JSON.stringify({ frames, pixelDiffs: diffs }, null, 1) + "\n");
console.log("stored", stored.size, "unique frames");
