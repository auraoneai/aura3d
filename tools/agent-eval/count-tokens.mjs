#!/usr/bin/env node
// Count real input tokens of text files with the trial model through Prism (max_tokens 1, one call per file).
//   node tools/agent-eval/count-tokens.mjs file...
import { readFileSync } from "node:fs";
import { DEFAULT_MODEL, createPrismClient, loadKey } from "./lib/prism.mjs";

const client = createPrismClient({ key: loadKey() });
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, "utf8");
  const response = await client.messages({ model: DEFAULT_MODEL, max_tokens: 1, messages: [{ role: "user", content: text }] }, { jobType: "token-count" });
  const u = response.usage ?? {};
  console.log(`${file}\t${text.length} chars\t${(u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)} tokens`);
}
