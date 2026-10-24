// Token counter for the reading path. Usage: node docs/audit/scripts/tokens.mjs <file...>
// Uses gpt-tokenizer o200k_base if it resolves (npm i gpt-tokenizer in a temp dir and set NODE_PATH), else bytes/4.
import fs from "node:fs";
import { createRequire } from "node:module";
let encode = null;
try { encode = createRequire(process.env.TOKENIZER_DIR ? process.env.TOKENIZER_DIR + "/" : import.meta.url)("gpt-tokenizer/encoding/o200k_base").encode; } catch {}
let total = 0;
for (const f of process.argv.slice(2)) {
  const s = fs.readFileSync(f, "utf8");
  const t = encode ? encode(s).length : Math.ceil(Buffer.byteLength(s) / 4);
  total += t;
  console.log(String(t).padStart(7), f);
}
console.log(String(total).padStart(7), `TOTAL (${encode ? "o200k_base" : "bytes/4 estimate"})`);
